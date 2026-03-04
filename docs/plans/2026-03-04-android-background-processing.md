# Android Background Processing -- Plano de Implementacao

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Garantir que o processamento de audio (STT + refinamento) continue mesmo quando a tela do Android bloqueia.

**Arquitetura:** Adicionar um Android Foreground Service que executa o HTTP request para o sidecar independentemente do WebView. O frontend dispara o processamento via IPC Tauri -> Rust -> Kotlin (Foreground Service). O service faz o request HTTP, guarda o resultado, e notifica o frontend via evento Tauri quando termina. Se o WebView estava suspenso, ele recebe o resultado ao retomar.

**Tech Stack:** Kotlin (Android Foreground Service, OkHttp), Rust (plugin Tauri mobile bridge), React/TypeScript (eventos Tauri)

**Problema atual:** O `proxy_fetch` (Rust reqwest dentro do app) e o WebView JS sao suspensos pelo Android quando a tela bloqueia. O sidecar na VM termina o processamento mas a resposta HTTP se perde porque o socket TCP no celular esta congelado.

---

## Visao Geral das Tarefas

| Task | Descricao | Camada |
|------|-----------|--------|
| 1 | Foreground Service Kotlin | Android nativo |
| 2 | Plugin Tauri mobile (Rust <-> Kotlin bridge) | Rust + Kotlin |
| 3 | Refatorar frontend para usar eventos | React/TypeScript |
| 4 | Permissoes e manifesto Android | Config |
| 5 | Testes e validacao | Cross-stack |

---

### Task 1: Foreground Service Kotlin

**Files:**
- Create: `src-tauri/gen/android/app/src/main/java/com/proatt/machine/AudioProcessingService.kt`

**Context:** Um Foreground Service e um componente Android que exibe uma notificacao persistente e diz ao OS "estou fazendo trabalho -- nao me suspenda". Apps de musica, GPS e download usam isso. O Android permite que o processo continue rodando mesmo com tela bloqueada.

**Step 1: Criar o Foreground Service**

```kotlin
package com.proatt.machine

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class AudioProcessingService : Service() {

    companion object {
        const val TAG = "AudioProcessingService"
        const val CHANNEL_ID = "audio_processing"
        const val NOTIFICATION_ID = 1001
        const val ACTION_PROCESS = "com.proatt.machine.PROCESS_AUDIO"
        const val ACTION_STOP = "com.proatt.machine.STOP_PROCESSING"

        // Resultado do ultimo processamento (acessivel via companion)
        @Volatile var lastResult: String? = null
        @Volatile var lastError: String? = null
        @Volatile var isProcessing: Boolean = false

        fun startProcessing(context: Context, requestBody: String, sidecarUrl: String) {
            val intent = Intent(context, AudioProcessingService::class.java).apply {
                action = ACTION_PROCESS
                putExtra("request_body", requestBody)
                putExtra("sidecar_url", sidecarUrl)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }

    private val executor = Executors.newSingleThreadExecutor()
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PROCESS -> {
                val body = intent.getStringExtra("request_body") ?: return START_NOT_STICKY
                val url = intent.getStringExtra("sidecar_url") ?: return START_NOT_STICKY

                startForeground(NOTIFICATION_ID, buildNotification("Processando audio..."))
                acquireWakeLock()

                isProcessing = true
                lastResult = null
                lastError = null

                executor.execute {
                    try {
                        val result = doHttpPost(url, body)
                        lastResult = result
                        lastError = null
                        Log.i(TAG, "Processamento concluido (${result.length} bytes)")
                    } catch (e: Exception) {
                        lastResult = null
                        lastError = e.message ?: "Erro desconhecido"
                        Log.e(TAG, "Erro no processamento", e)
                    } finally {
                        isProcessing = false
                        releaseWakeLock()
                        stopForeground(STOP_FOREGROUND_REMOVE)
                        stopSelf()
                    }
                }
            }
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    private fun doHttpPost(urlStr: String, body: String): String {
        val url = URL(urlStr)
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.connectTimeout = 15_000       // 15s connect
        conn.readTimeout = 300_000         // 5min read (whisper + claude)
        conn.doOutput = true

        OutputStreamWriter(conn.outputStream).use { it.write(body) }

        val status = conn.responseCode
        if (status >= 400) {
            val error = conn.errorStream?.bufferedReader()?.readText() ?: "HTTP $status"
            throw RuntimeException("HTTP $status: $error")
        }

        return conn.inputStream.bufferedReader().readText()
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "ProATT::AudioProcessing"
        ).apply {
            acquire(10 * 60 * 1000L)  // Max 10 minutos
        }
        Log.i(TAG, "WakeLock adquirido")
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
                Log.i(TAG, "WakeLock liberado")
            }
        }
        wakeLock = null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Processamento de Audio",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notificacao durante processamento de audio"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Pro ATT Machine")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .build()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        releaseWakeLock()
        executor.shutdownNow()
        super.onDestroy()
    }
}
```

