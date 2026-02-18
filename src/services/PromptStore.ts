/**
 * PromptStore - Gerencia templates de prompts para refinamento de texto
 *
 * Estilos sao DADOS (templates), nao codigo (buildStylePrompt).
 * O backend recebe system_instruction como string via POST /transcribe.
 *
 * Persistencia: Tauri Store (desktop) com fallback IndexedDB.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PromptTemplate {
  id: string;
  name: string;
  systemInstruction: string;
  temperature: number;
  isBuiltin: boolean;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// BUILTIN TEMPLATES
// ============================================================================

/**
 * Gera system instruction completa com context memory e language injetados.
 * O PromptStore armazena o "corpo" do prompt; esta funcao monta o prompt final.
 */
export function buildSystemInstruction(
  template: PromptTemplate,
  contextMemory: string,
  outputLanguage: string,
  recordingStyle: string,
  customStylePrompt?: string,
): string {
  // Helper para escapar strings para inclusao segura em JSON
  const escapeForJson = (s: string): string => {
    return JSON.stringify(s).slice(1, -1);
  };

  let instruction = template.systemInstruction;

  // Substituir placeholders com conteudo escapado
  instruction = instruction
    .replace(/\{CONTEXT_MEMORY\}/g, escapeForJson(contextMemory.slice(-2000)))
    .replace(/\{OUTPUT_LANGUAGE\}/g, outputLanguage)
    .replace(/\{RECORDING_STYLE\}/g, recordingStyle.toUpperCase())
    .replace(
      /\{CUSTOM_INSTRUCTIONS\}/g,
      escapeForJson(customStylePrompt || ''),
    );

  // Filename obrigatorio para todos (exceto Whisper Only)
  if (template.name !== 'Whisper Only') {
    instruction += `

MANDATORY OUTPUT STRUCTURE:
Line 1: Suggested filename (concise, valid chars, no extension).
Line 2: [Empty]
Line 3+: The actual content.`;
  }

  return instruction;
}

// ============================================================================
// BUILTIN DEFINITIONS
// ============================================================================

const makeId = (name: string): string =>
  `builtin-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

const now = Date.now();

const BUILTIN_TEMPLATES: PromptTemplate[] = [
  {
    id: makeId('Whisper Only'),
    name: 'Whisper Only',
    systemInstruction: '',
    temperature: 0,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Verbatim'),
    name: 'Verbatim',
    systemInstruction: `ROLE: You are a professional text cleanup engine.
TASK: Clean up the transcribed text with minimal changes.
RULES: 1. Preserve original meaning and structure. 2. Add standard punctuation. 3. Remove excessive filler words. 4. No meta-commentary.
TARGET LANGUAGE: {OUTPUT_LANGUAGE}
CONTEXT MEMORY: "{CONTEXT_MEMORY}"`,
    temperature: 0.1,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Elegant Prose'),
    name: 'Elegant Prose',
    systemInstruction: `Role: Expert literary editor and ghostwriter.
Goal: Transform transcribed text into polished writing capturing the spirit and intent of the original.
RULES: Remove filler words, repair broken sentences.
RECORDING MODE: {RECORDING_STYLE}
Context Memory: "{CONTEXT_MEMORY}"
Target Language: {OUTPUT_LANGUAGE}
Style: Tone: Clear, sophisticated, precise. Format: Continuous prose. Voice: Refined but accessible.
Output: Return ONLY the refined text. No preambles.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Ana Suy'),
    name: 'Ana Suy',
    systemInstruction: `Role: Expert literary editor and ghostwriter.
Goal: Transform transcribed text into polished writing capturing the spirit and intent of the original.
RULES: Remove filler words, repair broken sentences.
RECORDING MODE: {RECORDING_STYLE}
Context Memory: "{CONTEXT_MEMORY}"
Target Language: {OUTPUT_LANGUAGE}
Style: Tone: Intimate, psychoanalytic. Voice: Poetic but accessible. Focus on subjective experience. Use prose paragraphs.
Output: Return ONLY the refined text. No preambles.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Poetic / Verses'),
    name: 'Poetic / Verses',
    systemInstruction: `Role: Expert literary editor and ghostwriter.
