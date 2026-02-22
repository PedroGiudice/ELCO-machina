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
        Ok(())
    }

    /// Comando Tauri: verificar se esta usando servidor remoto (stub para mobile)
    #[tauri::command]
    pub async fn is_remote_whisper() -> Result<bool, String> {
        Ok(true)
    }
}

/// Proxy HTTP via Rust -- contorna restricao de Private Network Access do WebView Android
#[tauri::command]
async fn proxy_fetch(url: String, method: String, body: Option<String>) -> Result<String, String> {
    let body_len = body.as_ref().map(|b| b.len()).unwrap_or(0);
    log::info!("[proxy_fetch] {} {} (body: {} bytes)", method, url, body_len);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .connect_timeout(std::time::Duration::from_secs(10))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| {
            log::error!("[proxy_fetch] client build error: {e}");
            format!("client error: {e}")
        })?;

    let req = match method.to_uppercase().as_str() {
        "POST" => {
            let mut r = client.post(&url).header("Content-Type", "application/json");
            if let Some(b) = body {
                r = r.body(b);
            }
            r
        }
        _ => client.get(&url),
    };

    let resp = req.send().await.map_err(|e| {
        log::error!("[proxy_fetch] send error: {e:?}");
        format!("request error: {e}")
    })?;

    let status = resp.status().as_u16();
    log::info!("[proxy_fetch] response status: {}", status);
    let text = resp.text().await.map_err(|e| format!("body error: {e}"))?;

    if status >= 400 {
        log::error!("[proxy_fetch] HTTP {}: {}", status, &text[..text.len().min(200)]);
        return Err(format!("HTTP {status}: {text}"));
    }
    Ok(text)
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init());

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
                proxy_fetch,
                audio::enumerate_audio_devices,
                audio::start_audio_recording,
                audio::stop_audio_recording
            ]);
    }

    // Mobile: sidecar stubs + proxy_fetch (contorna Private Network Access)
    #[cfg(mobile)]
    {
        builder = builder
            .invoke_handler(tauri::generate_handler![
                sidecar::start_sidecar,
                sidecar::stop_sidecar,
                sidecar::sidecar_status,
                sidecar::set_whisper_url,
                sidecar::is_remote_whisper,
                proxy_fetch,
            ]);
    }

    // Plugins que so funcionam no desktop
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_mic_recorder::init())
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
