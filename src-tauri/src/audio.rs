use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample};
use hound::{SampleFormat, WavSpec, WavWriter};
use std::fs::{create_dir_all, File};
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Manager, Runtime, State};

type WavWriterHandle = Arc<Mutex<Option<WavWriter<BufWriter<File>>>>>;

struct SafeStream(cpal::Stream);
unsafe impl Send for SafeStream {}
unsafe impl Sync for SafeStream {}

pub struct AudioState {
    is_recording: AtomicBool,
    stream: Mutex<Option<SafeStream>>,
    writer: WavWriterHandle,
    save_path: Mutex<Option<PathBuf>>,
    samples_written: AtomicU64,
}

impl AudioState {
    pub fn new() -> Self {
        Self {
            is_recording: AtomicBool::new(false),
            stream: Mutex::new(None),
            writer: Arc::new(Mutex::new(None)),
            save_path: Mutex::new(None),
            samples_written: AtomicU64::new(0),
        }
    }
}

#[derive(serde::Serialize)]
pub struct AudioDevice {
    pub id: String,
    pub label: String,
}

#[command]
pub async fn enumerate_audio_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();
    println!("[Audio] Host: {:?}", host.id());

    let devices = host.input_devices().map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for device in devices {
        if let Ok(desc) = device.description() {
            let name = desc.name().to_string();
            println!("[Audio] Dispositivo encontrado: {}", name);
            result.push(AudioDevice {
                id: name.clone(),
                label: name,
            });
        }
    }

    if result.is_empty() {
        println!("[Audio] AVISO: Nenhum dispositivo de entrada encontrado");
    } else {
        println!("[Audio] Total: {} dispositivos de entrada", result.len());
    }

    Ok(result)
}

#[command]
pub async fn start_audio_recording<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AudioState>,
    device_label: Option<String>,
) -> Result<(), String> {
    if state.is_recording.load(Ordering::SeqCst) {
        return Err("Recording is already in progress".to_string());
    }

    let host = cpal::default_host();

    let device = if let Some(ref label) = device_label {
        let mut devices = host.input_devices().map_err(|e| e.to_string())?;
        devices
            .find(|d| d.description().map(|desc| desc.name() == label.as_str()).unwrap_or(false))
            .ok_or_else(|| format!("Dispositivo nao encontrado: {}", label))?
    } else {
        host.default_input_device()
            .ok_or("Nenhum dispositivo de entrada padrao disponivel")?
    };

    let device_name = device.description().map(|d| d.name().to_string()).unwrap_or_else(|_| "desconhecido".into());
    println!("[Audio] Gravando com dispositivo: {}", device_name);

    let config = device
        .default_input_config()
        .map_err(|e| format!("Erro ao obter config do dispositivo: {}", e))?;

    println!(
        "[Audio] Config: {} canais, {}Hz, formato {:?}",
        config.channels(),
        config.sample_rate(),
        config.sample_format()
    );

    let spec = wav_spec_from_config(&config);
    let save_path = get_save_path(&app)?;
    println!("[Audio] Salvando em: {:?}", save_path);

    let writer = WavWriter::create(&save_path, spec)
        .map_err(|e| format!("Erro ao criar WAV: {}", e))?;

    // Armazenar writer no state
    {
        let mut w = state.writer.lock().map_err(|e| e.to_string())?;
        *w = Some(writer);
    }

    let writer_clone = state.writer.clone();
    state.samples_written.store(0, Ordering::SeqCst);
    let samples_counter = Arc::new(AtomicU64::new(0));
    let samples_for_stream = samples_counter.clone();

    let err_fn = move |err: cpal::StreamError| {
        eprintln!("[Audio] ERRO no stream: {}", err);
    };

    // Todos os formatos convertem para i16 (PCM 16-bit) na saída
    let stream = match config.sample_format() {
        cpal::SampleFormat::I8 => device.build_input_stream(
            &config.into(),
            move |data: &[i8], _: &_| {
                write_input_data::<i8, i16>(data, &writer_clone, &samples_for_stream)
            },
            err_fn,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &config.into(),
            move |data: &[i16], _: &_| {
                write_input_data::<i16, i16>(data, &writer_clone, &samples_for_stream)
            },
            err_fn,
            None,
        ),
        cpal::SampleFormat::I32 => device.build_input_stream(
            &config.into(),
            move |data: &[i32], _: &_| {
                write_input_data::<i32, i16>(data, &writer_clone, &samples_for_stream)
            },
            err_fn,
            None,
        ),
        cpal::SampleFormat::F32 => device.build_input_stream(
            &config.into(),
            move |data: &[f32], _: &_| {
                write_input_data::<f32, i16>(data, &writer_clone, &samples_for_stream)
            },
            err_fn,
            None,
        ),
        other => return Err(format!("Formato de sample nao suportado: {:?}", other)),
    }
    .map_err(|e| format!("Erro ao criar stream: {}", e))?;

    stream
        .play()
        .map_err(|e| format!("Erro ao iniciar stream: {}", e))?;

    state.is_recording.store(true, Ordering::SeqCst);
    state.samples_written.store(0, Ordering::SeqCst);

    {
        let mut s = state.stream.lock().map_err(|e| e.to_string())?;
        *s = Some(SafeStream(stream));
    }
    {
        let mut p = state.save_path.lock().map_err(|e| e.to_string())?;
        *p = Some(save_path);
    }

    println!("[Audio] Gravacao iniciada com sucesso");
    Ok(())
}

