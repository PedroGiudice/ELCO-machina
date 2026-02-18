/**
 * safeFetch - Wrapper centralizado para fetch em ambiente Tauri
 *
 * Resolve incompatibilidades cross-distro:
 * - HTTPS: WebKitGTK do AppImage falha com "Load failed" (libs TLS Oracle Linux)
 *   -> tauriFetch (Rust) lida com TLS corretamente
 * - HTTP: tauriFetch bloqueia com "url not allowed on scope"
 *   -> fetch nativo funciona (csp: null)
 *
 * Estrategia: tauriFetch primeiro, fallback para nativo se scope bloquear.
 */

import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

const _nativeFetch = window.fetch.bind(window);

export async function safeFetch(
  url: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
  
  // HOTFIX: Prevenir recursao infinita.
  // O tauriFetch internamente usa window.fetch, que estamos sobrescrevendo.
  // Restauramos o fetch nativo ANTES da chamada do tauriFetch e recolocamos
  // nosso wrapper logo depois, garantindo que o tauri-plugin use o original
  // e o resto da aplicacao use nosso wrapper.
  window.fetch = _nativeFetch;

  try {
    return await tauriFetch(urlStr, init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('url not allowed') || msg.includes('scope')) {
      console.warn(`[safeFetch] tauriFetch scope block, usando nativo: ${urlStr}`);
      return await _nativeFetch(url, init);
    }
    throw err;
  } finally {
    // Garante que nosso override seja restaurado mesmo se tauriFetch falhar
    window.fetch = safeFetch as typeof window.fetch;
  }
}

/**
 * Instala o safeFetch como override global de window.fetch.
 * Deve ser chamado UMA VEZ no bootstrap da aplicacao (index.tsx).
 */
export function installSafeFetch(): void {
  window.fetch = safeFetch as typeof window.fetch;
}
