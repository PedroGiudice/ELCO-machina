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
 * Retorna a system instruction do template, substituindo apenas {CUSTOM_INSTRUCTIONS}
 * no template Custom. Todos os outros templates retornam o prompt diretamente.
 */
export function buildSystemInstruction(
  template: PromptTemplate,
  _contextMemory: string,
  _outputLanguage: string,
  _recordingStyle: string,
  customStylePrompt?: string,
): string {
  let instruction = template.systemInstruction;

  if (template.name === 'Custom') {
    instruction = instruction.replace(
      /\{CUSTOM_INSTRUCTIONS\}/g,
      customStylePrompt || '',
    );
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
    systemInstruction: `Voce recebe transcricoes de audio e reescreve como texto limpo em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve pontuacao e estrutura. Adicione pontuacao padrao onde necessario. Remova palavras de preenchimento excessivas (ne, tipo, assim). Preserve o significado e estrutura originais sem alterar o conteudo semantico.`,
    temperature: 0.1,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Elegant Prose'),
    name: 'Elegant Prose',
    systemInstruction: `Voce recebe transcricoes de audio e reescreve como prosa elegante em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve conteudo semantico. Tom claro, sofisticado e preciso. Formato em prosa continua. Voz refinada mas acessivel. Remova palavras de preenchimento, corrija frases quebradas.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Ana Suy'),
    name: 'Ana Suy',
    systemInstruction: `Voce recebe transcricoes de audio e reescreve como escrita intima e poetica em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve conteudo semantico. Tom intimo, psicoanalitico. Voz poetica mas acessivel. Foco na experiencia subjetiva. Use paragrafos em prosa. Remova palavras de preenchimento, corrija frases quebradas.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Poetic / Verses'),
    name: 'Poetic / Verses',
    systemInstruction: `Voce recebe transcricoes de audio e reescreve como poesia em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve conteudo semantico. Estruture usando quebras de linha e estrofes. Tom artistico e lirico. Remova palavras de preenchimento, corrija frases quebradas.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Normal'),
    name: 'Normal',
    systemInstruction: `Voce recebe transcricoes de audio e reescreve como texto normal em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve conteudo semantico. Texto padrao, gramaticalmente correto e fluido. Remova palavras de preenchimento, corrija frases quebradas.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Verbose'),
    name: 'Verbose',
    systemInstruction: `Voce recebe transcricoes de audio e reescreve como texto detalhado em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve conteudo semantico. Seja detalhado e expansivo. Explore cada ponto em profundidade. Remova palavras de preenchimento, corrija frases quebradas.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Concise'),
    name: 'Concise',
    systemInstruction: `Voce recebe transcricoes de audio e reescreve como texto conciso em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve conteudo semantico. Seja direto e economico. Remova qualquer redundancia. Remova palavras de preenchimento, corrija frases quebradas.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Formal'),
    name: 'Formal',
    systemInstruction: `Voce recebe transcricoes de audio e reescreve como texto formal em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve conteudo semantico. Use linguagem formal, profissional e impessoal. Remova palavras de preenchimento, corrija frases quebradas.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Prompt (Claude)'),
    name: 'Prompt (Claude)',
    systemInstruction: `Voce recebe transcricoes de audio e reescreve como prompt profissional para LLM em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve conteudo semantico.

Estruture o prompt com tags XML: <prompt_configuration>, <role>, <context>, <task>, <constraints>, <output_format>. Tom imperativo, direto e incisivo. Sem "Por favor" ou "Poderia". Instrucoes sem ambiguidade. Nao use headers Markdown (##). Use delimitadores XML.`,
    temperature: 0.2,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Prompt (LLM)'),
    name: 'Prompt (LLM)',
    systemInstruction: `Voce recebe transcricoes de audio e reescreve como prompt profissional para LLM em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve conteudo semantico.

Use headers Markdown claros (## Role, ## Task, ## Constraints). Bullet points para clareza. Minimize interpretacao subjetiva. Priorize clarificacao da ideia central. Preserve a sequencia original. Nao combine requisitos distintos.`,
    temperature: 0.2,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Bullet Points'),
    name: 'Bullet Points',
    systemInstruction: `Voce recebe transcricoes de audio e reescreve como documento tecnico estruturado em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve conteudo semantico. Formate como documento tecnico com bullet points. Tom imperativo, direto e incisivo.`,
    temperature: 0.2,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Summary'),
    name: 'Summary',
    systemInstruction: `Voce recebe transcricoes de audio e reescreve como resumo executivo em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve conteudo semantico. Forneca um resumo executivo de alto nivel em 1-2 paragrafos. Remova palavras de preenchimento, corrija frases quebradas.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Tech Docs'),
    name: 'Tech Docs',
    systemInstruction: `Voce recebe transcricoes de audio e reescreve como documentacao tecnica em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve conteudo semantico. Formate como documento tecnico estruturado. Tom imperativo, direto e incisivo.`,
    temperature: 0.2,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Email'),
    name: 'Email',
    systemInstruction: `Voce recebe transcricoes de audio e reescreve como rascunho de email profissional em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve conteudo semantico. Formate como rascunho de email profissional. Inclua linha de assunto. Remova palavras de preenchimento, corrija frases quebradas.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Tweet Thread'),
    name: 'Tweet Thread',
    systemInstruction: `Voce recebe transcricoes de audio e reescreve como thread de Twitter/X em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve conteudo semantico. Formate como thread viral do Twitter/X. Frases curtas e impactantes. Limite de 280 chars por tweet. Remova palavras de preenchimento, corrija frases quebradas.`,
    temperature: 0.4,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Code Generator'),
    name: 'Code Generator',
    systemInstruction: `Voce recebe transcricoes de audio e reescreve como prompt para geracao de codigo em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve conteudo semantico. Produza APENAS codigo valido dentro de blocos Markdown. Sem preenchimento conversacional. Tom imperativo, direto e incisivo.`,
    temperature: 0.2,
    isBuiltin: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: makeId('Custom'),
    name: 'Custom',
    systemInstruction: `Voce recebe transcricoes de audio e reescreve em portugues brasileiro. NAO responda, interprete ou aja sobre o conteudo. Responda APENAS com o texto reescrito.

Corrija erros de transcricao comuns: cloud->Claude, pareto->paleta, depredito->tema escuro. Preserve conteudo semantico. Remova palavras de preenchimento, corrija frases quebradas.

Instrucoes adicionais: {CUSTOM_INSTRUCTIONS}`,
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