**Step 2: Commit**

```bash
git add src-tauri/gen/android/app/src/main/java/com/proatt/machine/AudioProcessingService.kt
git commit -m "feat(android): add Foreground Service para processamento em background"
```

---

### Task 2: Plugin Tauri mobile (Rust <-> Kotlin bridge)

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/gen/android/app/src/main/java/com/proatt/machine/MainActivity.kt`

**Context:** No Tauri Android, comandos `#[tauri::command]` rodam no processo do app. Precisamos de dois novos comandos: `start_background_processing` (inicia o Foreground Service via JNI) e `get_processing_result` (le o resultado do companion object). O approach mais simples e usar `tauri::plugin::mobile` para invocar metodos Kotlin.

**NOTA IMPORTANTE:** Tauri 2.x expoe `run_mobile_plugin` para chamar codigo Kotlin/Swift a partir de comandos Rust. Alternativa mais simples: os comandos Rust podem ser stubs que o frontend chama, e o frontend usa `invoke` + o plugin `@tauri-apps/api` para chamar diretamente. Mas como no Android o `invoke` passa pelo mesmo processo, a abordagem correta e o Foreground Service ser iniciado via `startActivity`/`startService` do contexto Android.

**Step 1: Adicionar comandos Rust para mobile**

Adicionar ao `lib.rs`, no bloco `#[cfg(mobile)] mod sidecar`:

```rust
// Novo comando: dispara processamento em background via Foreground Service
#[tauri::command]
async fn start_background_processing(
    app: tauri::AppHandle,
    request_body: String,
    sidecar_url: String,
) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        app.run_on_android_context(move |ctx| {
            // Chama AudioProcessingService.startProcessing via JNI
            // ctx e o android.content.Context
            let env = ctx.env();
            // ... JNI call to start service
        });
        Ok("started".to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        Err("Background processing only available on Android".to_string())
    }
}

// Novo comando: busca resultado do ultimo processamento
#[tauri::command]
async fn get_processing_result() -> Result<Option<String>, String> {
    // Le do companion object AudioProcessingService
    // Retorna None se ainda processando, Some(json) se pronto
    Ok(None) // Placeholder
}
```

**NOTA:** A implementacao JNI exata depende da API do Tauri 2.x para Android. Alternativa mais pragmatica: usar `tauri::api::process::Command` ou diretamente o plugin mobile do Tauri. Precisa de investigacao no momento da implementacao.

**Step 2: Alternativa pragmatica -- WebView bridge direto**

Se o JNI do Tauri for complexo demais, a alternativa e:

1. No `MainActivity.kt`, expor um `@JavascriptInterface` que o WebView chama
2. O WebView chama `Android.startProcessing(body, url)` via JS bridge nativo
3. O `MainActivity` inicia o `AudioProcessingService`
4. Quando o service termina, chama `webView.evaluateJavascript("window.__onProcessingComplete(result)")`

```kotlin
// MainActivity.kt
package com.proatt.machine

import android.webkit.JavascriptInterface
import android.webkit.WebView

class MainActivity : TauriActivity() {

    // Expor bridge para JS (se necessario como fallback ao Tauri plugin mobile)
    inner class AndroidBridge(private val webView: WebView) {
        @JavascriptInterface
        fun startProcessing(requestBody: String, sidecarUrl: String) {
            AudioProcessingService.startProcessing(
                this@MainActivity,
                requestBody,
                sidecarUrl
            )
            // Poll resultado em thread separada
            Thread {
                while (AudioProcessingService.isProcessing) {
                    Thread.sleep(500)
                }
                val result = AudioProcessingService.lastResult
                val error = AudioProcessingService.lastError
                val js = if (result != null) {
                    "window.__onProcessingComplete(${result})"
                } else {
                    "window.__onProcessingError('${error?.replace("'", "\\'")}')"
                }
                webView.post { webView.evaluateJavascript(js, null) }
            }.start()
        }

        @JavascriptInterface
        fun getProcessingStatus(): String {
            return when {
                AudioProcessingService.isProcessing -> "processing"
                AudioProcessingService.lastResult != null -> "completed"
                AudioProcessingService.lastError != null -> "error"
                else -> "idle"
            }
        }
    }
}
```

**Step 3: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/gen/android/app/src/main/java/com/proatt/machine/MainActivity.kt
git commit -m "feat(android): bridge Rust/Kotlin para Foreground Service"
```

---

### Task 3: Refatorar frontend para usar o service

**Files:**
- Modify: `src/hooks/useAudioProcessing.ts`
- Modify: `src/services/VoiceAIClient.ts`

**Context:** No Android, em vez de `safeFetch` -> `proxy_fetch` (que e suspenso com o app), o frontend deve chamar o Foreground Service e ouvir o resultado via callback.

**Step 1: Adicionar deteccao de plataforma e bridge Android**

Em `VoiceAIClient.ts`, adicionar:

```typescript
// Bridge Android nativo (Foreground Service)
function hasAndroidBridge(): boolean {
    return isAndroid && typeof (window as any).Android?.startProcessing === 'function';
}

