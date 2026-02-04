/**
 * useAudioProcessing - Hook para processamento de audio (transcricao)
 *
 * Responsabilidades:
 * - Gerenciar estado de processamento
 * - Determinar modo de transcricao (Local Whisper vs Cloud Gemini)
 * - Aplicar estilos de output (Verbatim, Elegant Prose, Prompt, etc.)
 * - Calcular estatisticas de processamento
 * - Persistir transcricao em localStorage
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import {
  VoiceAIClient,
  type OutputStyle as SidecarOutputStyle,
} from '../services/VoiceAIClient';

// ============================================================
// Types
// ============================================================

export type OutputStyle =
  | 'Whisper Only'
  | 'Verbatim'
  | 'Elegant Prose'
  | 'Ana Suy'
  | 'Poetic / Verses'
  | 'Normal'
  | 'Verbose'
  | 'Concise'
  | 'Formal'
  | 'Prompt (Claude)'
  | 'Prompt (Gemini)'
  | 'Bullet Points'
  | 'Summary'
  | 'Tech Docs'
  | 'Email'
  | 'Tweet Thread'
  | 'Code Generator'
  | 'Custom';

export type ProcessingStats = {
  processingTime: number; // ms
  audioDuration: number; // seconds
  inputSize: number; // bytes
  wordCount: number;
  charCount: number;
  readingTime: string;
  appliedStyle: string;
};

export type RecordingStyle = 'Dictation' | 'Interview' | 'Meeting';

export interface UseAudioProcessingConfig {
  audioBlob: Blob | null;
  outputStyle: OutputStyle;
  outputLanguage: string;
  customStylePrompt: string;
  transcriptionMode: 'auto' | 'local' | 'cloud';
  sidecarAvailable: boolean;
  apiKey: string;
  aiModel: string;
  activeContext: string;
  contextMemory: Record<string, string>;
  recordingStyle: RecordingStyle;
  recordingStartTime: number;
  voiceAIClient: VoiceAIClient | null;
  addLog: (msg: string, type: 'info' | 'success' | 'error' | 'warning') => void;
  addToHistory: (text: string, date: string, id: string) => void;
  updateContextMemory: (ctx: string, memory: string) => void;
  saveContextToDB: (item: { name: string; memory: string; lastUpdated: number }) => Promise<void>;
  onProcessingStart?: () => void;
  setActiveTab?: (tab: string) => void;
  setMobileView?: (view: string) => void;
}

export interface UseAudioProcessingReturn {
  isProcessing: boolean;
  transcription: string;
  setTranscription: (text: string) => void;
  lastStats: ProcessingStats | null;
  processAudio: () => Promise<void>;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Converte Blob para base64 (sem prefixo data:)
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Gera ID unico para historico
 */
const generateHistoryId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// ============================================================
// Hook
// ============================================================

