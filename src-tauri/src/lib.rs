// ============================================================
// Codigo condicional para gerenciamento de sidecar (apenas desktop)
// ============================================================

#[cfg(desktop)]
mod sidecar {
    use std::sync::Arc;
    use std::time::Duration;
    use tauri::Manager;
    use tauri_plugin_shell::ShellExt;
    use tokio::sync::Mutex;
    use tokio::time::interval;

    /// Estado do sidecar compartilhado entre comandos Tauri
    pub struct SidecarManager {
        pub child: Arc<Mutex<Option<tauri_plugin_shell::process::CommandChild>>>,
        pub should_run: Arc<Mutex<bool>>,
    }

    impl SidecarManager {
        pub fn new() -> Self {
            Self {
                child: Arc::new(Mutex::new(None)),
                should_run: Arc::new(Mutex::new(true)),
            }
        }
    }

    /// Comando Tauri: iniciar sidecar manualmente
    #[tauri::command]
    pub async fn start_sidecar(
        app: tauri::AppHandle,
        state: tauri::State<'_, SidecarManager>,
    ) -> Result<String, String> {
        let mut child_guard = state.child.lock().await;

        // Se ja esta rodando, retorna ok
        if child_guard.is_some() {
            return Ok("already_running".to_string());
        }

        // Spawn do sidecar via shell plugin
        let shell = app.shell();
        let sidecar = shell
            .sidecar("voice-ai-sidecar")
            .map_err(|e| format!("Failed to create sidecar command: {}", e))?;

        let (mut rx, child) = sidecar
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

        // Spawn task para ler stdout/stderr (evita buffer cheio)
        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                        log::info!("[sidecar] {}", String::from_utf8_lossy(&line));
                    }
                    tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                        log::warn!("[sidecar] {}", String::from_utf8_lossy(&line));
                    }
                    tauri_plugin_shell::process::CommandEvent::Terminated(status) => {
                        log::info!("[sidecar] terminated with status: {:?}", status);
                        break;
                    }
                    _ => {}
                }
            }
        });

        *child_guard = Some(child);
        log::info!("[sidecar] Started via command");
        Ok("started".to_string())
    }

    /// Comando Tauri: parar sidecar
    #[tauri::command]
    pub async fn stop_sidecar(state: tauri::State<'_, SidecarManager>) -> Result<(), String> {
        let mut should_run = state.should_run.lock().await;
        *should_run = false;

        let mut child_guard = state.child.lock().await;
        if let Some(child) = child_guard.take() {
            child
                .kill()
                .map_err(|e| format!("Failed to kill sidecar: {}", e))?;
            log::info!("[sidecar] Stopped via command");
        }
        Ok(())
    }

    /// Comando Tauri: verificar status do sidecar
    #[tauri::command]
    pub async fn sidecar_status(state: tauri::State<'_, SidecarManager>) -> Result<bool, String> {
        let child_guard = state.child.lock().await;
        Ok(child_guard.is_some())
    }

    /// Health check via HTTP para verificar se sidecar esta respondendo
    pub async fn check_sidecar_health() -> bool {
        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
        {
            Ok(c) => c,
            Err(_) => return false,
        };

        client
            .get("http://127.0.0.1:8765/health")
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    /// Inicia o sidecar e retorna se foi bem sucedido
    pub async fn spawn_sidecar(app: &tauri::AppHandle, manager: &SidecarManager) -> bool {
        // Limpar child antigo se existir
        {
            let mut child = manager.child.lock().await;
            if let Some(c) = child.take() {
                let _ = c.kill();
            }
        }

        let shell = app.shell();
        let sidecar = match shell.sidecar("voice-ai-sidecar") {
            Ok(s) => s,
            Err(e) => {
                log::error!("[sidecar] Failed to create command: {}", e);
                return false;
            }
        };

        match sidecar.spawn() {
            Ok((mut rx, child)) => {
                // Log handler - consome stdout/stderr para evitar bloqueio
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        match event {
                            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                                log::info!("[sidecar] {}", String::from_utf8_lossy(&line));
                            }
                            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                                log::warn!("[sidecar] {}", String::from_utf8_lossy(&line));
                            }
                            tauri_plugin_shell::process::CommandEvent::Terminated(status) => {
                                log::info!("[sidecar] Process terminated: {:?}", status);
                                break;
                            }
                            _ => {}
                        }
                    }
                });

                let mut child_guard = manager.child.lock().await;
                *child_guard = Some(child);
                log::info!("[sidecar] Spawned successfully");
                true
            }
            Err(e) => {
                log::error!("[sidecar] Failed to spawn: {}", e);
                false
            }
        }
    }

    /// Loop de monitoramento com auto-restart
    pub async fn monitor_sidecar(app: tauri::AppHandle, manager: std::sync::Arc<SidecarManager>) {
        // Aguardar app inicializar antes de comecar
        tokio::time::sleep(Duration::from_millis(500)).await;

        // Primeira tentativa de iniciar o sidecar
        if spawn_sidecar(&app, &manager).await {
            log::info!("[sidecar] Initial spawn successful");
            // Aguardar sidecar ficar pronto (FastAPI precisa inicializar)
            tokio::time::sleep(Duration::from_secs(3)).await;
        } else {
            log::warn!("[sidecar] Initial spawn failed, will retry in monitor loop");
        }

        let mut check_interval = interval(Duration::from_secs(5));
        let mut consecutive_failures = 0;

        loop {
            check_interval.tick().await;

            let should_run = *manager.should_run.lock().await;
            if !should_run {
                log::info!("[sidecar] Monitor loop stopping (should_run = false)");
                break;
            }

            let is_healthy = check_sidecar_health().await;

            if is_healthy {
                consecutive_failures = 0;
            } else {
                consecutive_failures += 1;
                log::warn!(
                    "[sidecar] Health check failed ({} consecutive)",
                    consecutive_failures
                );

                // Reiniciar apos 2 falhas consecutivas (10 segundos sem resposta)
                if consecutive_failures >= 2 {
                    log::info!("[sidecar] Attempting restart...");

                    if spawn_sidecar(&app, &manager).await {
                        log::info!("[sidecar] Restarted successfully");
                        consecutive_failures = 0;
                        // Aguardar sidecar inicializar antes de proximo check
                        tokio::time::sleep(Duration::from_secs(3)).await;
                    } else {
                        log::error!("[sidecar] Restart failed");
                    }
                }
            }
        }
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
}

