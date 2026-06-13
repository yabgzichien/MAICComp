import { GeminiProvider } from '../llm/gemini';
import { GroqProvider } from '../llm/groq';

// Providers are fixed by configuration, not editable in-app. Groq handles
// general tasks (screenshot scanning, budget tips); Gemini handles document
// import. Keys come from .env.local (EXPO_PUBLIC_* is inlined at build time);
// models are pinned to the defaults below.
export const GROQ_DEFAULT_MODEL = GroqProvider.defaultModel;
export const GEMINI_DEFAULT_MODEL = GeminiProvider.defaultModel;

const ENV_GROQ_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY ?? '';
const ENV_GROQ_MODEL = process.env.EXPO_PUBLIC_GROQ_MODEL ?? '';
const ENV_GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
const ENV_GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL ?? '';

export type ProviderRole = 'general' | 'docs';

export interface LLMSettings {
  groqKey: string;
  groqModel: string;
  geminiKey: string;
  geminiModel: string;
}

export interface ProviderConfig {
  provider: string;
  apiKey: string;
  model: string;
}

/** Which provider/key/model a task should use: general → Groq, documents → Gemini. */
export function configFor(s: LLMSettings, role: ProviderRole): ProviderConfig {
  return role === 'docs'
    ? { provider: 'gemini', apiKey: s.geminiKey, model: s.geminiModel }
    : { provider: 'groq', apiKey: s.groqKey, model: s.groqModel };
}

/** The fixed provider settings (keys from env, models pinned). */
export async function loadSettings(): Promise<LLMSettings> {
  return {
    groqKey: ENV_GROQ_KEY,
    groqModel: ENV_GROQ_MODEL || GROQ_DEFAULT_MODEL,
    geminiKey: ENV_GEMINI_KEY,
    geminiModel: ENV_GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
  };
}
