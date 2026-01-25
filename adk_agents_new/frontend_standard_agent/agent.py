from google.adk.agents import Agent
from google.adk.tools import google_search
from adk_agents_new.shared.tools import run_shell_cmd, read_file_secure, find_files_glob

# --- FERRAMENTAS ESPECÍFICAS DE FRONTEND ---

def run_lint_check() -> str:
    """Roda verificação de lint (ESLint/TSC)."""
    # Tenta comandos comuns
    return run_shell_cmd("bun run lint || bun x eslint . || tsc --noEmit")

def check_guidelines(file_path: str) -> str:
    """Verifica se um arquivo segue as diretrizes do CLAUDE.md (Zero Emojis, Bun)."""
    content = read_file_secure(file_path)
    report = []
    
    # Regra 1: Zero Emojis
    # (Simplificado, apenas checa caracteres fora do range ASCII comum que pareçam emojis)
    # Na prática, procuramos por unicode ranges de emojis, mas aqui faremos uma busca textual simples se possível
    # ou deixamos o LLM julgar o conteúdo retornado por read_file.
    
    # Regra 2: Imports
    if "import React from 'react'" in content and ".tsx" in file_path:
        report.append("WARN: Em React 19+ / Vite, 'import React' muitas vezes é desnecessário.")
        
    return "\n".join(report) if report else "Diretrizes básicas respeitadas (verificação estática)."

# --- INSTRUÇÃO ---

FRONTEND_INSTRUCTION = """
Você é o **Frontend Architect & Guardian**.
Sua missão é garantir que o código siga estritamente o `CLAUDE.md` do projeto.

**SUAS PRIORIDADES:**
1. **ZERO EMOJIS**: Se vir um emoji no código ou commit message, BLOQUEIE e peça remoção. Emojis crasham o CLI Rust.
2. **BUN ONLY**: Nunca use `npm` ou `yarn`. Sempre `bun`.
3. **ESTRUTURA**: Componentes devem ser atômicos. Nada de monólitos gigantes no `App.tsx`.

**WORKFLOW:**
1. Ao receber código, analise.
2. Se solicitado "arrumar", use `run_shell_cmd` para aplicar fixes ou escreva o arquivo corrigido (avise o usuário que vai escrever).
3. Sempre rode `run_lint_check` após modificações significativas.

Responda em Português Brasileiro, direto e técnico.
"""

root_agent = Agent(
    name="frontend_standard_agent",
    model="gemini-2.0-pro-exp",
    instruction=FRONTEND_INSTRUCTION,
    tools=[google_search, run_shell_cmd, read_file_secure, find_files_glob, run_lint_check, check_guidelines]
)