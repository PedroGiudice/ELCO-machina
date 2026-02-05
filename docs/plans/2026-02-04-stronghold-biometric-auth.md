# Stronghold + Biometric Authentication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar autenticacao segura com Stronghold (armazenamento criptografado) e Biometric (fingerprint/face) para mobile.

**Architecture:** Backend Rust registra plugins Stronghold (todas plataformas) e Biometric (mobile only). Frontend verifica disponibilidade de biometria, autentica usuario, e desbloqueia vault Stronghold com credenciais derivadas.

**Tech Stack:** tauri-plugin-stronghold, tauri-plugin-biometric, argon2 (hash), TypeScript/React

---

## Pre-Requisitos

- Tauri v2.x instalado
- Projeto ELCO-machina configurado
- Para testes mobile: Android Studio ou Xcode

---

## Fase 1: Backend - Dependencias e Plugins

### Task 1.1: Adicionar dependencias Rust

**Files:** Modify `src-tauri/Cargo.toml`

**Step 1:** Adicionar dependencias ao Cargo.toml

Localizar secao `[dependencies]` e adicionar:

```toml
# Stronghold - armazenamento criptografado (todas plataformas)
tauri-plugin-stronghold = "2.0"
argon2 = "0.5"

# Biometric - apenas mobile
[target.'cfg(any(target_os = "android", target_os = "ios"))'.dependencies]
tauri-plugin-biometric = "2.0"
```

**Step 2:** Commit

```bash
git add src-tauri/Cargo.toml
git commit -m "chore(deps): Adiciona stronghold, biometric e argon2"
```

---

### Task 1.2: Registrar plugin Stronghold

**Files:** Modify `src-tauri/src/lib.rs`

**Step 1:** Adicionar imports no topo do arquivo

```rust
use argon2::{hash_raw, Config, Variant, Version};
```

**Step 2:** Localizar funcao `run()` ou `main()` e adicionar plugin Stronghold

```rust
pub fn run() {
    tauri::Builder::default()
        // ... outros plugins existentes ...
        .plugin(tauri_plugin_stronghold::Builder::new(|password| {
            // Hash da senha usando Argon2id (recomendado para passwords)
            let config = Config {
                lanes: 4,
                mem_cost: 10_000,
                time_cost: 10,
                variant: Variant::Argon2id,
                version: Version::Version13,
                ..Default::default()
            };

            // Salt fixo para o app (em producao, considerar salt por usuario)
            let salt = b"elco-machina-stronghold-2026";

            hash_raw(password.as_ref(), salt, &config)
                .expect("failed to hash password")
                .to_vec()
        }).build())
        // ... resto da configuracao ...
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 3:** Commit

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(auth): Registra plugin Stronghold com Argon2id"
```

---

### Task 1.3: Registrar plugin Biometric (mobile only)

**Files:** Modify `src-tauri/src/lib.rs`

**Step 1:** Adicionar compilacao condicional para Biometric

```rust
pub fn run() {
    let mut builder = tauri::Builder::default()
        // ... plugins existentes ...
        .plugin(tauri_plugin_stronghold::Builder::new(|password| {
            // ... codigo do hash ...
        }).build());

    // Biometric apenas em Android/iOS
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        builder = builder.plugin(tauri_plugin_biometric::init());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 2:** Commit

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(auth): Registra plugin Biometric para mobile"
```

---

### Task 1.4: Adicionar permissoes Tauri

**Files:** Modify `src-tauri/capabilities/default.json`

**Step 1:** Verificar se arquivo existe, criar se necessario

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "store:default",
    "stronghold:default",
    "biometric:default"
  ]
}
```

**Step 2:** Commit

```bash
git add src-tauri/capabilities/
git commit -m "feat(auth): Adiciona permissoes stronghold e biometric"
```

---

## Fase 2: Frontend - Dependencias

### Task 2.1: Instalar pacotes npm

**Step 1:** Instalar dependencias frontend

```bash
bun add @tauri-apps/plugin-stronghold @tauri-apps/plugin-biometric
```

**Step 2:** Verificar instalacao

```bash
grep -E "stronghold|biometric" package.json
```

Expected: Ambos pacotes listados em dependencies

**Step 3:** Commit

```bash
git add package.json bun.lockb
git commit -m "chore(deps): Adiciona stronghold e biometric ao frontend"
```

---

## Fase 3: Frontend - Servico de Autenticacao

### Task 3.1: Criar types para autenticacao

**Files:** Create `src/services/auth/types.ts`

**Step 1:** Criar diretorio e arquivo

```bash
mkdir -p src/services/auth
```

**Step 2:** Criar arquivo de tipos

```typescript
// src/services/auth/types.ts