#[command]
pub async fn stop_audio_recording(state: State<'_, AudioState>) -> Result<String, String> {
    if !state.is_recording.load(Ordering::SeqCst) {
        return Err("Nenhuma gravacao em andamento".to_string());
    }

    // Parar stream primeiro (libera o writer)
    {
        let mut s = state.stream.lock().map_err(|e| e.to_string())?;
        if let Some(stream) = s.take() {
            drop(stream.0);
        }
    }

    // Finalizar writer
    {
        let mut w = state.writer.lock().map_err(|e| e.to_string())?;
        if let Some(writer) = w.take() {
            writer
                .finalize()
                .map_err(|e| format!("Erro ao finalizar WAV: {}", e))?;
        }
    }

    state.is_recording.store(false, Ordering::SeqCst);

    let samples = state.samples_written.load(Ordering::SeqCst);
    println!("[Audio] Gravacao finalizada. Samples escritos: {}", samples);

    let path = state
        .save_path
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("Caminho de gravacao nao definido")?;

    println!("[Audio] Arquivo: {:?}", path);
    Ok(path.to_string_lossy().into_owned())
}

fn get_save_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Erro ao obter diretorio do app: {}", e))?;
    let audio_dir = app_data.join("recordings");
    create_dir_all(&audio_dir).map_err(|e| format!("Erro ao criar diretorio: {}", e))?;
    let filename = format!(
        "{}.wav",
        chrono::Local::now().format("%Y%m%d_%H%M%S")
    );
    Ok(audio_dir.join(filename))
}

fn wav_spec_from_config(config: &cpal::SupportedStreamConfig) -> WavSpec {
    // Sempre gravar como 16-bit PCM (format tag 1) para máxima compatibilidade
    WavSpec {
        channels: config.channels() as _,
        sample_rate: config.sample_rate() as _,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    }
}

fn write_input_data<T, U>(
    input: &[T],
    writer: &WavWriterHandle,
    samples_counter: &AtomicU64,
) where
    T: Sample,
    U: Sample + hound::Sample + FromSample<T>,
{
    if let Ok(mut guard) = writer.try_lock() {
        if let Some(ref mut writer) = *guard {
            for &sample in input.iter() {
                let converted: U = U::from_sample(sample);
                writer.write_sample(converted).ok();
            }
            samples_counter.fetch_add(input.len() as u64, Ordering::Relaxed);
        }
    }
}
