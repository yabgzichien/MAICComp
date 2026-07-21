// src/llm/fallback.ts
// Primary/secondary LLM routing. Groq is the primary for every task; if a Groq call fails
// (no key, auth, rate limit, network, an unreadable reply, or a capability it can't serve —
// e.g. a PDF its vision model can't ingest), the same call is retried on Gemini. This is the
// single entry point every screen uses, so provider selection + fallback live in one place
// instead of being re-decided per call site.
import { GeminiProvider } from './gemini';
import { GroqProvider } from './groq';
import { LLMError, type LLMProvider } from './types';
import type {
  CategoryGuessInput,
  CoachInput,
  DocExtractInput,
  ExtractInput,
} from './types';
import { loadSettings, type LLMSettings } from '../settings/settingsStore';

/** The methods a screen can request. */
export type Capability =
  | 'extract'
  | 'extractDocument'
  | 'extractHoldings'
  | 'extractBalance'
  | 'extractSnapshot'
  | 'extractIdentity'
  | 'guessCategories'
  | 'coach';

interface Leg {
  provider: LLMProvider;
  apiKey: string;
  model: string;
}

/** Method inputs, minus the per-provider credentials the wrapper fills in itself. */
type Payload<T> = Omit<T, 'apiKey' | 'model'>;

export class FallbackProvider {
  private readonly legs: Leg[];

  constructor(settings: LLMSettings) {
    // Order is the fallback order: Groq first, Gemini second.
    this.legs = [
      { provider: GroqProvider, apiKey: settings.groqKey, model: settings.groqModel },
      { provider: GeminiProvider, apiKey: settings.geminiKey, model: settings.geminiModel },
    ];
  }

  /** Legs that have a key AND implement the capability, in fallback order. */
  private legsFor(cap: Capability): Leg[] {
    return this.legs.filter((l) => !!l.apiKey && typeof (l.provider as any)[cap] === 'function');
  }

  /** Whether any provider can serve this capability (drives "feature unavailable" UI). */
  can(cap: Capability): boolean {
    return this.legsFor(cap).length > 0;
  }

  private async run<R>(cap: Capability, payload: object): Promise<R> {
    const legs = this.legsFor(cap);
    if (legs.length === 0) {
      throw new LLMError('no_key', "This feature isn't available right now.");
    }
    let lastError: unknown = new LLMError('unknown', 'No provider attempted.');
    for (const leg of legs) {
      try {
        return await (leg.provider as any)[cap]({ apiKey: leg.apiKey, model: leg.model, ...payload });
      } catch (e) {
        // Any failure from the primary falls through to the secondary. The models differ, so
        // even a bad_response (unreadable reply) is worth retrying on the other provider.
        lastError = e;
      }
    }
    throw lastError;
  }

  extract(input: Payload<ExtractInput>) {
    return this.run<Awaited<ReturnType<NonNullable<LLMProvider['extract']>>>>('extract', input);
  }
  extractDocument(input: Payload<DocExtractInput>) {
    return this.run<Awaited<ReturnType<NonNullable<LLMProvider['extractDocument']>>>>('extractDocument', input);
  }
  extractHoldings(input: Payload<DocExtractInput>) {
    return this.run<Awaited<ReturnType<NonNullable<LLMProvider['extractHoldings']>>>>('extractHoldings', input);
  }
  extractBalance(input: Payload<DocExtractInput>) {
    return this.run<Awaited<ReturnType<NonNullable<LLMProvider['extractBalance']>>>>('extractBalance', input);
  }
  extractSnapshot(input: Payload<DocExtractInput>) {
    return this.run<Awaited<ReturnType<NonNullable<LLMProvider['extractSnapshot']>>>>('extractSnapshot', input);
  }
  extractIdentity(input: Payload<DocExtractInput>) {
    return this.run<Awaited<ReturnType<NonNullable<LLMProvider['extractIdentity']>>>>('extractIdentity', input);
  }
  guessCategories(input: Payload<CategoryGuessInput>) {
    return this.run<Awaited<ReturnType<NonNullable<LLMProvider['guessCategories']>>>>('guessCategories', input);
  }
  coach(input: Payload<CoachInput>) {
    return this.run<string>('coach', input);
  }
}

/** Build the fallback provider from the current (env-configured) settings. */
export async function getLLM(): Promise<FallbackProvider> {
  return new FallbackProvider(await loadSettings());
}