export interface AuthUser {
  username: string;
  role: 'admin' | 'user';
  lastLogin?: number;
}

export interface AuthCredentials {
  username: string;
  password: string;
}

export interface BiometricStatus {
  isAvailable: boolean;
  biometryType: 'touchId' | 'faceId' | 'fingerprint' | 'none';
}

export interface AuthState {
  isAuthenticated: boolean;
  currentUser: AuthUser | null;
  biometricEnabled: boolean;
}

// Usuarios autorizados (em producao, mover para backend)
export const AUTHORIZED_USERS: Record<string, { password: string; role: 'admin' | 'user' }> = {
  'MCBS': { password: 'Chicago00@', role: 'admin' },
  'PGR': { password: 'Chicago00@', role: 'user' },
};
```

**Step 3:** Commit

```bash
git add src/services/auth/
git commit -m "feat(auth): Cria types para autenticacao"
```

---

### Task 3.2: Criar servico Stronghold

**Files:** Create `src/services/auth/stronghold.ts`

**Step 1:** Criar servico de vault

```typescript
// src/services/auth/stronghold.ts

import { Stronghold, Client } from '@tauri-apps/plugin-stronghold';
import { appDataDir } from '@tauri-apps/api/path';
import type { AuthUser } from './types';

const VAULT_FILENAME = 'auth.hold';
const CLIENT_NAME = 'elco-auth';
const AUTH_KEY = 'authenticated_user';

let strongholdInstance: Stronghold | null = null;
let clientInstance: Client | null = null;

/**
 * Inicializa o Stronghold com a senha fornecida.
 * A senha e hasheada pelo plugin usando Argon2id.
 */
export async function initStronghold(password: string): Promise<boolean> {
  try {
    const dataDir = await appDataDir();
    const vaultPath = `${dataDir}/${VAULT_FILENAME}`;

    // Carrega ou cria o vault
    strongholdInstance = await Stronghold.load(vaultPath, password);

    // Carrega ou cria o client
    try {
      clientInstance = await strongholdInstance.loadClient(CLIENT_NAME);
    } catch {
      clientInstance = await strongholdInstance.createClient(CLIENT_NAME);
    }

    return true;
  } catch (error) {
    console.error('[Stronghold] Init failed:', error);
    return false;
  }
}

/**
 * Salva usuario autenticado no vault.
 */
export async function saveAuthUser(user: AuthUser): Promise<void> {
  if (!clientInstance || !strongholdInstance) {
    throw new Error('Stronghold not initialized');
  }

  const store = clientInstance.getStore();
  const data = Array.from(new TextEncoder().encode(JSON.stringify(user)));

  await store.insert(AUTH_KEY, data);
  await strongholdInstance.save();
}

/**
 * Recupera usuario autenticado do vault.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  if (!clientInstance) {
    return null;
  }

  try {
    const store = clientInstance.getStore();
    const data = await store.get(AUTH_KEY);

    if (!data || data.length === 0) {
      return null;
    }

    const json = new TextDecoder().decode(new Uint8Array(data));
    return JSON.parse(json) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * Remove usuario do vault (logout).
 */
export async function clearAuthUser(): Promise<void> {
  if (!clientInstance || !strongholdInstance) {
    return;
  }

  try {
    const store = clientInstance.getStore();
    await store.remove(AUTH_KEY);
    await strongholdInstance.save();
  } catch {
    // Ignora erro se key nao existe
  }
}

/**
 * Fecha o vault.
 */
export async function closeStronghold(): Promise<void> {
  strongholdInstance = null;
  clientInstance = null;
}

/**
 * Verifica se vault ja existe (usuario ja fez setup).
 */
