package com.proatt.machine

import android.webkit.JavascriptInterface
import android.webkit.WebView
import java.util.concurrent.TimeUnit

class MainActivity : TauriActivity() {

    @Volatile
    private var webView: WebView? = null

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        this.webView = webView
        webView.addJavascriptInterface(AudioBridge(), "NativeAudio")
    }

    /**
     * Bridge JS <-> Android nativo para processamento de audio em background.
     *
     * O frontend chama window.NativeAudio.startProcessing(body, url)
     * O Foreground Service processa e notifica de volta via evaluateJavascript.
     */
    inner class AudioBridge {

        @JavascriptInterface
        fun startProcessing(requestBody: String, sidecarUrl: String): Boolean {
            val started = AudioProcessingService.startProcessing(
                this@MainActivity,
                requestBody,
                sidecarUrl
            )

            if (!started) return false

            // Aguarda conclusao via latch (com timeout) em vez de polling
            Thread {
                val latch = AudioProcessingService.completionLatch
                val completed = latch?.await(10, TimeUnit.MINUTES) ?: false

                if (!completed) {
                    // Timeout: Service demorou mais de 10 min
                    AudioProcessingService.resetState()
                }

                val result = AudioProcessingService.lastResult
                val error = AudioProcessingService.lastError

                val wv = webView ?: return@Thread

                wv.post {
                    if (result != null) {
                        // result ja e JSON valido do sidecar -- passar direto
                        wv.evaluateJavascript(
                            "window.__onProcessingComplete && window.__onProcessingComplete($result)",
                            null
                        )
                    } else {
                        val escapedError = (error ?: "Erro desconhecido")
                            .replace("\\", "\\\\")
                            .replace("'", "\\'")
                        wv.evaluateJavascript(
                            "window.__onProcessingError && window.__onProcessingError('$escapedError')",
                            null
                        )
                    }
                }
            }.start()

            return true
        }

        @JavascriptInterface
        fun getStatus(): String {
            return when {
                AudioProcessingService.isProcessing -> "processing"
                AudioProcessingService.lastResult != null -> "completed"
                AudioProcessingService.lastError != null -> "error"
                else -> "idle"
            }
        }

        @JavascriptInterface
        fun getResult(): String? {
            return AudioProcessingService.lastResult
        }

        @JavascriptInterface
        fun getError(): String? {
            return AudioProcessingService.lastError
        }
    }
}
