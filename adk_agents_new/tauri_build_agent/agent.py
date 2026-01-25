from google.adk.agents import Agent
from google.adk.tools import google_search
from adk_agents_new.shared.tools import run_shell_cmd, read_file_secure, find_files_glob

# --- FERRAMENTAS ESPECÍFICAS DE TAURI ---

def check_tauri_env() -> str:
    """Valida o ambiente de desenvolvimento (Rust, Node, Java, Android)."""
    cmds = [
        "bun --version",
        "cargo --version",
        "java -version",
        "echo $ANDROID_HOME",
        "echo $NDK_HOME"
    ]
    results = []
    for cmd in cmds:
        results.append(f"> {cmd}\n{run_shell_cmd(cmd, timeout=10)}")
    return "\n".join(results)

def build_android_debug() -> str:
    """Executa o build de debug para Android (rápido)."""
    return run_shell_cmd("bun run tauri android build --debug --target aarch64")

def build_linux_bundle() -> str:
    """Executa o build de produção para Linux (deb/rpm)."""
    return run_shell_cmd("bun run tauri build")

def sign_apk(keystore_path: str, key_alias: str, ks_pass: str) -> str:
    """
    Assina o APK gerado.
    Requer caminho do keystore e senha.
    """
    apk_path = "src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
    output_path = "src-tauri/gen/android/app/build/outputs/apk/universal/release/app-signed.apk"
    
    cmd = f"apksigner sign --ks {keystore_path} --ks-key-alias {key_alias} --ks-pass pass:{ks_pass} --out {output_path} {apk_path}"
    return run_shell_cmd(cmd)

# --- INSTRUÇÃO ---

TAURI_INSTRUCTION = """
Você é o **Tauri Build Master**. Sua responsabilidade é garantir que o aplicativo compile e seja empacotado corretamente.

**SEU PROCESSO (LOOP):**
1. **Verificação**: Antes de qualquer build, use `check_tauri_env` para validar dependências.
2. **Diagnóstico**: Se um build falhar, LEIA O LOG de erro. Não alucine. Use `read_file_secure` para ler arquivos de config (`tauri.conf.json`, `Cargo.toml`) se suspeitar de erro de configuração.
3. **Correção**: Se faltar permissão no AndroidManifest, avise o usuário ou corrija se solicitado.
4. **Sucesso**: Só reporte sucesso se o arquivo final (.apk, .deb) existir no disco.

**REGRAS DE OURO:**
- **Android**: Lembre-se que `enableEdgeToEdge()` quebra layouts. Verifique `MainActivity.kt`.
- **Assinatura**: Builds de release Android geram APKs não assinados. Avise o usuário sobre a necessidade de assinar.
- **Output**: Seja conciso. Mostre o caminho absoluto do artefato gerado.

Responda sempre em Português Brasileiro.
"""

root_agent = Agent(
    name="tauri_build_agent",
    model="gemini-2.0-flash",
    instruction=TAURI_INSTRUCTION,
    tools=[google_search, run_shell_cmd, read_file_secure, find_files_glob, check_tauri_env, build_android_debug, build_linux_bundle, sign_apk]
)