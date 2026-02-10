# Plano de Refatoração do Monolito App.tsx

**Objetivo:** Reestruturar o arquivo `App.tsx` para desacoplar a lógica de negócio, o gerenciamento de estado e a renderização da UI, melhorando a manutenibilidade, legibilidade e escalabilidade do frontend.

**Estratégia Geral:** A refatoração será baseada na extração da lógica para hooks customizados e serviços, utilizando um Contexto React para prover o estado globalmente e evitar "prop drilling".

---

### Fase 1: Criação de Hooks Customizados para Lógica de Negócio

O primeiro passo é isolar a lógica de negócio e o gerenciamento de estado em hooks customizados. Cada hook será responsável por uma área funcional específica do aplicativo.

**Arquivos a Criar:**
- `src/hooks/useAuth.ts`
- `src/hooks/usePersistence.ts`
- `src/hooks/useUpdater.ts`
- `src/hooks/useSidecar.ts`
- `src/hooks/useAudioRecording.ts`
- `src/hooks/useTranscription.ts`
- `src/hooks/useTTS.ts`
- `src/hooks/useSettings.ts`

**Passos:**
1.  **`useAuth.ts`**: Mover toda a lógica de autenticação (estados `isAuthenticated`, `currentUser`, `loginError`, e as funções `handleLogin`, `handleLogout`).
2.  **`usePersistence.ts`**: Mover todas as funções de interação com IndexedDB e Tauri Store (`initDB`, `saveAudioToDB`, `loadHistory`, `saveHistory`, `saveContextToDB`, etc.). Este hook irá gerenciar o estado do histórico (`history`) e dos contextos (`contextPools`, `contextMemory`).
3.  **`useUpdater.ts`**: Mover a lógica de verificação de atualização (`checkForUpdatesDesktop`, `checkForUpdatesAndroid`) e os estados relacionados (`updateStatus`, `updateVersion`, `updateProgress`).
4.  **`useSidecar.ts`**: Mover a lógica de conexão e monitoramento do Voice AI Sidecar (`checkSidecar`, `testWhisperServer`) e seus estados (`sidecarAvailable`, `sidecarStatus`, `whisperServerUrl`, etc.).
5.  **`useAudioRecording.ts`**: Mover os estados e lógicas de gravação de áudio (`isRecording`, `audioBlob`, `mediaRecorder`, `startRecording`, `stopRecording`, `handleFileUpload`, `availableMics`, `selectedMicId`).
6.  **`useTranscription.ts`**: Mover a lógica de processamento principal (`processAudio`), o estado da transcrição (`transcription`) e os estados relacionados (`isProcessing`, `lastStats`, `outputStyle`, `aiModel`).
7.  **`useTTS.ts`**: Mover os estados (`isSpeaking`, `ttsAudioUrl`) e a lógica de Text-to-Speech (`handleReadText`, `stopReadText`, configurações de TTS).
8.  **`useSettings.ts`**: Mover os estados de todas as configurações que não são centrais para outras lógicas (ex: `themeColor`, `fontFamily`, `fontSize`, `isSettingsOpen`, `apiKey` e a lógica de salvar a chave).

---

### Fase 2: Implementação do Contexto Global

Para evitar passar dezenas de props entre os componentes, um contexto global será criado para prover acesso aos estados e funções dos hooks.

**Arquivo a Criar:**
- `src/context/GlobalAppContext.tsx`

**Passos:**
1.  Definir uma interface `AppContextType` que agrega os tipos de retorno de todos os hooks criados na Fase 1.
2.  Criar o `AppContext` usando `createContext`.
3.  Criar um componente `AppProvider` que:
    - Inicializa todos os hooks customizados.
    - Passa os valores dos hooks para o `AppContext.Provider`.
    - Renderiza `{children}`.

---

### Fase 3: Refatoração do `App.tsx` e Componentes Filhos

Com os hooks e o contexto prontos, o `App.tsx` será simplificado drasticamente.

**Arquivo a Modificar:**
- `App.tsx`
- Todos os componentes em `src/components/panels/` e `src/components/editor/`

**Passos:**
1.  **Modificar `index.tsx` (ou arquivo de entrada principal)**: Envolver o componente `<App />` com o novo `<AppProvider />`.
2.  **Limpar `App.tsx`**:
    - Remover todos os `useState`, `useEffect` e funções que foram movidos para os hooks.
    - Manter apenas a estrutura JSX principal.
    - O `App` agora renderizará apenas o layout principal (`AppLayout`) e os modais. A lógica de visibilidade dos modais virá do hook `useSettings` via contexto.
3.  **Refatorar Componentes Filhos (`PanelATT`, `PanelConfig`, `Editor`, etc.)**:
    - Remover a recepção de múltiplas props.
    - Usar o hook `useContext(AppContext)` para acessar os estados e funções necessários diretamente do contexto.
    - **Exemplo em `PanelATT.tsx`**: Em vez de receber `isRecording`, `onStartRecording`, `onStopRecording`, etc., como props, o componente fará `const { isRecording, startRecording, stopRecording } = useContext(AppContext);`.

---

### Fase 4: Organização de Arquivos e Serviços

Finalizar a organização, garantindo que os helpers e serviços também estejam em seus próprios módulos.

**Arquivos a Mover/Criar:**
- `src/services/AudioUtils.ts`
- `src/types/index.ts`

**Passos:**
1.  Mover funções utilitárias puras como `blobToBase64`, `bufferToWav`, `analyzeAudioContent` para `src/services/AudioUtils.ts`.
2.  Mover todas as definições de `type` (ex: `RecordingStyle`, `OutputStyle`, `ProcessingStats`) para um arquivo central de tipos `src/types/index.ts` para serem compartilhadas entre os hooks e componentes.

Este plano resultará em uma base de código muito mais limpa, organizada e fácil de manter, onde cada arquivo tem uma responsabilidade única e bem definida.