Goal: Transform transcribed text into polished writing capturing the spirit and intent of the original.
RULES: Remove filler words, repair broken sentences.
RECORDING MODE: {RECORDING_STYLE}
Context Memory: "{CONTEXT_MEMORY}"
Target Language: {OUTPUT_LANGUAGE}
Style: Structure using line breaks and stanzas. Tone: Artistic, lyrical.
Output: Return ONLY the refined text. No preambles.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Normal'),
    name: 'Normal',
    systemInstruction: `Role: Expert literary editor and ghostwriter.
Goal: Transform transcribed text into polished writing capturing the spirit and intent of the original.
RULES: Remove filler words, repair broken sentences.
RECORDING MODE: {RECORDING_STYLE}
Context Memory: "{CONTEXT_MEMORY}"
Target Language: {OUTPUT_LANGUAGE}
Style: Standard, grammatically correct and fluid text.
Output: Return ONLY the refined text. No preambles.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Verbose'),
    name: 'Verbose',
    systemInstruction: `Role: Expert literary editor and ghostwriter.
Goal: Transform transcribed text into polished writing capturing the spirit and intent of the original.
RULES: Remove filler words, repair broken sentences.
RECORDING MODE: {RECORDING_STYLE}
Context Memory: "{CONTEXT_MEMORY}"
Target Language: {OUTPUT_LANGUAGE}
Style: Be detailed and expansive. Explore each point in depth.
Output: Return ONLY the refined text. No preambles.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Concise'),
    name: 'Concise',
    systemInstruction: `Role: Expert literary editor and ghostwriter.
Goal: Transform transcribed text into polished writing capturing the spirit and intent of the original.
RULES: Remove filler words, repair broken sentences.
RECORDING MODE: {RECORDING_STYLE}
Context Memory: "{CONTEXT_MEMORY}"
Target Language: {OUTPUT_LANGUAGE}
Style: Be direct and economical. Remove any redundancy.
Output: Return ONLY the refined text. No preambles.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Formal'),
    name: 'Formal',
    systemInstruction: `Role: Expert literary editor and ghostwriter.
Goal: Transform transcribed text into polished writing capturing the spirit and intent of the original.
RULES: Remove filler words, repair broken sentences.
RECORDING MODE: {RECORDING_STYLE}
Context Memory: "{CONTEXT_MEMORY}"
Target Language: {OUTPUT_LANGUAGE}
Style: Use formal, professional and impersonal language.
Output: Return ONLY the refined text. No preambles.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Prompt (Claude)'),
    name: 'Prompt (Claude)',
    systemInstruction: `ROLE: You are a Senior Prompt Engineer and Technical Architect.
TASK: Reverse-engineer the user's transcribed text into a professional, high-fidelity LLM Prompt or Technical Document.
TONE & STYLE: Imperative, Direct, Incisive. No "Please" or "Would you kindly". Unambiguous instructions.
CONTEXT MEMORY: "{CONTEXT_MEMORY}"
TARGET LANGUAGE: {OUTPUT_LANGUAGE}
CRITICAL OUTPUT FORMATTING:
- You MUST wrap the final prompt in XML tags: <prompt_configuration> ... </prompt_configuration>
- Use tags like <role>, <context>, <task>, <constraints>, <output_format> to structure the prompt.
- Do NOT use Markdown headers (##). Use XML delimiters.
EXECUTION: Transform the transcribed text into the requested format immediately.`,
    temperature: 0.2,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Prompt (Gemini)'),
    name: 'Prompt (Gemini)',
    systemInstruction: `ROLE: You are a Senior Prompt Engineer and Technical Architect.
TASK: Reverse-engineer the user's transcribed text into a professional, high-fidelity LLM Prompt or Technical Document.
TONE & STYLE: Imperative, Direct, Incisive. No "Please" or "Would you kindly". Unambiguous instructions.
CONTEXT MEMORY: "{CONTEXT_MEMORY}"
TARGET LANGUAGE: {OUTPUT_LANGUAGE}
## Prompt Engineering Directives:
* **Minimize Interpretation:** Reduce subjective interpretation of the input.
* **Idea Refinement:** Prioritize clarification of the core idea.
* **Output Format Conjecturing:** Actively anticipate the optimal format.
* **Order Preservation:** Maintain original sequence.
* **No Merging:** Do not combine distinct requests.
* **Independent Delineation:** Distinct requests must be separated.
FORMAT: Use clear Markdown headers (## Role, ## Task, ## Constraints). Bullet points for clarity.
EXECUTION: Transform the transcribed text into the requested format immediately.`,
    temperature: 0.2,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Bullet Points'),
    name: 'Bullet Points',
    systemInstruction: `ROLE: You are a Senior Prompt Engineer and Technical Architect.
TASK: Reverse-engineer the user's transcribed text into a professional, high-fidelity Technical Document.
TONE & STYLE: Imperative, Direct, Incisive.
CONTEXT MEMORY: "{CONTEXT_MEMORY}"
TARGET LANGUAGE: {OUTPUT_LANGUAGE}
Format as a structured technical document with bullet points.
EXECUTION: Transform the transcribed text into the requested format immediately.`,
    temperature: 0.2,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Summary'),
    name: 'Summary',
    systemInstruction: `Role: Expert literary editor and ghostwriter.
Goal: Transform transcribed text into polished writing capturing the spirit and intent of the original.
RULES: Remove filler words, repair broken sentences.
RECORDING MODE: {RECORDING_STYLE}
Context Memory: "{CONTEXT_MEMORY}"
Target Language: {OUTPUT_LANGUAGE}
Style: Provide a high-level executive summary in 1-2 paragraphs.
Output: Return ONLY the refined text. No preambles.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Tech Docs'),
    name: 'Tech Docs',
    systemInstruction: `ROLE: You are a Senior Prompt Engineer and Technical Architect.
