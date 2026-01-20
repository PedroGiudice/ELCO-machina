# Playbook: Conversao React para Tauri (Android/Linux)

**Projeto:** ELCO-machina (Pro ATT Machine)
**Data:** 2026-01-20
**Resultado:** Frontend 1:1 com React original

---

## Resumo Executivo

Conversao de app React (hospedado no Google AI Studio) para app nativo desktop/mobile via Tauri 2.0, mantendo **100% de paridade visual e funcional** com o original.

---

## Pre-requisitos do Ambiente

### Ferramentas

```bash
# Node/Bun
bun --version  # 1.3.4+

# Rust
cargo --version  # 1.77+

# Java (para Android)
java -version  # OpenJDK 17+

# Android SDK (para Android)
# Instalado em ~/Android/Sdk
```

### Instalacao Android SDK (se necessario)

```bash
# 1. Java
sudo apt-get install -y openjdk-17-jdk
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

# 2. Android Command Line Tools
mkdir -p ~/Android/Sdk/cmdline-tools
cd ~/Android/Sdk/cmdline-tools
curl -sL "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" -o cmdline-tools.zip
unzip -q cmdline-tools.zip
mv cmdline-tools latest
rm cmdline-tools.zip

# 3. Aceitar licencas e instalar componentes
export ANDROID_HOME="$HOME/Android/Sdk"
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses <<< "y"
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \
  "platform-tools" \
  "platforms;android-34" \
  "build-tools;34.0.0" \
  "ndk;27.0.12077973"
```

---

## Passo a Passo da Conversao

### Etapa 1: Preparar Repositorio

```bash
# Criar branch de trabalho
git checkout -b feature/tauri-android-conversion

# Instalar dependencias existentes
bun install
```

### Etapa 2: Adicionar Tauri CLI

```bash
bun add -D @tauri-apps/cli
```

### Etapa 3: Inicializar Tauri

```bash
bunx tauri init --ci \
  --app-name "Pro ATT Machine" \
  --window-title "Pro ATT Machine" \
  --frontend-dist "../dist" \
  --dev-url "http://localhost:3000" \
  --before-dev-command "bun run dev" \
  --before-build-command "bun run build"
```

**IMPORTANTE:** Editar `src-tauri/tauri.conf.json`:
- Alterar `identifier` para seu app ID (ex: `com.proatt.machine`)

### Etapa 4: Adicionar Plugins Tauri

```bash
# Frontend
bun add @tauri-apps/api \
  @tauri-apps/plugin-dialog \
  @tauri-apps/plugin-fs \
  @tauri-apps/plugin-store \
  @tauri-apps/plugin-notification \
  @tauri-apps/plugin-clipboard-manager \
  @tauri-apps/plugin-shell
```

**Editar `src-tauri/Cargo.toml`:**

```toml
[dependencies]
# ... existentes ...
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-store = "2"
tauri-plugin-notification = "2"
tauri-plugin-clipboard-manager = "2"
tauri-plugin-shell = "2"
```

### Etapa 5: Registrar Plugins no Rust

**Editar `src-tauri/src/lib.rs`:**

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Etapa 6: Configurar Capabilities

**Editar `src-tauri/capabilities/default.json`:**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capabilities",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "fs:default",
    "fs:allow-app-read",
    "fs:allow-app-write",
    "fs:allow-download-read",
    "fs:allow-download-write",
    "store:default",
    "notification:default",
    "notification:allow-notify",
    "clipboard-manager:default",
    "clipboard-manager:allow-read-text",
    "clipboard-manager:allow-write-text",
    "shell:default",
    "shell:allow-open"
  ]
}
```

### Etapa 7: Verificar Build Desktop

```bash
# Verificar compilacao Rust
cd src-tauri && cargo check

# Build Linux
cargo tauri build --debug
```

### Etapa 8: Inicializar Android

```bash
# Variaveis de ambiente
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

# Inicializar Android target
cargo tauri android init
```

### Etapa 9: Build Android

```bash
# Build para aarch64 (maioria dos devices modernos)
cargo tauri android build --debug --target aarch64

# APK gerado em:
# src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

---

## Por que Funciona 1:1?

### O Segredo: WebView Moderno

Tauri usa o WebView do sistema (WebKitGTK no Linux, WebView no Android), que suporta **todas as APIs web modernas**:

| API Web | Suportada no WebView? |
|---------|----------------------|
| localStorage | Sim |
| IndexedDB | Sim |
| MediaRecorder | Sim |
| navigator.mediaDevices | Sim |
| Web Audio API | Sim |
| CSS Backdrop Filter | Sim |
| Tailwind CSS | Sim |

