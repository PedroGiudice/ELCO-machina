import subprocess
import os
import glob
from google.adk.agents import Agent
from google.adk.tools import google_search

# --- FERRAMENTAS ---

def run_shell_command(command: str) -> str:
    """
    Executa um comando de shell.
    Use para rodar linters ('bun run lint'), testes ('bun test') ou verificações git.
    """
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=120
        )
        return f"Exit Code: {result.returncode}\nOutput:\n{result.stdout}\nError:\n{result.stderr}"
    except Exception as e:
        return f"Erro ao executar comando: {str(e)}"

def read_code_file(file_path: str) -> str:
    """
    Lê o código fonte de um arquivo.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Erro ao ler arquivo: {str(e)}"

def find_files(pattern: str) -> str:
    """
    Encontra arquivos usando glob patterns (ex: '**/*.tsx').
    Útil para analisar a estrutura do projeto ou encontrar componentes.
    """
    try:
        matches = glob.glob(pattern, recursive=True)
        return "\n".join(matches[:100]) # Limita a 100 arquivos para não estourar contexto
    except Exception as e:
        return str(e)

def write_file_content(file_path: str, content: str) -> str:
    """
    Escreve conteúdo em um arquivo. CUIDADO: Sobrescreve o arquivo.
    Use para aplicar correções de código ou criar arquivos de configuração.
    """
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return f"Arquivo {file_path} escrito com sucesso."
    except Exception as e:
        return f"Erro ao escrever arquivo: {str(e)}"

# --- CONFIGURAÇÃO DO AGENTE ---

frontend_instruction = """Você é um Engenheiro Frontend Sênior e Guardião dos Padrões Lex-Vector.
Seu objetivo é garantir que o código React/TypeScript siga as diretrizes estritas do projeto.

REGRAS CRÍTICAS (NÃO NEGOCIÁVEIS):
1. IDIOMA: Português Brasileiro com acentuação impecável (é, á, ã, ç). Nunca use "eh" para "é".
2. ZERO EMOJIS: Proibido o uso de emojis em qualquer lugar (código, comentários, commits, respostas).
3. BUN OBRIGATÓRIO: Sempre use 'bun' (install, run, dev). Nunca npm ou yarn.
4. GIT: Commits frequentes após cada mudança lógica.

STACK TÉCNICA:
- React 19 + TypeScript 5.8 (ES2022).
- Vite 6.2 como Bundler.
- Tailwind CSS para estilização.
- Zustand para gerenciamento de estado global.

PADRÕES DE PROJETO:
- Componentes funcionais com Hooks.
- Refatoração de monólitos (como App.tsx) em componentes atômicos em src/components.
- Tipagem rigorosa com TypeScript.
- Uso de .env.local para variáveis sensíveis como GEMINI_API_KEY.

USE SUAS FERRAMENTAS para ler código, rodar linters, encontrar arquivos e aplicar correções.
Sempre que analisar ou gerar código, verifique se ele está alinhado com o arquivo CLAUDE.md do repositório."""

root_agent = Agent(
    name="frontend_standard_agent",
    model="gemini-3.0-pro",
    instruction=frontend_instruction,
    tools=[google_search, run_shell_command, read_code_file, find_files, write_file_content]
)
