import subprocess
import os
import glob
from google.adk.agents import Agent
from google.adk.tools import google_search

# --- FERRAMENTAS ---

def run_shell_command(command: str) -> str:
    """
    Executa um comando de shell (bash) e retorna a saída (stdout + stderr).
    Use para rodar comandos de build, instalações, verificar arquivos, etc.
    Ex: 'bun run build', 'ls -la src-tauri', 'java -version'.
    """
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=600  # 10 min timeout para builds longos
        )
        return f"Exit Code: {result.returncode}\nOutput:\n{result.stdout}\nError:\n{result.stderr}"
    except Exception as e:
        return f"Erro ao executar comando: {str(e)}"

def read_file_content(file_path: str) -> str:
    """
    Lê o conteúdo de um arquivo. Use para verificar configurações, scripts ou código.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Erro ao ler arquivo: {str(e)}"

def list_files(path: str = ".") -> str:
    """
    Lista arquivos em um diretório.
    """
    try:
        return "\n".join(os.listdir(path))
    except Exception as e:
        return str(e)

# --- CONFIGURAÇÃO DO AGENTE ---

tauri_instruction = """Você é um Especialista em Build e Deployment Tauri 2.0 para Android e Linux.
Sua base de conhecimento é o projeto ELCO-machina.

DIRETRIZES TÉCNICAS:
1. AMBIENTE:
   - Bun: 1.3.4+ | Rust: 1.77+ | OpenJDK 17.
   - Android SDK: API 34 | NDK: 27.0.12077973.
   - JAVA_HOME: /usr/lib/jvm/java-17-openjdk-amd64

2. BUILD ANDROID:
   - Comando: 'bun run tauri android build' ou 'cargo tauri android build --debug --target aarch64'.
   - APK gerado em: src-tauri/gen/android/app/build/outputs/apk/universal/release/.
   - IMPORTANTE: Sempre remover 'enableEdgeToEdge()' do MainActivity.kt pois quebra o layout no WebView Android.
   - CSS: safe-area-inset não funciona; usar margens fixas.

3. BUILD LINUX:
   - Comando: 'bun run tauri build'.
   - Gera pacotes .deb e .rpm em src-tauri/target/release/bundle/.

4. ASSINATURA:
   - APKs de release são gerados unsigned. Requerem 'apksigner' e uma keystore JKS.
   - Updates Linux requerem TAURI_SIGNING_PRIVATE_KEY.

USE SUAS FERRAMENTAS para executar os builds, verificar erros e validar arquivos de configuração.
Sempre responda em Português Brasileiro com acentuação correta. NÃO use emojis."""

root_agent = Agent(
    name="tauri_build_agent",
    model="gemini-3.0-flash",
    instruction=tauri_instruction,
    tools=[google_search, run_shell_command, read_file_content, list_files]
)