### O que NAO Precisou Mudar

1. **Nenhuma linha de codigo React** - O App.tsx permaneceu identico
2. **Nenhum CSS** - Tailwind via CDN funciona normalmente
3. **Nenhuma API de audio** - MediaRecorder/Web Audio funcionam no WebView
4. **Nenhuma persistencia** - localStorage e IndexedDB funcionam

### O que FOI Adicionado

1. **src-tauri/** - Backend Rust (apenas boilerplate)
2. **Plugins Tauri** - Preparados para uso futuro (nao obrigatorios)
3. **Configuracao** - tauri.conf.json, Cargo.toml, capabilities

---

## Checklist de Conversao

- [ ] Branch de trabalho criada
- [ ] `bun add -D @tauri-apps/cli`
- [ ] `bunx tauri init --ci ...`
- [ ] Identifier configurado no tauri.conf.json
- [ ] Plugins adicionados (opcional)
- [ ] `cargo check` passa
- [ ] `cargo tauri build --debug` gera binario
- [ ] Android SDK instalado (se necessario)
- [ ] `cargo tauri android init`
- [ ] `cargo tauri android build --debug --target aarch64`
- [ ] APK gerado e testavel

---

## Configuracoes Android Importantes

### Permissoes no AndroidManifest.xml

Se o app usa microfone, camera ou outros recursos do device, adicionar em:
`src-tauri/gen/android/app/src/main/AndroidManifest.xml`

```xml
<!-- Microfone -->
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-feature android:name="android.hardware.microphone" android:required="true" />

<!-- Camera (se necessario) -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="true" />

<!-- Armazenamento (se necessario) -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

### NAO usar enableEdgeToEdge()

O Tauri gera `MainActivity.kt` com `enableEdgeToEdge()` por padrao. **REMOVER**:

```kotlin
// ANTES (problematico)
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}

// DEPOIS (correto)
class MainActivity : TauriActivity()
```

**Por que?** `enableEdgeToEdge()` faz o conteudo renderizar por baixo das barras do sistema (status bar, navigation bar). O CSS `env(safe-area-inset-*)` **NAO funciona** no Android WebView, entao nao ha como compensar.

---

## Usando o Plugin Store

A API do `@tauri-apps/plugin-store` mudou no Tauri 2.0:

```typescript
// ERRADO (API antiga)
import { LazyStore } from '@tauri-apps/plugin-store';
const store = new LazyStore('data.json');

// CORRETO (API atual)
import { load } from '@tauri-apps/plugin-store';
const store = await load('data.json', { autoSave: 100 });

// Usar
await store.set('key', value);
const data = await store.get<Type>('key');
```

---

## Dicas de Layout Mobile

### Barra de navegacao inferior

Se seu app tem barra de navegacao fixa no bottom, usar altura fixa:

```tsx
<nav className="fixed bottom-0 left-0 w-full h-[60px] ...">
```

**NAO usar** `pb-safe` do Tailwind (nao funciona no Android WebView).

### Toolbar com muitos botoes

Em mobile, ocultar elementos menos importantes:

```tsx
// Ocultar em mobile, mostrar em desktop
<span className="hidden md:inline">Texto Longo</span>

// Botoes mais compactos em mobile
<button className="px-2 md:px-3 py-1.5 ...">
```

---

## Troubleshooting

### Erro: Permission not found

Verificar nomes exatos das permissions em:
```bash
cargo check 2>&1 | grep "expected one of"
```

### Erro: Java not found

```bash
sudo apt-get install -y openjdk-17-jdk
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
```

### Erro: NDK not found

```bash
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "ndk;27.0.12077973"
export NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
```

### Build Android OOM

Compilar apenas um target:
```bash
cargo tauri android build --debug --target aarch64
```

### App nao pede permissao de microfone/camera

Verificar se as permissoes estao no `AndroidManifest.xml` (ver secao acima).

### Layout cortado pelas barras do sistema

Remover `enableEdgeToEdge()` do `MainActivity.kt` (ver secao acima).

---

## Conclusao

A conversao React → Tauri e **trivial** quando o app React:
1. Nao usa APIs especificas de browser (ex: Service Workers)
2. Usa APIs web padrao (localStorage, IndexedDB, MediaRecorder)
3. Nao depende de server-side rendering

O WebView moderno do Tauri renderiza o React **exatamente** como um browser, mantendo paridade 1:1.
