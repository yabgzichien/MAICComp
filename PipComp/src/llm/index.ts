import { GeminiProvider } from './gemini';
import { GroqProvider } from './groq';
import type { LLMProvider } from './types';

/**
 * Provider registry. Groq ships as the default (image-only vision); Gemini is
 * document-capable (PDF/CSV/XLSX/DOCX) and powers the file importer.
 */
const PROVIDERS: Record<string, LLMProvider> = {
  groq: GroqProvider,
  gemini: GeminiProvider,
};

export function getProvider(id: string): LLMProvider {
  return PROVIDERS[id] ?? GroqProvider;
}

export const PROVIDER_OPTIONS = Object.values(PROVIDERS).map((p) => ({
  id: p.id,
  label: p.label,
  defaultModel: p.defaultModel,
}));

export { FallbackProvider, getLLM, type Capability } from './fallback';
export * from './types';
