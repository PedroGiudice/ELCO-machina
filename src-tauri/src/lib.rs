// ============================================================
// Comandos stub para desktop (sidecar roda como servico remoto)
// ============================================================

#[cfg(desktop)]
mod audio;

#[cfg(desktop)]
mod sidecar {
    /// Comando Tauri: iniciar sidecar (stub - servico roda na VM)
    #[tauri::command]
    pub async fn start_sidecar() -> Result<String, String> {
        // Sidecar roda como servico na VM, nao gerenciado localmente
        Ok("remote_service".to_string())
    }

    /// Comando Tauri: parar sidecar (stub - servico roda na VM)
    #[tauri::command]
    pub async fn stop_sidecar() -> Result<(), String> {
        Ok(())
    }

    /// Comando Tauri: verificar status do sidecar (stub - servico roda na VM)
    #[tauri::command]
    pub async fn sidecar_status() -> Result<bool, String> {
        // Sempre retorna true - o servico na VM deve estar rodando
        Ok(true)
    }

    /// Comando Tauri: definir URL do servidor Whisper remoto (stub - sempre remoto)
    #[tauri::command]
    pub async fn set_whisper_url(_url: Option<String>) -> Result<(), String> {
        Ok(())
    }

    /// Comando Tauri: verificar se esta usando servidor remoto (stub - sempre remoto)
    #[tauri::command]
    pub async fn is_remote_whisper() -> Result<bool, String> {
        // Sempre remoto agora
        Ok(true)
    }
}

// ============================================================
// Comandos stub para mobile (sidecar nao disponivel)
// ============================================================

#[cfg(mobile)]
mod sidecar {
    /// Comando Tauri: iniciar sidecar (stub para mobile)
    #[tauri::command]
    pub async fn start_sidecar() -> Result<String, String> {
        // Sidecar nao disponivel no mobile
        Err("Sidecar not available on mobile".to_string())
    }

    /// Comando Tauri: parar sidecar (stub para mobile)
    #[tauri::command]
    pub async fn stop_sidecar() -> Result<(), String> {
        Ok(())
    }

    /// Comando Tauri: verificar status do sidecar (stub para mobile)
    #[tauri::command]
    pub async fn sidecar_status() -> Result<bool, String> {
        Ok(false)
    }

    /// Comando Tauri: definir URL do servidor Whisper remoto (stub para mobile)
    #[tauri::command]
    pub async fn set_whisper_url(_url: Option<String>) -> Result<(), String> {
        // Mobile sempre usa servidor remoto, nao precisa gerenciar estado aqui
        Ok(())
    }

    /// Comando Tauri: verificar se esta usando servidor remoto (stub para mobile)
    #[tauri::command]
    pub async fn is_remote_whisper() -> Result<bool, String> {
        // Mobile sempre usa servidor remoto
        Ok(true)
    }
}

// ============================================================
// Entry point principal
// ============================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_mic_recorder::init())
        .plugin(tauri_plugin_opener::init());

    // Desktop: comandos de áudio CPAL + sidecar stubs
    #[cfg(desktop)]
    {
        builder = builder
            .manage(audio::AudioState::new())
            .invoke_handler(tauri::generate_handler![
                sidecar::start_sidecar,
                sidecar::stop_sidecar,
                sidecar::sidecar_status,
                sidecar::set_whisper_url,
                sidecar::is_remote_whisper,
                audio::enumerate_audio_devices,
                audio::start_audio_recording,
                audio::stop_audio_recording
            ]);
    }

    // Mobile: apenas sidecar stubs (áudio via mic-recorder plugin)
    #[cfg(mobile)]
    {
        builder = builder
            .invoke_handler(tauri::generate_handler![
                sidecar::start_sidecar,
                sidecar::stop_sidecar,
                sidecar::sidecar_status,
                sidecar::set_whisper_url,
                sidecar::is_remote_whisper,
            ]);
    }

    // Plugins que so funcionam no desktop
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_shell::init())
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    // MCP Bridge plugin (desktop only - expoe porta 9223 para inspecao remota)
    #[cfg(desktop)]
    {
        log::info!("Inicializando MCP Bridge plugin...");
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
        log::info!("MCP Bridge plugin adicionado ao builder");
    }

    builder
        .setup(move |app| {
            // Plugin de log (apenas em debug ou Android para debug)
            if cfg!(debug_assertions) || cfg!(target_os = "android") {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
