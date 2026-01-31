/**
 * VoiceAI Client - Abstrai chamadas ao sidecar Python
 *
 * Funcionalidades:
 * - Transcricao local via Faster-Whisper
 * - Refinamento opcional via Gemini
 * - Health check do sidecar
 * - Fallback para Gemini direto se sidecar indisponivel
 */

// Tipos de output disponiveis
export type OutputStyle =
  | "verbatim"
  | "elegant_prose"
  | "formal"
  | "casual"
  | "prompt"
  | "bullet_points"
  | "summary";

// Formatos de audio suportados
export type AudioFormat = "webm" | "wav" | "mp3" | "ogg" | "m4a";

// Request para transcricao
export interface TranscribeRequest {
  audio: string; // Base64 encoded
  format?: AudioFormat;
  language?: string | null; // null = auto-detect
  refine?: boolean;
  style?: OutputStyle;
}

// Segmento de transcricao
export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

// Response da transcricao
export interface TranscribeResponse {
  text: string;
  refined_text: string | null;
  language: string;
  confidence: number;
  duration: number;
  segments: TranscriptionSegment[];
  refine_success: boolean | null;
  refine_error: string | null;
}

// Response do health check
export interface HealthResponse {
  status: "healthy" | "degraded";
  version: string;
  models: {
    whisper: {
      status: "loaded" | "available" | "not_loaded";
      model: string | null;
    };
    xtts: {
      status: "loaded" | "available" | "not_implemented";
      model: string | null;
    };
  };
  error: string | null;
}

// Status do cliente
export interface ClientStatus {
  sidecarAvailable: boolean;
  lastCheck: Date | null;
  error: string | null;
}

/**
 * Cliente para o Voice AI Sidecar
 */
export class VoiceAIClient {
  private baseUrl: string;
  private timeout: number;
  private status: ClientStatus;

  /**
   * Cria instancia do cliente
   * @param baseUrl URL base do sidecar (default: http://localhost:8765)
   * @param timeout Timeout em ms para requests (default: 60000)
   */
  constructor(
    baseUrl: string = "http://localhost:8765",
    timeout: number = 60000
  ) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
    this.status = {
      sidecarAvailable: false,
      lastCheck: null,
      error: null,
    };
  }

  /**
   * Verifica status do sidecar
   */
  async health(): Promise<HealthResponse | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: HealthResponse = await response.json();

      this.status = {
        sidecarAvailable: data.status === "healthy",
        lastCheck: new Date(),
        error: data.error,
      };

      return data;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Erro desconhecido";

      this.status = {
        sidecarAvailable: false,
        lastCheck: new Date(),
        error: errorMsg,
      };

      return null;
    }
  }

  /**
   * Verifica se sidecar esta disponivel
   */
  async isAvailable(): Promise<boolean> {
    const health = await this.health();
    return health?.status === "healthy";
  }

  /**
   * Retorna status atual do cliente
   */
  getStatus(): ClientStatus {
    return { ...this.status };
  }

  /**
   * Transcreve audio usando o sidecar local
   *
   * @param request Dados da transcricao (audio base64, formato, idioma, etc)
   * @returns Transcricao com texto e metadados
   * @throws Error se sidecar nao disponivel ou erro na transcricao
   */
  async transcribe(request: TranscribeRequest): Promise<TranscribeResponse> {
    const body = {
      audio: request.audio,
      format: request.format || "webm",
      language: request.language ?? "pt",
      refine: request.refine || false,
      style: request.style || "verbatim",
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.detail || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data: TranscribeResponse = await response.json();
      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Timeout na transcricao. Tente com audio mais curto.");
      }

      throw error;
    }
  }

  /**
   * Converte Blob para base64
   */
  static async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove o prefixo "data:audio/...;base64,"
        const base64Data = base64.split(",")[1] || base64;
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Detecta formato do audio a partir do MIME type
   */
  static getFormatFromMimeType(mimeType: string): AudioFormat {
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("mp3") || mimeType.includes("mpeg")) return "mp3";
    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("m4a") || mimeType.includes("mp4")) return "m4a";
    return "webm"; // default
  }
}

// ============================================================
// Metodos para controle do sidecar via Tauri
// ============================================================

/**
 * Verifica se estamos rodando dentro do Tauri
 */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/**
 * Invoca comando Tauri de forma segura
 */
async function invokeCommand<T>(cmd: string): Promise<T | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(cmd);
  } catch (e) {
    console.error(`[VoiceAIClient] Failed to invoke ${cmd}:`, e);
    return null;
  }
}

/**
 * Garante que o sidecar esteja rodando
 * Usa auto-start do Rust, mas fornece fallback caso falhe
 *
 * @returns true se sidecar esta disponivel
 */
export async function ensureSidecarRunning(): Promise<boolean> {
  const client = getVoiceAIClient();

  // Primeiro verifica se ja esta disponivel
  if (await client.isAvailable()) {
    return true;
  }

  // Tenta iniciar via Tauri command
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<string>("start_sidecar");
      console.log("[VoiceAIClient] start_sidecar result:", result);
    } catch (e) {
      console.error("[VoiceAIClient] Failed to invoke start_sidecar:", e);
    }
  }

  // Aguardar ate 15s para sidecar ficar disponivel
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await client.isAvailable()) {
      console.log("[VoiceAIClient] Sidecar available after", (i + 1) * 500, "ms");
      return true;
    }
  }

  console.error("[VoiceAIClient] Sidecar not available after 15s");
  return false;
}

/**
 * Para o sidecar (via Tauri)
 */
export async function stopSidecar(): Promise<void> {
  await invokeCommand("stop_sidecar");
}

/**
 * Verifica status do sidecar (via Tauri)
 */
export async function getSidecarStatus(): Promise<boolean> {
  const result = await invokeCommand<boolean>("sidecar_status");
  return result ?? false;
}

// ============================================================
// Singleton e Hook
// ============================================================

// Instancia singleton para uso global
let clientInstance: VoiceAIClient | null = null;

/**
 * Retorna instancia singleton do cliente
 */
export function getVoiceAIClient(): VoiceAIClient {
  if (!clientInstance) {
    clientInstance = new VoiceAIClient();
  }
  return clientInstance;
}

/**
 * Hook para uso em componentes React
 * Verifica disponibilidade do sidecar e fornece metodos de transcricao
 */
export function useVoiceAI() {
  const client = getVoiceAIClient();

  return {
    client,
    transcribe: client.transcribe.bind(client),
    health: client.health.bind(client),
    isAvailable: client.isAvailable.bind(client),
    getStatus: client.getStatus.bind(client),
    blobToBase64: VoiceAIClient.blobToBase64,
    getFormatFromMimeType: VoiceAIClient.getFormatFromMimeType,
  };
}
