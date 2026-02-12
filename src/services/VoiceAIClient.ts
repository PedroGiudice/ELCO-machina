/**
 * VoiceAI Client - Abstrai chamadas ao sidecar Python
 *
 * Funcionalidades:
 * - Transcricao local via Faster-Whisper
 * - Refinamento opcional via Gemini
 * - Health check do sidecar
 * - Fallback para Gemini direto se sidecar indisponivel
 *
 * NOTA: Usa safeFetch que tenta tauriFetch (plugin-http) e faz fallback
 * para fetch nativo. O tauriFetch pode falhar com "url not allowed on
 * the configured scope" em certos ambientes (AppImage).
 * Com csp:null no tauri.conf.json, o fetch nativo funciona sem CORS.
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

/**
 * Wrapper que tenta tauriFetch (plugin-http) e faz fallback para fetch nativo.
 * Resolve o bug onde tauriFetch falha com "url not allowed on the configured scope"
 * dentro do AppImage, mas o sidecar esta acessivel via fetch nativo.
 */
async function safeFetch(
  url: string,
  init?: RequestInit & { signal?: AbortSignal }
): Promise<Response> {
  try {
    return await tauriFetch(url, init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("url not allowed") || msg.includes("scope")) {
      console.warn(`[safeFetch] tauriFetch bloqueado pelo scope, usando fetch nativo: ${msg}`);
      return await fetch(url, init);
    }
    throw err;
  }
}

// Formatos de audio suportados
export type AudioFormat = "webm" | "wav" | "mp3" | "ogg" | "m4a";

// Request para transcricao (alinhado com backend POST /transcribe)
export interface TranscribeRequest {
  audio: string; // Base64 encoded
  format?: AudioFormat;
  language?: string | null; // null = auto-detect
  refine?: boolean;
  system_instruction?: string | null; // Prompt do PromptStore
  model?: string; // default "gemini-2.5-flash"
  temperature?: number; // default 0.4, range 0.0-2.0
}

// Segmento de transcricao
export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

// Response da transcricao (alinhado com backend)
export interface TranscribeResponse {
  text: string;
  refined_text: string | null;
  language: string;
  confidence: number;
  duration: number;
  segments: TranscriptionSegment[];
  refine_success: boolean | null;
  refine_error: string | null;
  model_used: string | null;
}

// Response do health check (piper/modal, nao xtts)
export interface HealthResponse {
  status: "healthy" | "degraded";
  version: string;
  models: {
    whisper: {
      status: "loaded" | "available" | "not_loaded";
      model: string | null;
    };
    piper: {
      status: "loaded" | "available" | "not_implemented";
      model: string | null;
    };
    modal: {
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

      const response = await safeFetch(`${this.baseUrl}/health`, {
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
    const body: Record<string, unknown> = {
      audio: request.audio,
      format: request.format || "webm",
      language: request.language ?? "pt",
      refine: request.refine || false,
    };

    // Novos campos para refinamento via sidecar REST
    if (request.system_instruction !== undefined) {
      body.system_instruction = request.system_instruction;
    }
    if (request.model !== undefined) {
      body.model = request.model;
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await safeFetch(`${this.baseUrl}/transcribe`, {
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
// Metodos para controle do servidor remoto
// ============================================================

/**
 * Garante que o servidor remoto esteja disponivel
 *
 * @returns true se servidor esta disponivel
 */
export async function ensureSidecarRunning(): Promise<boolean> {
  const client = getVoiceAIClient();
  return await client.isAvailable();
}

/**
 * Para o sidecar - no-op para servidor remoto
 */
export async function stopSidecar(): Promise<void> {
  // Servidor remoto - nao gerenciado pelo cliente
}

/**
 * Verifica status do servidor via health check HTTP
 */
export async function getSidecarStatus(): Promise<boolean> {
  const client = getVoiceAIClient();
  return await client.isAvailable();
}

// ============================================================
// Singleton e Hook
// ============================================================

// Instancia singleton para uso global
let clientInstance: VoiceAIClient | null = null;

// URL configurada pelo usuario (servidor remoto)
let configuredUrl: string | null = null;

/**
 * Define a URL do servidor Whisper (remoto ou local)
 * @param url URL do servidor (ex: http://100.114.203.28:8765) ou null para usar localhost
 */
export function setVoiceAIUrl(url: string | null): void {
  configuredUrl = url && url.trim() !== "" ? url.trim() : null;
  // Força recriação do cliente com nova URL
  clientInstance = null;
}

/**
 * Retorna a URL configurada atualmente
 */
export function getVoiceAIUrl(): string | null {
  return configuredUrl;
}

/**
 * Verifica se está usando servidor remoto
 */
export function isRemoteServer(): boolean {
  return configuredUrl !== null;
}

/**
 * Retorna instancia singleton do cliente
 */
export function getVoiceAIClient(): VoiceAIClient {
  if (!clientInstance) {
    const url = configuredUrl || "http://localhost:8765";
    clientInstance = new VoiceAIClient(url);
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
