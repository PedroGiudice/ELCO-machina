/**
 * useAudioProcessing - Hook para processamento de audio (transcricao)
 *
 * Pipeline de dois estagios:
 * 1. Whisper STT puro (via sidecar) - transcricao bruta
 * 2. Gemini text-only refinement - refinamento por estilo
 *
 * Responsabilidades:
 * - Gerenciar estado de processamento
 * - Transcrever via Whisper local (sidecar)
 * - Refinar texto via Gemini (text-only, sem audio)
 * - Aplicar estilos de output (Verbatim, Elegant Prose, Prompt, etc.)
 * - Calcular estatisticas de processamento
 * - Persistir transcricao em localStorage
 */

import { useState, useCallback, useEffect } from 'react';
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
   * Processa audio: Whisper STT puro + Gemini text-only refinement
   */
  const processAudio = useCallback(async () => {
    if (!audioBlob) return;

    // Determina se deve usar STT local
    const useLocalSTT = (transcriptionMode === 'local' || (transcriptionMode === 'auto' && sidecarAvailable)) && sidecarAvailable;

    // API key necessaria apenas para refinamento Gemini (opcional)
    const currentApiKey = apiKey || process.env.API_KEY;
    if (!useLocalSTT) {
      addLog("Whisper indisponivel (Tailscale desconectado ou sidecar offline).", 'error');
      addLog("Conecte o Tailscale para transcrever audio.", 'info');
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
      // --- Funcao auxiliar: monta system prompt para refinamento text-only ---
      const buildStylePrompt = (rawText: string): string => {
        const currentMemory = contextMemory[activeContext] || "No previous context.";

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

            TASK: Reverse-engineer the user's transcribed text into a professional, high-fidelity LLM Prompt or Technical Document.

            INPUT ANALYSIS:
            - Analyze the user's intent from the transcribed text.
            - Filter out hesitation markers, filler words, and non-technical noise.
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
            - Transform the transcribed text into the requested format immediately.
            - Do not echo the input; ARCHITECT the response.
          `;

        } else if (isVerbatimMode) {
          systemPrompt = `
            ROLE: You are a professional text cleanup engine.

            TASK: Clean up the transcribed text with minimal changes.

            RULES:
            1. **Fidelity:** Preserve the original meaning and structure.
            2. **Punctuation:** Add standard punctuation for readability, but do not alter sentence structure.
            3. **Filler Words:** Remove excessive filler words (um, uh, tipo) ONLY if they distract significantly.
            4. **No Meta-Commentary:** Do NOT add "Here is the text:" or any intro. Just the cleaned text.

            TARGET LANGUAGE: ${outputLanguage}

            CONTEXT MEMORY (For terminology reference only):
            "${currentMemory.slice(-2000)}"
          `;
        } else {
          // --- LITERARY EDITOR ---
          let styleInstruction = "";
          if (isPortuguese) {
            const instructions: Record<string, string> = {
              'Elegant Prose': `REGRAS: 1. Tom: Claro, sofisticado e preciso. Evite floreios. 2. Formato: Prosa continua (paragrafos). 3. Voz: Refinada. 4. Objetivo: Texto bem escrito.`,
              'Ana Suy': `REGRAS - ANA SUY: 1. Tom: Intimo e psicanalitico. Ouca os *silencios* e o que nao foi dito. 2. Voz: Poetica e acessivel. 3. Foco: Experiencia subjetiva. 4. Estrutura: Fluida, paragrafos de prosa.`,
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
                1. Tone: Intimate and psychoanalytic. Pay close attention to what is left unsaid.
                2. Voice: Poetic but accessible. Use simple words to describe complex feelings.
                3. Techniques: Use pauses and breaks in the text to structure it (using ellipses or paragraph breaks). Focus on the *subjective experience*.
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
            Role: You are an expert literary editor and ghostwriter.

            Goal: Transform the transcribed text into polished writing that captures the *spirit* and *intent* of the original.

            CRITICAL TEXT REFINEMENT INSTRUCTIONS (ALL STYLES):
            1. **STRICTLY REMOVE FLUFF:** You MUST remove all verbal tics, hesitations, and filler words.
            2. **CLEAN SYNTAX:** Repair broken sentences and linguistic crutches.
            3. **RECORDING MODE: ${recordingStyle.toUpperCase()}**
            ${recordingStyle === 'Interview' ? '- IDENTIFY SPEAKERS: Differentiate between speakers if the text contains dialogue markers.' : '- MONOLOGUE: Treat this as a single cohesive stream of thought.'}

            TEXT REFINEMENT:
            1. Preserve the original meaning and key ideas.
            2. Improve clarity and flow.
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

        return systemPrompt;
      };

      // --- Funcao auxiliar: refina texto via Gemini (text-only, sem audio) ---
      const refineWithGemini = async (rawText: string, key: string): Promise<string> => {
        const ai = new GoogleGenAI({ apiKey: key });
        const systemPrompt = buildStylePrompt(rawText);

        const isPromptEngineeringMode = [
          'Prompt (Claude)', 'Prompt (Gemini)', 'Code Generator', 'Tech Docs', 'Bullet Points'
        ].includes(outputStyle);
        const isVerbatimMode = outputStyle === 'Verbatim' || outputStyle === 'Whisper Only';

        const response = await ai.models.generateContent({
          model: aiModel,
          config: {
            temperature: isPromptEngineeringMode ? 0.2 : isVerbatimMode ? 0.1 : 0.4,
          },
          contents: {
            parts: [
              { text: `Texto transcrito para refinar:\n\n${rawText}` },
              { text: systemPrompt }
            ]
          }
        });

        return response.text?.trim() || rawText;
      };

      // --- LOCAL STT MODE (Whisper via Sidecar) ---
      if (useLocalSTT && voiceAIClient) {
        addLog('Transcrevendo localmente com Whisper...', 'info');

        // Converte blob para base64
        const base64Audio = await VoiceAIClient.blobToBase64(audioBlob);
        const format = VoiceAIClient.getFormatFromMimeType(audioBlob.type);

        try {
          // Sidecar apenas transcreve - nunca refina
          const result = await voiceAIClient.transcribe({
            audio: base64Audio,
            format,
            language: outputLanguage === 'Portuguese' ? 'pt' : outputLanguage === 'Spanish' ? 'es' : 'en',
            refine: false,
            style: 'verbatim' as SidecarOutputStyle,
          });

          let finalText = result.text;

          // Se estilo != Whisper Only e tem API key, refinar com Gemini (text-only)
          if (outputStyle !== 'Whisper Only' && currentApiKey) {
            addLog('Refinando com Gemini (text-only)...', 'info');
            try {
              finalText = await refineWithGemini(finalText, currentApiKey);
            } catch (geminiError: any) {
              addLog(`Gemini refinamento falhou: ${geminiError.message}. Usando texto bruto.`, 'warning');
              // Mantém o texto bruto do Whisper
            }
          }

          // Adiciona filename se nao presente
          if (finalText.trim() && !finalText.includes('\n\n')) {
            const firstWords = finalText.split(/\s+/).slice(0, 5).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
            if (firstWords) {
              finalText = `${firstWords}\n\n${finalText}`;
            }
          }

          const cleanedText = finalText.trim();
          setTranscription(cleanedText);

          // Atualiza Context Memory
          const currentMemory = contextMemory[activeContext] || "No previous context.";
          const updatedMemory = (currentMemory + "\n" + cleanedText).slice(-5000);
          updateContextMemory(activeContext, updatedMemory);

          saveContextToDB({
            name: activeContext,
            memory: updatedMemory,
            lastUpdated: Date.now()
          }).catch(e => console.error("Auto-save failed", e));

          // Calcula Stats
          const endTime = performance.now();
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

          const mode = (outputStyle !== 'Whisper Only' && currentApiKey) ? 'Whisper + Gemini (text-only)' : 'Whisper';
          addLog(`Transcricao completa via ${mode}`, 'success');
          setIsProcessing(false);
          return;

        } catch (sidecarError: any) {
          addLog(`Sidecar falhou: ${sidecarError.message}`, 'warning');
          addLog("Whisper indisponivel. Conecte o Tailscale ou verifique o sidecar.", 'error');
          setIsProcessing(false);
          return;
        }
      }

      // --- SEM WHISPER: informar o usuario ---
      addLog("Whisper indisponivel (Tailscale desconectado ou sidecar offline).", 'error');
      addLog("Conecte o Tailscale para transcrever audio.", 'info');
      setIsProcessing(false);

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