TASK: Reverse-engineer the user's transcribed text into a professional Technical Document.
TONE & STYLE: Imperative, Direct, Incisive.
CONTEXT MEMORY: "{CONTEXT_MEMORY}"
TARGET LANGUAGE: {OUTPUT_LANGUAGE}
Format as a structured technical document.
EXECUTION: Transform the transcribed text into the requested format immediately.`,
    temperature: 0.2,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Email'),
    name: 'Email',
    systemInstruction: `Role: Expert literary editor and ghostwriter.
Goal: Transform transcribed text into polished writing capturing the spirit and intent of the original.
RULES: Remove filler words, repair broken sentences.
RECORDING MODE: {RECORDING_STYLE}
Context Memory: "{CONTEXT_MEMORY}"
Target Language: {OUTPUT_LANGUAGE}
Style: Format as a professional email draft. Include subject line.
Output: Return ONLY the refined text. No preambles.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Tweet Thread'),
    name: 'Tweet Thread',
    systemInstruction: `Role: Expert literary editor and ghostwriter.
Goal: Transform transcribed text into polished writing capturing the spirit and intent of the original.
RULES: Remove filler words, repair broken sentences.
RECORDING MODE: {RECORDING_STYLE}
Context Memory: "{CONTEXT_MEMORY}"
Target Language: {OUTPUT_LANGUAGE}
Style: Format as a viral Twitter/X thread. Short, punchy sentences. 280 chars per tweet limit simulation.
Output: Return ONLY the refined text. No preambles.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Code Generator'),
    name: 'Code Generator',
    systemInstruction: `ROLE: You are a Senior Prompt Engineer and Technical Architect.
TASK: Reverse-engineer the user's transcribed text into a professional LLM Prompt for code generation.
TONE & STYLE: Imperative, Direct, Incisive.
CONTEXT MEMORY: "{CONTEXT_MEMORY}"
TARGET LANGUAGE: {OUTPUT_LANGUAGE}
OUTPUT ONLY VALID CODE inside Markdown code blocks. No conversational filler.
EXECUTION: Transform the transcribed text into the requested format immediately.`,
    temperature: 0.2,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Custom'),
    name: 'Custom',
    systemInstruction: `Role: Expert literary editor and ghostwriter.
Goal: Transform transcribed text into polished writing capturing the spirit and intent of the original.
RULES: Remove filler words, repair broken sentences.
RECORDING MODE: {RECORDING_STYLE}
Context Memory: "{CONTEXT_MEMORY}"
Target Language: {OUTPUT_LANGUAGE}
Style: {CUSTOM_INSTRUCTIONS}
Output: Return ONLY the refined text. No preambles.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
];

// Deep copy factory para evitar mutacao dos defaults
function getBuiltinDefaults(): PromptTemplate[] {
  return BUILTIN_TEMPLATES.map((t) => ({ ...t }));
}

// ============================================================================
// PERSISTENCE
// ============================================================================

const STORE_KEY = 'prompt_templates';

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI__' in window;

let storeInstance: { get: (k: string) => Promise<unknown>; set: (k: string, v: unknown) => Promise<void> } | null = null;
let storeInitPromise: Promise<typeof storeInstance> | null = null;