export async function vaultExists(): Promise<boolean> {
  try {
    const { exists } = await import('@tauri-apps/plugin-fs');
    const dataDir = await appDataDir();
    return await exists(`${dataDir}/${VAULT_FILENAME}`);
  } catch {
    return false;
  }
}
```

**Step 2:** Commit

```bash
git add src/services/auth/stronghold.ts
git commit -m "feat(auth): Cria servico Stronghold para vault criptografado"
```

---

### Task 3.3: Criar servico Biometric

**Files:** Create `src/services/auth/biometric.ts`

**Step 1:** Criar servico de biometria

```typescript
// src/services/auth/biometric.ts

import type { BiometricStatus } from './types';

// Importacao dinamica para evitar erro em desktop
let biometricModule: typeof import('@tauri-apps/plugin-biometric') | null = null;

/**
 * Carrega modulo biometric (apenas mobile).
 */
async function loadBiometricModule() {
  if (biometricModule) return biometricModule;

  try {
    biometricModule = await import('@tauri-apps/plugin-biometric');
    return biometricModule;
  } catch {
    return null;
  }
}

/**
 * Verifica disponibilidade de biometria no dispositivo.
 */
export async function getBiometricStatus(): Promise<BiometricStatus> {
  const module = await loadBiometricModule();

  if (!module) {
    return { isAvailable: false, biometryType: 'none' };
  }

  try {
    const status = await module.status();

    return {
      isAvailable: status.isAvailable,
      biometryType: status.biometryType as BiometricStatus['biometryType'],
    };
  } catch {
    return { isAvailable: false, biometryType: 'none' };
  }
}

/**
 * Solicita autenticacao biometrica.
 */
