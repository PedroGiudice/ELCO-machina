# Correcoes: audio.rs samples, auto-update URL, dead code sidecar

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Corrigir 3 bugs/problemas: samples_written nunca incrementado, URL de auto-update errada, dead code de sidecar.

**Architecture:** Edicoes cirurgicas em 3 arquivos Rust/JSON. Sem mudanca de comportamento externo alem do fix de auto-update.

**Tech Stack:** Rust (Tauri), JSON config

---

### Task 1: Fix samples_written nunca incrementado em audio.rs

**Files:**
- Modify: `src-tauri/src/audio.rs:120-124` (remover counter local, usar state.samples_written)

**Problema:** `samples_counter` local e passado para os closures CPAL, mas `state.samples_written` (que e lido em `stop_audio_recording`) nunca e atualizado.

**Correcao:** Passar `state.samples_written` (via clone do Arc interno) para os closures em vez do counter local.

**Step 1: Editar audio.rs**

Remover linhas 122-123 (`samples_counter` e `samples_for_stream`). Substituir por clone do `Arc` que contem `samples_written` do AudioState. Como `AudioState` nao e `Arc`, precisamos extrair o `AtomicU64` de forma compartilhavel.

Abordagem: `AudioState.samples_written` ja e `AtomicU64` dentro de um struct gerenciado por Tauri (State). Mas o closure precisa de um `Arc<AtomicU64>` ou referencia com lifetime `'static`. A solucao mais simples: mudar `samples_written` de `AtomicU64` para `Arc<AtomicU64>` no struct, ou criar o Arc na funcao e armazenar no state.

Solucao escolhida (minima): trocar `samples_written: AtomicU64` para `samples_written: Arc<AtomicU64>` no struct. Ajustar `new()`, os closures, e a leitura em `stop_audio_recording`.

Mudancas concretas:

1. `AudioState.samples_written`: `AtomicU64` -> `Arc<AtomicU64>`
2. `AudioState::new()`: `Arc::new(AtomicU64::new(0))`
3. `start_audio_recording`: remover `samples_counter`/`samples_for_stream`, usar `state.samples_written.clone()` como `Arc<AtomicU64>`
4. `stop_audio_recording`: `state.samples_written.load(...)` continua funcionando (deref)

**Step 2: cargo check**

Run: `cd src-tauri && cargo check`
Expected: PASS

**Step 3: Commit**

```bash
git add src-tauri/src/audio.rs
git commit -m "fix(audio): usar state.samples_written nos closures CPAL"
```

---

### Task 2: Fix URL auto-update em tauri.conf.json

**Files:**
- Modify: `src-tauri/tauri.conf.json:32`

**Step 1: Corrigir endpoint**

Trocar:
```
"http://137.131.201.119/proatt/latest.json"
```
Por:
```
"http://100.114.203.28:8090/proatt/latest.json"
```

**Step 2: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "fix(updater): corrigir URL auto-update para Tailscale porta 8090"
```

---

### Task 3: Remover dead code sidecar (5 comandos)

**Files:**
- Modify: `src-tauri/src/lib.rs` (remover modulos sidecar desktop e mobile, remover do invoke_handler)

**Step 1: Remover**

1. Remover `mod sidecar` desktop (linhas 9-42)
2. Remover `mod sidecar` mobile (linhas 48-79)
3. Remover os 5 comandos sidecar do `generate_handler!` desktop (linhas 145-149)
4. Remover os 5 comandos sidecar do `generate_handler!` mobile (linhas 162-166)

**Step 2: cargo check**

Run: `cd src-tauri && cargo check`

**Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "refactor(lib): remover 5 comandos sidecar dead code"
```
