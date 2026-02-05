# RELATÓRIO DE AUDITORIA: ELCO-machina (Pro ATT Machine)

Data: 05/02/2026
Versão Auditada: 0.2.2

## 1. SEGURANÇA

- **[CRÍTICO] API Key Exposta no Bundle:**
  - O arquivo `vite.config.ts` injeta `GEMINI_API_KEY` via `define: { ...JSON.stringify(env.GEMINI_API_KEY) }`. Isso "cozinha" a chave API diretamente no código JavaScript do frontend. Qualquer pessoa com acesso ao executável ou aos arquivos de recurso pode extraí-la.
  - **Recomendação:** Remover `GEMINI_API_KEY` do `vite.config.ts`. A chave deve ser gerenciada pelo Backend/Sidecar ou inserida pelo usuário em tempo de execução (como já existe lógica para isso no `App.tsx`, a injeção via build é redundante e perigosa).

- **[CRÍTICO] Content Security Policy (CSP) Ausente:**
  - `tauri.conf.json` define `"csp": null`. Isso permite execução de scripts maliciosos e carregamento de recursos inseguros.
  - **Recomendação:** Configurar uma CSP estrita, ex: `"default-src 'self'; connect-src 'self' http://localhost:* http://100.114.203.28:* https://generativelanguage.googleapis.com; img-src 'self' blob: data:;"`

- **[ALERTA] Autenticação "Hardcoded" no Frontend:**
  - `App.tsx` contém credenciais em texto plano: `const AUTH_USERS = { 'MCBS': 'Chicago00@', ... }`. Isso não provê segurança real, apenas uma barreira visual.
  - **Recomendação:** Se a intenção é controle de acesso real, isso deve ser validado num backend. Se é apenas para "ocultar" a UI, esteja ciente de que é trivialmente burlável.

- **[ALERTA] Comunicação Sidecar Sem Autenticação:**
  - O sidecar Python (`voice-ai.service`) escuta em `0.0.0.0`. O frontend conecta via HTTP sem nenhum token de autenticação.
  - **Risco:** Qualquer dispositivo na rede local pode enviar áudio para transcrever ou usar o TTS.
  - **Recomendação:** Implementar um "shared secret" ou token gerado no início da sessão e passado nos headers.

- **[ALERTA] Atualizações via HTTP:**
  - `tauri.conf.json` usa `http://100.114.203.28...` para updates. Isso permite ataques Man-in-the-Middle (MITM) para injetar binários maliciosos.
  - **Recomendação:** Usar HTTPS obrigatoriamente.

## 2. ARQUITETURA

- **[NOTA] Monólito no Frontend (`App.tsx`):**
  - O arquivo `App.tsx` possui mais de 2700 linhas. Mistura lógica de UI, gerenciamento de estado complexo (áudio, auth, configurações), chamadas API e lógica de negócio.
  - **Impacto:** Dificulta manutenção, testes e aumenta chance de regressões.
  - **Recomendação:** Refatorar urgente. Extrair lógica de áudio para `hooks/useAudioController.ts`, lógica de Auth para `contexts/AuthContext.tsx`, e quebrar a UI em componentes menores.

- **[NOTA] Inconsistência Local vs Remoto:**
  - `tauri.conf.json` configura permissões para sidecar local (`binaries/voice-ai-sidecar`).
  - `src-tauri/src/lib.rs` força o modo remoto (`return Ok("remote_service".to_string())`), ignorando a capacidade local.
  - **Recomendação:** Decidir a estratégia. Se o objetivo é híbrido, o Rust deve tentar iniciar o sidecar local se o remoto falhar, ou expor uma config real.

- **[NOTA] Estrutura de Arquivos:**
  - `App.tsx` e `index.tsx` estão na raiz do projeto, fora de `src/`. Embora funcione com alias, foge do padrão Vite/React.

## 3. PERFORMANCE

- **[NOTA] Renderização:**
  - Devido ao tamanho do `App.tsx`, qualquer digitação no editor ou atualização de métrica de áudio (que ocorre frequentemente) pode causar re-renders da árvore inteira.
  - **Recomendação:** Uso de `React.memo` nos componentes filhos e isolamento de estado (ex: o visualizador de áudio deve ter seu próprio estado ou usar refs/contexto isolado).

- **[OK] Dependências:**
  - As bibliotecas usadas (`lucide-react`, `motion`, `faster-whisper`) são adequadas. Não há dependências obviamente supérfluas.

## 4. QUALIDADE DE CÓDIGO

- **[NOTA] Tratamento de Erros no Sidecar:**
  - O código Python (`stt_service.py`) assume que o download do modelo Whisper foi bem sucedido. Se o arquivo estiver corrompido, o serviço falha no boot e não se recupera.

- **[OK] Tipagem:**
  - O uso de TypeScript no frontend parece consistente, com interfaces definidas para as respostas da API (`TranscribeResponse`, etc).

## 5. SIDECAR PYTHON (voice-ai)

- **[CRÍTICO] Bug de Carregamento do Modelo (Error -3):**
  - O erro "Error -3 while decompressing data" indica arquivo de modelo corrompido (download interrompido).
  - O código atual (`_ensure_model_loaded`) não verifica checksum/hash do modelo antes de carregar.
  - **Correção Imediata:** Adicionar lógica para deletar a pasta do modelo se o carregamento falhar, forçando novo download na próxima tentativa.

- **[ALERTA] Dependência de Sistema (FFmpeg):**
  - O código usa `subprocess.run(['ffmpeg', ...])`. Se o FFmpeg não estiver no PATH da VM/Container, vai quebrar.
  - **Recomendação:** Verificar presença do FFmpeg no startup ou usar `static-ffmpeg` package.

## 6. CONFIGURAÇÃO

- **[ALERTA] Permissões Tauri Excessivas:**
  - `fs:allow-home-read` e `fs:allow-home-write` dão acesso a toda a pasta de usuário. Isso viola o princípio do menor privilégio.
  - **Recomendação:** Restringir para `$APP_DATA`, `$DOWNLOADS`, e pastas específicas selecionadas pelo usuário via dialog.

- **[OK] Versionamento:**
  - Versão 0.2.2 consistente entre `package.json` e `tauri.conf.json`.

## 7. GIT DIFF (Recente)

- **[OK] Fallback FFmpeg:**
  - A adição de fallback para FFmpeg em `stt_service.py` é positiva para suportar formatos que o `soundfile` não lê nativamente (como WebM de alguns browsers).
  - **Nota:** O código não verifica se o `ffmpeg` existe antes de chamar, apenas captura a exceção genérica no nível acima.

---

### PLANO DE AÇÃO IMEDIATO (Sugerido)

1.  **Corrigir Bug do Sidecar:** Implementar try/catch no carregamento do Whisper para detectar arquivo corrompido e limpar cache.
2.  **Segurança:** Remover `GEMINI_API_KEY` do `vite.config.ts`.
3.  **Arquitetura:** Mover `App.tsx` e `index.tsx` para `src/` e ajustar imports.
