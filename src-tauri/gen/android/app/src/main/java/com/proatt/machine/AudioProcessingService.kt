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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Foreground Service para processamento de audio em background.
 *
 * Garante que o HTTP request para o sidecar (Whisper + Claude) continue
 * executando mesmo quando a tela do Android bloqueia. Usa:
 * - PARTIAL_WAKE_LOCK: impede suspensao da CPU
 * - Foreground notification: impede que o OS mate o service
 *
 * O resultado fica armazenado no companion object ate ser consumido
 * pelo frontend via bridge NativeAudio no MainActivity.
 */
class AudioProcessingService : Service() {

    companion object {
        const val TAG = "AudioProcessingSvc"
        const val CHANNEL_ID = "audio_processing"
        const val NOTIFICATION_ID = 1001
        const val ACTION_PROCESS = "com.proatt.machine.PROCESS_AUDIO"

        @Volatile var lastResult: String? = null
        @Volatile var lastError: String? = null
        @Volatile var isProcessing: Boolean = false

        /** Latch sinalizado quando o processamento termina. */
        var completionLatch: CountDownLatch? = null
            private set

        /**
         * Inicia processamento em background via Foreground Service.
         * Rejeita chamada se ja ha processamento em andamento.
         *
         * @return true se iniciou, false se ja estava processando
         */
        @Synchronized
        fun startProcessing(context: Context, requestBody: String, sidecarUrl: String): Boolean {
            if (isProcessing) {
                Log.w(TAG, "Processamento ja em andamento, rejeitando nova chamada")
                return false
            }

            lastResult = null
            lastError = null
            isProcessing = true
            completionLatch = CountDownLatch(1)

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
            return true
        }

        /** Reseta estado para idle (usado quando Service e morto pelo OS). */
        @Synchronized
        fun resetState() {
            isProcessing = false
            lastError = "Service interrompido pelo sistema"
            completionLatch?.countDown()
        }
    }

    private val executor = Executors.newSingleThreadExecutor()
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action != ACTION_PROCESS) {
            stopSelf()
            return START_NOT_STICKY
        }

        val body = intent.getStringExtra("request_body")
        val url = intent.getStringExtra("sidecar_url")

        if (body == null || url == null) {
            isProcessing = false
            lastError = "Missing request_body or sidecar_url"
            completionLatch?.countDown()
            stopSelf()
            return START_NOT_STICKY
        }

        startForeground(NOTIFICATION_ID, buildNotification("Processando audio..."))
        acquireWakeLock()

        executor.execute {
            try {
                Log.i(TAG, "Iniciando POST para $url (body: ${body.length} bytes)")
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
                completionLatch?.countDown()
                releaseWakeLock()
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
        conn.connectTimeout = 30_000     // 30s connect (Tailscale cold start)
        conn.readTimeout = 300_000       // 5 min (whisper + claude)
        conn.doOutput = true

        OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(body) }

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
        resetState()
        releaseWakeLock()
        executor.shutdownNow()
        super.onDestroy()
    }
}