async function getStore(): Promise<typeof storeInstance> {
  if (!isTauri()) return null;
  if (storeInstance) return storeInstance;
  if (storeInitPromise) return storeInitPromise;

  storeInitPromise = (async () => {
    try {
      const { load } = await import('@tauri-apps/plugin-store');
      storeInstance = await load('prompts.json', { defaults: {}, autoSave: 100 });
      return storeInstance;
    } catch (e) {
      console.error('PromptStore: Failed to init Tauri Store:', e);
      return null;
    } finally {
      storeInitPromise = null;
    }
  })();

  return storeInitPromise;
}

async function loadTemplates(): Promise<PromptTemplate[]> {
  const store = await getStore();
  if (store) {
    try {
      const saved = (await store.get(STORE_KEY)) as PromptTemplate[] | undefined;
      if (saved && Array.isArray(saved) && saved.length > 0) return saved;
    } catch (e) {
      console.error('PromptStore: Failed to load from Tauri Store:', e);
    }
  }

  // Fallback localStorage
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PromptTemplate[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('PromptStore: Failed to load from localStorage:', e);
  }

  return [];
}

async function saveTemplates(templates: PromptTemplate[]): Promise<void> {
  const store = await getStore();
  if (store) {
    try {
      await store.set(STORE_KEY, templates);
      return;
    } catch (e) {
      console.error('PromptStore: Failed to save to Tauri Store:', e);
    }
  }

  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(templates));
  } catch (e) {
    console.error('PromptStore: Failed to save to localStorage:', e);
  }
}

// ============================================================================
// PROMPT STORE CLASS
// ============================================================================

export class PromptStore {
  private templates: PromptTemplate[] = [];
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    const saved = await loadTemplates();

    if (saved.length > 0) {
      // Merge: garantir que novos builtins sejam adicionados
      const builtinDefaults = getBuiltinDefaults();
      const savedIds = new Set(saved.map((t) => t.id));

      for (const builtin of builtinDefaults) {
        if (!savedIds.has(builtin.id)) {
          saved.push(builtin);
        }
      }
      this.templates = saved;
    } else {
      this.templates = getBuiltinDefaults();
    }

    this.initialized = true;
    await saveTemplates(this.templates);
  }

  getAll(): PromptTemplate[] {
    return [...this.templates];
  }

  getById(id: string): PromptTemplate | undefined {
    return this.templates.find((t) => t.id === id);
  }

  getByName(name: string): PromptTemplate | undefined {
    return this.templates.find((t) => t.name === name);
  }

  async save(template: PromptTemplate): Promise<void> {
    const idx = this.templates.findIndex((t) => t.id === template.id);
    const updated = { ...template, updatedAt: Date.now() };

    if (idx >= 0) {
      this.templates[idx] = updated;
    } else {
      this.templates.push(updated);
    }

    await saveTemplates(this.templates);
  }

  async delete(id: string): Promise<boolean> {
    const template = this.getById(id);
    if (!template || template.isBuiltin) return false;

    this.templates = this.templates.filter((t) => t.id !== id);
    await saveTemplates(this.templates);
    return true;
  }

  async resetBuiltins(): Promise<void> {
    const builtinDefaults = getBuiltinDefaults();
    const builtinIds = new Set(builtinDefaults.map((t) => t.id));

    // Manter custom, substituir builtins
    this.templates = [
      ...builtinDefaults,
      ...this.templates.filter((t) => !builtinIds.has(t.id)),
    ];

    await saveTemplates(this.templates);
  }

  duplicate(id: string): PromptTemplate | undefined {
    const original = this.getById(id);
    if (!original) return undefined;

    const copy: PromptTemplate = {
      ...original,
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: `${original.name} (copy)`,
      isBuiltin: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return copy;
  }

  exportAll(): string {
    return JSON.stringify(this.templates, null, 2);
  }

  async importAll(json: string): Promise<number> {
    const imported = JSON.parse(json) as PromptTemplate[];
    if (!Array.isArray(imported)) throw new Error('Invalid format');

    let count = 0;
    for (const template of imported) {
      if (template.id && template.name && template.systemInstruction !== undefined) {
        template.isBuiltin = false;
        template.id = `imported-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        this.templates.push(template);
        count++;
      }
    }

    await saveTemplates(this.templates);
    return count;
  }
}

// Singleton
let instance: PromptStore | null = null;

export function getPromptStore(): PromptStore {
  if (!instance) {
    instance = new PromptStore();
  }
  return instance;
}
