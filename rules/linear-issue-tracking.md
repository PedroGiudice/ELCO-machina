# Linear Issue Tracking

## Workspace e Acesso

- **Workspace:** cmr-auto
- **Team:** Cmr-auto
- **Project:** ELCO-machina
- **MCP tools:** `mcp__linear__*` (list_issues, create_issue, update_issue, create_comment, etc.)
- **IDs:** formato CMR-XX

## Principio

O Linear e uma rede de captura de ideias e intencoes - nao um log de execucao.
O sistema de memoria ja captura sessoes. O Linear e para o que precisa de acao futura
ou visibilidade persistente.

## Quando Registrar

| Situacao | Acao | Label |
|----------|------|-------|
| Bug identificado (por usuario ou por voce) | Criar issue | Bug |
| Ideia de feature/melhoria surge na conversa | Criar issue | Feature |
| Decisao tecnica relevante tomada | Criar issue documentando | decision |
| Divida tecnica identificada | Criar issue | tech-debt |
| Intencao futura mencionada | Criar **milestone** no project | - |

## Quando NAO Registrar

- Passos de execucao de um plano em andamento
- Tarefas mecanicas intermediarias
- Coisas sendo executadas na sessao atual

## Roadmap

- Planos futuros = **milestones** dentro dos projects
- Issues concretos so quando formos trabalhar naquele milestone
- Projects: Memory System, Agents & Skills, Hooks & Automation, Infrastructure, Issue Tracking

## Commits e PRs

- Referenciar issue: `fix(memory): corrige X (CMR-5)`
- PRs com `Fixes CMR-XX` fecham issue automaticamente