// ============================================================
// Entry point principal
// ============================================================

#[cfg(desktop)]
use std::sync::Arc;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    let manager = sidecar::SidecarManager::new();

    #[cfg(desktop)]
    let manager_arc = Arc::new(sidecar::SidecarManager {
        child: manager.child.clone(),
        should_run: manager.should_run.clone(),
    });

    #[cfg(desktop)]
    let monitor_manager = manager_arc.clone();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_mic_recorder::init())
        .invoke_handler(tauri::generate_handler![
            sidecar::start_sidecar,
            sidecar::stop_sidecar,
            sidecar::sidecar_status
        ]);

    // Registrar estado do sidecar apenas no desktop
    #[cfg(desktop)]
    {
        builder = builder.manage(manager);
    }

    builder
        .setup(move |app| {
            // Plugin de log (apenas em debug)
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Iniciar loop de monitoramento do sidecar (apenas desktop)
            #[cfg(desktop)]
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    sidecar::monitor_sidecar(app_handle, monitor_manager).await;
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Cleanup ao fechar janela principal (apenas desktop)
            #[cfg(desktop)]
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle();
                if let Some(manager) = app.try_state::<sidecar::SidecarManager>() {
                    tauri::async_runtime::block_on(async {
                        // Sinalizar para parar o monitor loop
                        let mut should_run = manager.should_run.lock().await;
                        *should_run = false;

                        // Matar o processo do sidecar
                        let mut child = manager.child.lock().await;
                        if let Some(c) = child.take() {
                            let _ = c.kill();
                            log::info!("[sidecar] Killed on app close");
                        }
                    });
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