export function useAudioProcessing(config: UseAudioProcessingConfig): UseAudioProcessingReturn {
  const {
    audioBlob,
    outputStyle,
    outputLanguage,
    customStylePrompt,
    transcriptionMode,
    sidecarAvailable,
    apiKey,
    aiModel,
    activeContext,
    contextMemory,
    recordingStyle,
    recordingStartTime,
    voiceAIClient,
    addLog,
    addToHistory,
    updateContextMemory,
    saveContextToDB,
    onProcessingStart,
    setActiveTab,
    setMobileView,
  } = config;

  // Estados
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState<string>(() => {
    return localStorage.getItem('gemini_current_work') || "";
  });
  const [lastStats, setLastStats] = useState<ProcessingStats | null>(null);

  // Persistir transcricao em localStorage
  useEffect(() => {
    localStorage.setItem('gemini_current_work', transcription);
  }, [transcription]);

  /**
   * Processa audio usando Local (Whisper) ou Cloud (Gemini)
   */
  const processAudio = useCallback(async () => {
    if (!audioBlob) return;

    // Determina se deve usar STT local
    const useLocalSTT = (transcriptionMode === 'local' || (transcriptionMode === 'auto' && sidecarAvailable)) && sidecarAvailable;

    // Apenas requer API key se usando cloud ou refinando com Gemini
    const currentApiKey = apiKey || process.env.API_KEY;
    if (!useLocalSTT && !currentApiKey) {
      addLog("API Key nao configurada. Va em Settings para adicionar.", 'error');
      onProcessingStart?.();
      return;
    }

    setIsProcessing(true);
    setActiveTab?.('stats');

    // Em mobile, muda para view do editor
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMobileView?.('editor');
    }

    const startTime = performance.now();

    try {
      // --- LOCAL STT MODE (Whisper via Sidecar) ---
      if (useLocalSTT && voiceAIClient) {
        addLog('Transcrevendo localmente com Whisper...', 'info');

        // Converte blob para base64
        const base64Audio = await VoiceAIClient.blobToBase64(audioBlob);
        const format = VoiceAIClient.getFormatFromMimeType(audioBlob.type);

        // Mapeia OutputStyle para SidecarOutputStyle
        const sidecarStyleMap: Record<string, SidecarOutputStyle> = {
          'Whisper Only': 'verbatim',
          'Verbatim': 'verbatim',
          'Elegant Prose': 'elegant_prose',
          'Formal': 'formal',
          'Normal': 'verbatim',
          'Concise': 'summary',
          'Summary': 'summary',
          'Bullet Points': 'bullet_points',
        };
        const sidecarStyle = sidecarStyleMap[outputStyle] || 'verbatim';

        // Whisper Only, Verbatim e Normal bypassam Gemini
        const shouldRefine = currentApiKey && !['Whisper Only', 'Verbatim', 'Normal'].includes(outputStyle);

        try {
          const result = await voiceAIClient.transcribe({
            audio: base64Audio,
            format,
            language: outputLanguage === 'Portuguese' ? 'pt' : outputLanguage === 'Spanish' ? 'es' : 'en',
            refine: shouldRefine,
            style: sidecarStyle,
          });

          // Usa texto refinado se disponivel
          let finalText = result.refined_text || result.text;

          // Regra de filename
          const currentMemory = contextMemory[activeContext] || "No previous context.";
          if (currentApiKey && shouldRefine && result.refined_text) {
            finalText = result.refined_text;
          }

          // Adiciona sugestao de filename se nao presente
          if (!finalText.includes('\n\n')) {
            const firstWords = finalText.split(/\s+/).slice(0, 5).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
            finalText = `${firstWords || 'transcription'}\n\n${finalText}`;
          }

          setTranscription(finalText);

          // Atualiza Context Memory
          const updatedMemory = (currentMemory + "\n" + finalText).slice(-5000);
          updateContextMemory(activeContext, updatedMemory);

          saveContextToDB({
            name: activeContext,
            memory: updatedMemory,
            lastUpdated: Date.now()
          }).catch(e => console.error("Auto-save failed", e));

          // Calcula Stats
          const endTime = performance.now();
          const cleanedText = finalText.trim();
          const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;
          const charCount = cleanedText.length;
          const wpm = 200;
          const readingTimeVal = Math.ceil(wordCount / wpm);

          const newStats: ProcessingStats = {
            processingTime: endTime - startTime,
            audioDuration: result.duration,
            inputSize: audioBlob.size,
            wordCount,
            charCount,
            readingTime: `${readingTimeVal} min read`,
            appliedStyle: outputStyle
          };

          setLastStats(newStats);

          // Adiciona ao historico
          addToHistory(cleanedText, new Date().toISOString(), generateHistoryId());

          const mode = result.refine_success ? 'Local + Gemini refinement' : 'Local (Whisper)';
          addLog(`Transcricao completa via ${mode}`, 'success');
          setIsProcessing(false);
          return;

        } catch (sidecarError: any) {
          // Fallback para cloud se sidecar falhar
          addLog(`Sidecar falhou: ${sidecarError.message}. Tentando Gemini...`, 'warning');
          if (!currentApiKey) {
            addLog("Fallback para Gemini requer API Key.", 'error');
            setIsProcessing(false);
            return;
          }
          // Continua para modo cloud abaixo
        }
      }

      // --- CLOUD MODE (Gemini Direct) ---
      const base64Audio = await blobToBase64(audioBlob);
      const ai = new GoogleGenAI({ apiKey: currentApiKey! });

      // Obtem memoria do contexto atual
      const currentMemory = contextMemory[activeContext] || "No previous context.";

      // --- SPLIT CRITICO: LITERARY VS. PROMPT ARCHITECT VS. VERBATIM ---
      const isPromptEngineeringMode = [
        'Prompt (Claude)',
        'Prompt (Gemini)',
        'Code Generator',
        'Tech Docs',
        'Bullet Points'
      ].includes(outputStyle);

      const isVerbatimMode = outputStyle === 'Verbatim' || outputStyle === 'Whisper Only';

      const isPortuguese = outputLanguage === 'Portuguese';

      let systemPrompt = "";

      if (isPromptEngineeringMode) {
        // --- MODE A: SENIOR PROMPT ARCHITECT (Strict, Technical, XML/Markdown) ---

        let formatInstruction = "";
        if (outputStyle === 'Prompt (Claude)') {
          formatInstruction = `
            CRITICAL OUTPUT FORMATTING:
            - You MUST wrap the final prompt in XML tags: <prompt_configuration> ... </prompt_configuration>
            - Use tags like <role>, <context>, <task>, <constraints>, <output_format> to structure the prompt.
            - Do NOT use Markdown headers (##). Use XML delimiters.
            `;
        } else if (outputStyle === 'Prompt (Gemini)') {
          formatInstruction = `
            ## Prompt Engineering Directives:
            * **Minimize Interpretation:** Reduce subjective interpretation of the input.
            * **Idea Refinement:** Prioritize clarification of the core idea.
            * **Output Format Conjecturing:** Actively anticipate the optimal format.
            * **Order Preservation:** Maintain original sequence.
            * **No Merging:** Do not combine distinct requests.
            * **Independent Delineation:** Distinct requests must be separated.

            FORMAT: Use clear Markdown headers (## Role, ## Task, ## Constraints). Bullet points for clarity.
            `;
        } else if (outputStyle === 'Code Generator') {
          formatInstruction = `OUTPUT ONLY VALID CODE inside Markdown code blocks. No conversational filler.`;
        } else {
          formatInstruction = `Format as a structured technical document.`;
        }

        systemPrompt = `
          ROLE: You are a Senior Prompt Engineer and Technical Architect.

          TASK: Reverse-engineer the user's spoken audio into a professional, high-fidelity LLM Prompt or Technical Document.

          INPUT ANALYSIS:
          - Listen to the user's intent, not just their words.
          - Filter out "thinking noises", hesitation, and non-technical filler.
          - Extract the core logic, business rules, or creative requirements.

          TONE & STYLE:
          - Imperative, Direct, Incisive.
          - No "Please" or "Would you kindly".
          - Unambiguous instructions.
          - High information density.

          CONTEXT MEMORY:
          "${currentMemory.slice(-2000)}"

          TARGET LANGUAGE: ${outputLanguage}

          ${formatInstruction}

          EXECUTION:
          - Transform the raw audio transcript into the requested format immediately.
          - Do not strictly transcribe; ARCHITECT the response.
        `;

      } else if (isVerbatimMode) {
        // --- MODE C: FLAWLESS TRANSCRIPTION (Verbatim) ---
        systemPrompt = `
          ROLE: You are a professional, high-fidelity transcription engine.

          TASK: Convert the spoken audio into text with absolute accuracy.

          RULES:
          1. **Verbatim Fidelity:** Transcribe exactly what is said. Do not paraphrase.
          2. **Punctuation:** Add standard punctuation for readability, but do not alter sentence structure.
          3. **Filler Words:** Remove excessive stuttering or non-lexical sounds (um, uh) ONLY if they distract significantly. Keep them if they add context/hesitation.
          4. **No Meta-Commentary:** Do NOT add "Here is the transcript:" or any intro. Just the text.

          TARGET LANGUAGE: ${outputLanguage}

          CONTEXT MEMORY (For terminology reference only):
          "${currentMemory.slice(-2000)}"
        `;
      } else {
        // --- MODE B: LITERARY EDITOR (Preserved Legacy Logic) ---
        // Handles 'Elegant Prose', 'Ana Suy', 'Normal', etc.

        let styleInstruction = "";
        if (isPortuguese) {
          const instructions: Record<string, string> = {
            'Elegant Prose': `REGRAS: 1. Tom: Claro, sofisticado e preciso. Evite floreios. 2. Formato: Prosa continua (paragrafos). 3. Voz: Refinada. 4. Objetivo: Texto bem escrito.`,
            'Ana Suy': `REGRAS - ANA SUY: 1. Tom: Intimo e psicanalitico. Ouca os *silencios*. 2. Voz: Poetica e acessivel. 3. Foco: Experiencia subjetiva. 4. Estrutura: Fluida, paragrafos de prosa.`,
            'Poetic / Verses': `REGRAS - POETICO: 1. Estrutura: Quebras de linha e estrofes baseadas no ritmo. 2. Tom: Lirico e evocativo. 3. Objetivo: Verso livre.`,
            'Normal': `Texto padrao, gramaticalmente correto e fluido. Sem girias excessivas.`,
            'Verbose': `Seja detalhista e expansivo. Explore cada ponto a fundo.`,
            'Concise': `Seja direto e economico. Remova qualquer redundancia.`,
            'Formal': `Use linguagem culta, profissional e impessoal.`,
            'Summary': `Forneca um resumo executivo de alto nivel em 1-2 paragrafos.`,
            'Email': `Formate como um e-mail profissional.`,
            'Tweet Thread': `Formate como uma thread viral do Twitter/X.`,
            'Custom': `Siga estas instrucoes: "${customStylePrompt}".`
          };
          styleInstruction = instructions[outputStyle] || `Adapte para o estilo ${outputStyle}.`;
        } else {
          if (outputStyle === 'Elegant Prose') {
            styleInstruction = `
            TRANSFORMATION RULES:
            1. Tone: Clear, sophisticated, and precise. Avoid flowery or overwrought language.
            2. Format: Continuous prose (paragraphs). Do NOT use verse, stanzas, or line breaks for effect unless strictly necessary.
            3. Voice: Refined but accessible. Not stiff or overly formal. Avoid academic jargon.
            4. Goal: Make it sound like a well-written creative piece or essay. Focus on clarity and rhythm rather than ornamentation.
            `;
          } else if (outputStyle === 'Ana Suy') {
            styleInstruction = `
            TRANSFORMATION RULES - ANA SUY STYLE:
            1. Tone: Intimate and psychoanalytic. Pay close attention to the *silences* and what is left unsaid.
            2. Voice: Poetic but accessible. Use simple words to describe complex feelings.
            3. Techniques: Use the speaker's pauses to structure the text (using ellipses or paragraph breaks). Focus on the *subjective experience*.
            4. Structure: Fluid, organic, and polished. Do NOT use poem/verse format. Use prose paragraphs.
            `;
          } else if (outputStyle === 'Poetic / Verses') {
            styleInstruction = `TRANSFORMATION RULES - POETIC STYLE: Structure using line breaks and stanzas. Tone: Artistic, lyrical.`;
          } else if (outputStyle === 'Summary') {
            styleInstruction = `Provide a high-level executive summary of the content in 1-2 paragraphs.`;
          } else if (outputStyle === 'Email') {
            styleInstruction = `Format as a professional email draft based on the content. Subject line included.`;
          } else if (outputStyle === 'Tweet Thread') {
            styleInstruction = `Format as a viral Twitter/X thread. Short, punchy sentences. 280 chars per tweet limit simulation.`;
          } else if (outputStyle === 'Custom') {
            styleInstruction = `Follow these specific user instructions: "${customStylePrompt}".`;
          } else {
            styleInstruction = `Adapt the output to be ${outputStyle} in tone and length.`;
          }
        }

        systemPrompt = `
          Role: You are an expert literary editor and ghostwriter with a keen ear for vocal nuance.

          Goal: Transform the spoken audio into text that captures not just the words, but the *spirit* and *intent* of the speaker.

          CRITICAL TEXT REFINEMENT INSTRUCTIONS (ALL STYLES):
          1. **STRICTLY REMOVE FLUFF:** You MUST remove all verbal tics, hesitations, and filler words.
          2. **CLEAN SYNTAX:** Repair broken sentences and linguistic crutches.
          3. **RECORDING MODE: ${recordingStyle.toUpperCase()}**
          ${recordingStyle === 'Interview' ? '- IDENTIFY SPEAKERS: Differentiate between voices if possible.' : '- MONOLOGUE: Treat this as a single cohesive stream of thought.'}

          CRITICAL AUDIO ANALYSIS INSTRUCTIONS:
          1. Listen for Tone: Analyze the speaker's prosody.
          2. Respect Pauses: Use punctuation to reflect the natural breathing.
          3. "Show, Don't Tell": Choose words that convey emotion.

          ${outputStyle !== 'Poetic / Verses' ? '4. FORMAT CONSTRAINT: Output in standard PROSE paragraphs. Do NOT produce poetry or verse unless explicitly instructed.' : ''}

          Context / Memory:
          "${currentMemory.slice(-2000)}"

          Configuration:
          - Target Language: ${outputLanguage}
          - Style Requirement: ${styleInstruction}

          Output:
          Return ONLY the refined text. No preambles or conversational filler.
        `;
      }

      // --- FORCE FILENAME RULE ---
      systemPrompt += `

      MANDATORY OUTPUT STRUCTURE:
      Line 1: Suggested filename for this content (concise, valid chars, no extension, no "Filename:" prefix).
      Line 2: [Empty]
      Line 3+: The actual content.
      `;

      // FIX: Payload structure simplified to prevent 500 errors on multimodal requests
      const response = await ai.models.generateContent({
        model: aiModel,
        config: {
          temperature: isPromptEngineeringMode ? 0.2 : isVerbatimMode ? 0.1 : 0.4,
        },
        contents: {
          parts: [
            { inlineData: { mimeType: audioBlob.type || 'audio/webm', data: base64Audio } },
            { text: systemPrompt }
          ]
        }
      });

      const text = response.text || "";
      const cleanedText = text.trim();
      setTranscription(cleanedText);

      // Atualiza Context Memory (RAG-lite)
      const updatedMemory = (currentMemory + "\n" + cleanedText).slice(-5000);
      updateContextMemory(activeContext, updatedMemory);

      // Async DB Update (Fire & Forget para melhor responsividade da UI)
      saveContextToDB({
        name: activeContext,
        memory: updatedMemory,
        lastUpdated: Date.now()
      }).then(() => {
        // Silent success
      }).catch(e => console.error("Auto-save failed", e));

      // Calcula Stats
      const endTime = performance.now();
      const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;
      const charCount = cleanedText.length;
      const wpm = 200; // Average reading speed
      const readingTimeVal = Math.ceil(wordCount / wpm);

      const newStats: ProcessingStats = {
        processingTime: endTime - startTime,
        audioDuration: recordingStartTime > 0 ? (Date.now() - recordingStartTime) / 1000 : 0,
        inputSize: audioBlob.size,
        wordCount: wordCount,
        charCount: charCount,
        readingTime: `${readingTimeVal} min read`,
        appliedStyle: outputStyle
      };

      setLastStats(newStats);

      // Adiciona ao historico
      addToHistory(cleanedText, new Date().toISOString(), generateHistoryId());
      addLog("Processing complete & Memory secured.", 'success');

    } catch (err: any) {
      console.error(err);
      addLog(`Error: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [
    audioBlob,
    outputStyle,
    outputLanguage,
    customStylePrompt,
    transcriptionMode,
    sidecarAvailable,
    apiKey,
    aiModel,
    activeContext,
    contextMemory,
    recordingStyle,
    recordingStartTime,
    voiceAIClient,
    addLog,
    addToHistory,
    updateContextMemory,
    saveContextToDB,
    onProcessingStart,
    setActiveTab,
    setMobileView,
  ]);

  return {
    isProcessing,
    transcription,
    setTranscription,
    lastStats,
    processAudio,
  };
}

export default useAudioProcessing;