async function androidBackgroundFetch(url: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
        // Callbacks globais que o Kotlin chama via evaluateJavascript
        (window as any).__onProcessingComplete = (result: any) => {
            delete (window as any).__onProcessingComplete;
            delete (window as any).__onProcessingError;
            resolve(typeof result === 'string' ? result : JSON.stringify(result));
        };
        (window as any).__onProcessingError = (error: string) => {
            delete (window as any).__onProcessingComplete;
            delete (window as any).__onProcessingError;
            reject(new Error(error));
        };

        // Dispara o Foreground Service
        (window as any).Android.startProcessing(body, url);
    });
}
```

**Step 2: Modificar `safeFetch` para usar bridge no Android**

```typescript
async function safeFetch(
    url: string,
    init?: RequestInit & { signal?: AbortSignal }
): Promise<Response> {
    if (isAndroid && hasAndroidBridge() && init?.method === 'POST') {
        // Usa Foreground Service -- sobrevive a tela bloqueada
        const body = init.body ? String(init.body) : '';
        const text = await androidBackgroundFetch(url, body);
        return new Response(text, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    if (isAndroid) {
        // Fallback: proxy IPC (atual, suspenso com tela)
        return proxyFetch(url, init);
    }
    try {
        return await tauriFetch(url, init);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[safeFetch] tauriFetch failed (${msg}), trying native fetch`);
        return await fetch(url, init);
    }
}
```

**Step 3: Remover WakeLock web (substituido pelo nativo)**

Em `useAudioProcessing.ts`, remover as funcoes `acquireWakeLock` e `releaseWakeLock` e suas chamadas no `processAudio`. O WakeLock nativo do Foreground Service substitui completamente.

**Step 4: Commit**

```bash
git add src/services/VoiceAIClient.ts src/hooks/useAudioProcessing.ts
git commit -m "feat(android): frontend usa Foreground Service para processamento"
```

---

### Task 4: Permissoes e manifesto Android

**Files:**
- Modify: `src-tauri/gen/android/app/src/main/AndroidManifest.xml`

**Step 1: Adicionar permissoes e declarar service**

```xml
<!-- Adicionar permissoes (antes de <application>) -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- Adicionar dentro de <application>, apos </activity> -->
<service
    android:name=".AudioProcessingService"
    android:exported="false"
    android:foregroundServiceType="dataSync" />
```

**Step 2: Commit**

```bash
git add src-tauri/gen/android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): permissoes para Foreground Service e WakeLock"
```

---

### Task 5: Testes e validacao

**Step 1: Build Android debug**

```bash
cd /home/opc/ELCO-machina
bun run tauri android build --debug --target aarch64
```

Expected: Build sucesso, APK gerado.

**Step 2: Instalar no dispositivo e testar**

1. Instalar APK no Galaxy S24 Ultra
2. Gravar audio (~30s)
3. Iniciar processamento
4. **Bloquear a tela imediatamente**
5. Esperar 1-2 minutos
6. Desbloquear
7. Verificar: resultado deve estar presente no editor

**Step 3: Verificar notificacao**

Durante o processamento (passo 4), a notificacao "Processando audio..." deve aparecer na barra de notificacoes, mesmo com tela bloqueada.

**Step 4: Verificar logs**

```bash
adb logcat -s AudioProcessingService:* | head -50
```

Expected: Logs de WakeLock adquirido, HTTP POST, resposta recebida, WakeLock liberado.

---

## Riscos e decisoes pendentes

| Risco | Mitigacao |
|-------|----------|
| `run_on_android_context` do Tauri pode nao expor JNI facilmente | Usar `@JavascriptInterface` bridge como fallback (Task 2 alternativa) |
| `foregroundServiceType="dataSync"` pode ser rejeitado no Google Play | Alternativa: `"shortService"` (max 3min) ou `"specialUse"` |
| WebView bridge (`evaluateJavascript`) pode nao funcionar com WebView suspenso | O polling no thread Kotlin espera o WebView retomar; resultado persiste no companion |
| Timeout de 5min no HTTP pode ser insuficiente para audios longos | Configuravel; aumentar se necessario |

## Abordagem recomendada para Task 2

A **alternativa pragmatica** (`@JavascriptInterface` + `evaluateJavascript`) e mais simples e testavel que JNI via Tauri plugin mobile. Recomendo comecar por ela e migrar para plugin Tauri formal depois se necessario.