export async function authenticateWithBiometric(reason: string): Promise<boolean> {
  const module = await loadBiometricModule();

  if (!module) {
    return false;
  }

  try {
    await module.authenticate(reason, {
      cancelTitle: 'Cancelar',
      fallbackTitle: 'Usar Senha',
      allowDeviceCredential: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifica se estamos em plataforma mobile.
 */
export function isMobilePlatform(): boolean {
  // Tauri expoe plataforma via user agent ou API
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('android') || ua.includes('iphone') || ua.includes('ipad');
}
```

**Step 2:** Commit

```bash
git add src/services/auth/biometric.ts
git commit -m "feat(auth): Cria servico Biometric para mobile"
```

---

### Task 3.4: Criar servico principal de Auth

**Files:** Create `src/services/auth/index.ts`

**Step 1:** Criar servico principal que orquestra Stronghold e Biometric

```typescript
// src/services/auth/index.ts

export * from './types';
export * from './stronghold';
export * from './biometric';

import {
  initStronghold,
  saveAuthUser,
  getAuthUser,
  clearAuthUser,
  closeStronghold,
  vaultExists,
} from './stronghold';

import {
  getBiometricStatus,
  authenticateWithBiometric,
  isMobilePlatform,
} from './biometric';

import type { AuthCredentials, AuthUser, AuthState, BiometricStatus } from './types';
import { AUTHORIZED_USERS } from './types';

// Chave derivada para biometria (em producao, usar chave unica por dispositivo)
const BIOMETRIC_VAULT_KEY = 'biometric-unlock-elco-2026';

/**
 * Servico principal de autenticacao.
 */
export class AuthService {
  private state: AuthState = {
    isAuthenticated: false,
    currentUser: null,
    biometricEnabled: false,
  };

  /**
   * Tenta autenticacao automatica via biometria (mobile).
   */
  async tryBiometricAuth(): Promise<boolean> {
    if (!isMobilePlatform()) {
      return false;
    }

    const bioStatus = await getBiometricStatus();
    if (!bioStatus.isAvailable) {
      return false;
    }

    // Verifica se vault existe (usuario ja fez setup)
    if (!(await vaultExists())) {
      return false;
    }

    // Solicita biometria
    const authenticated = await authenticateWithBiometric(
      'Autentique para acessar o Pro ATT Machine'
    );

    if (!authenticated) {
      return false;
    }

    // Biometria OK - abre vault com chave fixa
    const initialized = await initStronghold(BIOMETRIC_VAULT_KEY);
    if (!initialized) {
      return false;
    }

    // Recupera usuario salvo
    const user = await getAuthUser();
    if (!user) {
      return false;
    }

    this.state = {
      isAuthenticated: true,
      currentUser: user,
      biometricEnabled: true,
    };

    return true;
  }

  /**
   * Autentica com usuario e senha.
   */
  async loginWithCredentials(credentials: AuthCredentials): Promise<{ success: boolean; error?: string }> {
    const username = credentials.username.toUpperCase();
    const userData = AUTHORIZED_USERS[username];

    if (!userData || userData.password !== credentials.password) {
      return { success: false, error: 'Usuario ou senha invalidos' };
    }

    // Inicializa vault com a senha do usuario
    const initialized = await initStronghold(credentials.password);
    if (!initialized) {
      return { success: false, error: 'Erro ao inicializar armazenamento seguro' };
    }

    const user: AuthUser = {
      username,
      role: userData.role,
      lastLogin: Date.now(),
    };

    // Salva usuario no vault
    await saveAuthUser(user);

    this.state = {
      isAuthenticated: true,
      currentUser: user,
      biometricEnabled: false,
    };

    return { success: true };
  }

  /**
   * Habilita biometria para proximos logins.
   */
  async enableBiometric(): Promise<boolean> {
    if (!this.state.isAuthenticated || !this.state.currentUser) {
      return false;
    }

    const bioStatus = await getBiometricStatus();
    if (!bioStatus.isAvailable) {
      return false;
    }

    // Solicita biometria para confirmar
    const confirmed = await authenticateWithBiometric(
      'Confirme para habilitar login biometrico'
    );

    if (!confirmed) {
      return false;
    }

    // Re-salva usuario com chave biometrica
    await closeStronghold();
    await initStronghold(BIOMETRIC_VAULT_KEY);
    await saveAuthUser(this.state.currentUser);

    this.state.biometricEnabled = true;
    return true;
  }

  /**
   * Logout.
   */
  async logout(): Promise<void> {
    await clearAuthUser();
    await closeStronghold();

    this.state = {
      isAuthenticated: false,
      currentUser: null,
      biometricEnabled: false,
    };
  }

  /**
   * Retorna estado atual.
   */
  getState(): AuthState {
    return { ...this.state };
  }

  /**
   * Retorna status de biometria.
   */
  async getBiometricStatus(): Promise<BiometricStatus> {
    return getBiometricStatus();
  }
}

// Singleton
export const authService = new AuthService();
```

**Step 2:** Commit

```bash
git add src/services/auth/index.ts
git commit -m "feat(auth): Cria AuthService orquestrando Stronghold e Biometric"
```

---

## Fase 4: Frontend - Integracao com UI

### Task 4.1: Atualizar App.tsx para usar AuthService

**Files:** Modify `App.tsx`

**Step 1:** Remover auth hardcoded e importar AuthService

Substituir:
```typescript
// Auth credentials (hardcoded for simplicity)
const AUTH_USERS: Record<string, string> = {
  'MCBS': 'Chicago00@',
  'PGR': 'Chicago00@',
};
```

Por:
```typescript
import { authService, type AuthState, type BiometricStatus } from './src/services/auth';
```

**Step 2:** Atualizar estados de auth no componente

Substituir estados atuais por:
```typescript
// Auth State
const [authState, setAuthState] = useState<AuthState>({
  isAuthenticated: false,
  currentUser: null,
  biometricEnabled: false,
});
const [biometricStatus, setBiometricStatus] = useState<BiometricStatus>({
  isAvailable: false,
  biometryType: 'none',
});
const [loginUsername, setLoginUsername] = useState('');
const [loginPassword, setLoginPassword] = useState('');
const [loginError, setLoginError] = useState<string | null>(null);
const [isAuthLoading, setIsAuthLoading] = useState(true);
```

**Step 3:** Adicionar useEffect para auto-login

```typescript
// Tentar biometria no mount
useEffect(() => {
  const initAuth = async () => {
    setIsAuthLoading(true);

    // Verifica status biometrico
    const bioStatus = await authService.getBiometricStatus();
    setBiometricStatus(bioStatus);

    // Tenta login automatico via biometria
    const success = await authService.tryBiometricAuth();
    if (success) {
      setAuthState(authService.getState());
    }

    setIsAuthLoading(false);
  };

  initAuth();
}, []);
```

**Step 4:** Atualizar handleLogin

```typescript
const handleLogin = async () => {
  setLoginError(null);
  setIsAuthLoading(true);

  const result = await authService.loginWithCredentials({
    username: loginUsername,
    password: loginPassword,
  });

  if (result.success) {
    setAuthState(authService.getState());
  } else {
    setLoginError(result.error || 'Erro desconhecido');
  }

  setIsAuthLoading(false);
};
```

**Step 5:** Atualizar handleLogout

```typescript
const handleLogout = async () => {
  await authService.logout();
  setAuthState(authService.getState());
  setLoginUsername('');
  setLoginPassword('');
};
```

**Step 6:** Commit

```bash
git add App.tsx
git commit -m "feat(auth): Integra AuthService no App.tsx"
```

---

### Task 4.2: Atualizar tela de login

**Files:** Modify `App.tsx`

**Step 1:** Atualizar condicional de login para usar authState

Substituir `if (!isAuthenticated)` por `if (!authState.isAuthenticated)`

**Step 2:** Adicionar indicador de loading e opcao biometrica

```tsx
// Login Screen
if (!authState.isAuthenticated) {
  return (
    <div
      className="flex items-center justify-center w-full h-screen"
      style={{ backgroundColor: bgColor, color: textColor, fontFamily: fontFamily }}
    >
      <div className="w-full max-w-sm p-8 bg-white/5 border border-white/10 rounded-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeColor}aa)` }}
          >
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-bold">Pro ATT Machine</h1>
          <p className="text-xs opacity-50 mt-1">v0.2.0</p>
        </div>

        {isAuthLoading ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: themeColor }} />
            <p className="text-sm opacity-60">Verificando autenticacao...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Biometric Button (mobile only) */}
            {biometricStatus.isAvailable && (
              <button
                onClick={async () => {
                  setIsAuthLoading(true);
                  const success = await authService.tryBiometricAuth();
                  if (success) {
                    setAuthState(authService.getState());
                  } else {
                    setLoginError('Autenticacao biometrica falhou');
                  }
                  setIsAuthLoading(false);
                }}
                className="w-full py-3 rounded border border-white/20 flex items-center justify-center gap-2 hover:bg-white/5 transition-colors"
              >
                <Fingerprint className="w-5 h-5" />
                <span className="text-sm">
                  {biometricStatus.biometryType === 'faceId' ? 'Face ID' : 'Biometria'}
                </span>
              </button>
            )}

            {biometricStatus.isAvailable && (
              <div className="flex items-center gap-3 text-[10px] opacity-40">
                <div className="flex-1 h-px bg-white/20"></div>
                <span>ou</span>
                <div className="flex-1 h-px bg-white/20"></div>
              </div>
            )}

            {/* Username */}
            <div>
              <label className="text-[10px] opacity-60 mb-1 block">Usuario</label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="MCBS ou PGR"
                className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded text-sm focus:outline-none focus:border-white/30"
                autoFocus={!biometricStatus.isAvailable}
              />
            </div>

            {/* Password */}
            <div>
              <label className="text-[10px] opacity-60 mb-1 block">Senha</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="********"
                className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded text-sm focus:outline-none focus:border-white/30"
              />
            </div>

            {/* Error */}
            {loginError && (
              <p className="text-xs text-red-400 text-center">{loginError}</p>
            )}

            {/* Submit */}
            <button
              onClick={handleLogin}
              disabled={isAuthLoading}
              className="w-full py-2.5 rounded font-medium text-sm transition-colors disabled:opacity-50"
              style={{ backgroundColor: themeColor, color: 'white' }}
            >
              {isAuthLoading ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 3:** Adicionar import do icone Fingerprint (ou usar outro disponivel)

```typescript
// No topo do arquivo, verificar se Fingerprint existe no lucide-react
// Se nao, usar Users ou outro icone disponivel
```

**Step 4:** Commit

```bash
git add App.tsx
git commit -m "feat(auth): Atualiza tela de login com suporte biometrico"
```

---

### Task 4.3: Adicionar toggle de biometria no Settings

**Files:** Modify `App.tsx`

**Step 1:** Adicionar secao no Settings para habilitar biometria

Dentro do Settings Modal, apos a secao de API Key:

```tsx
{/* Biometric Settings (mobile only) */}
{biometricStatus.isAvailable && (
  <div className="space-y-2">
    <h3 className="text-xs font-bold opacity-50 uppercase tracking-wider flex items-center gap-2">
      <Fingerprint className="w-3 h-3" /> Seguranca
    </h3>
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-sm border border-white/5">
      <div>
        <p className="text-xs font-medium">Login Biometrico</p>
        <p className="text-[10px] opacity-50">
          {biometricStatus.biometryType === 'faceId' ? 'Face ID' : 'Fingerprint'}
        </p>
      </div>
      <button
        onClick={async () => {
          if (!authState.biometricEnabled) {
            const enabled = await authService.enableBiometric();
            if (enabled) {
              setAuthState(authService.getState());
              addLog('Biometria habilitada', 'success');
            } else {
              addLog('Falha ao habilitar biometria', 'error');
            }
          }
        }}
        className={`w-10 h-5 rounded-full relative transition-colors ${
          authState.biometricEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
        }`}
      >
        <div
          className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${
            authState.biometricEnabled ? 'left-6' : 'left-1'
          }`}
        />
      </button>
    </div>
  </div>
)}
```

**Step 2:** Commit

```bash
git add App.tsx
git commit -m "feat(auth): Adiciona toggle de biometria no Settings"
```

---

## Fase 5: Configuracao Mobile

### Task 5.1: Configurar permissoes Android

**Files:** Modify `src-tauri/gen/android/app/src/main/AndroidManifest.xml`

**Step 1:** Adicionar permissao de biometria

```xml
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
```

**Step 2:** Commit (se arquivo existir)

```bash
git add src-tauri/gen/android/ || true
git commit -m "feat(android): Adiciona permissao USE_BIOMETRIC" || true
```

---

### Task 5.2: Configurar permissoes iOS

**Files:** Create/Modify `src-tauri/Info.plist`

**Step 1:** Adicionar descricao de uso do Face ID

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSFaceIDUsageDescription</key>
    <string>Use Face ID para acessar o Pro ATT Machine de forma segura</string>
</dict>
</plist>
```

**Step 2:** Commit

```bash
git add src-tauri/Info.plist || true
git commit -m "feat(ios): Adiciona NSFaceIDUsageDescription" || true
```

---

## Fase 6: Build e Teste

### Task 6.1: Build desktop

**Step 1:** Build frontend

```bash
bun run build
```

Expected: Build sem erros

**Step 2:** Build Tauri

```bash
bun run tauri build
```

Expected: Build completo (~1-2 min)

**Step 3:** Testar login/logout no desktop

- Abrir app
- Fazer login com MCBS/Chicago00@
- Verificar que Settings mostra usuario logado
- Fazer logout
- Verificar que volta para tela de login

---

### Task 6.2: Build Android (quando for fazer APK)

**Step 1:** Inicializar projeto Android (se nao existir)

```bash
bun run tauri android init
```

**Step 2:** Build APK

```bash
bun run tauri android build
```

**Step 3:** Testar biometria no device

- Instalar APK no device com biometria configurada
- Fazer login com credenciais
- Habilitar biometria no Settings
- Fechar app completamente
- Reabrir - deve pedir biometria

---

## Resumo: 15 Tasks em 6 Fases

| Fase | Tasks | Foco |
|------|-------|------|
| 1 | 1.1-1.4 | Backend Rust (deps + plugins) |
| 2 | 2.1 | Frontend deps |
| 3 | 3.1-3.4 | Servico de autenticacao |
| 4 | 4.1-4.3 | Integracao com UI |
| 5 | 5.1-5.2 | Permissoes mobile |
| 6 | 6.1-6.2 | Build e teste |

**Estimativa:** ~2-3h para implementacao completa

**Dependencias criticas:**
- Fase 1 antes de Fase 3 (plugins Rust precisam existir)
- Fase 3 antes de Fase 4 (servicos antes de UI)
- Fase 5 so necessaria para build mobile
