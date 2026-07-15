import type { ExtractedTxn } from '../lib/types';
import type { ScannedHolding } from '../lib/prices';
import type { ScannedSnapshot } from '../lib/parseSnapshot';
import type { IdentityExtraction } from './ekycPrompt';
import type { CategoryOption, GuessableItem } from './categoryGuessPrompt';

export type LLMErrorCode =
  | 'no_key'
  | 'auth'
  | 'rate_limit'
  | 'network'
  | 'bad_response'
  | 'unknown';

export class LLMError extends Error {
  code: LLMErrorCode;
  constructor(code: LLMErrorCode, message: string) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
  }
}

/** Friendly, user-facing message for each failure mode. */
export function llmErrorMessage(e: unknown): string {
  if (e instanceof LLMError) {
    switch (e.code) {
      case 'no_key':
        return "This feature isn't available right now.";
      case 'auth':
        return "This feature isn't available right now.";
      case 'rate_limit':
        return 'Rate limit reached. Wait a moment and try again.';
      case 'network':
        return 'Network error. Check your connection and retry.';
      case 'bad_response':
        return "Couldn't read the screenshot. Try a clearer image.";
      default:
        return e.message || 'Something went wrong.';
    }
  }
  return 'Something went wrong.';
}

export interface ExtractInput {
  apiKey: string;
  model: string;
  imageBase64: string;
  mimeType: string;
}

export interface TestInput {
  apiKey: string;
  model: string;
}

export interface CoachInput {
  apiKey: string;
  model: string;
  prompt: string;
  system: string;
}

/** One piece of a document handed to a document-capable model. */
export type DocPart =
  | { kind: 'binary'; base64: string; mimeType: string } // PDF / image  read server-side
  | { kind: 'text'; text: string }; // CSV / XLSX / DOCX flattened to text

export interface DocExtractInput {
  apiKey: string;
  model: string;
  parts: DocPart[];
}

export interface CategoryGuessInput {
  apiKey: string;
  model: string;
  items: GuessableItem[];
  categories: CategoryOption[];
}

export interface LLMProvider {
  id: string;
  label: string;
  defaultModel: string;
  /** Whether this provider can ingest documents (PDF/CSV/XLSX/DOCX) for import. */
  acceptsDocuments?: boolean;
  /** Extract transactions from a base64-encoded screenshot. */
  extract(input: ExtractInput): Promise<ExtractedTxn[]>;
  /** Extract transactions from a document (PDF/image binary, or flattened text). */
  extractDocument?(input: DocExtractInput): Promise<ExtractedTxn[]>;
  /** Extract crypto holdings (ticker + quantity) from a wallet/exchange screenshot. */
  extractHoldings?(input: DocExtractInput): Promise<ScannedHolding[]>;
  /** Extract a single MYR balance from a bank/e-wallet/loan screenshot (null if unreadable). */
  extractBalance?(input: DocExtractInput): Promise<number | null>;
  /** Identify a screenshot as a balance (bank/e-wallet/loan) or a crypto wallet, and extract accordingly. */
  extractSnapshot?(input: DocExtractInput): Promise<ScannedSnapshot>;
  /** Extract holder identity (name + IC/passport number) from a document photo. */
  extractIdentity?(input: DocExtractInput): Promise<IdentityExtraction>;
  /** Guess a category for merchants with no learned-memory match (new-merchant subset only). */
  guessCategories?(input: CategoryGuessInput): Promise<Record<number, string | null>>;
  /** Lightweight credential check for the Settings "Test" button. */
  test(input: TestInput): Promise<void>;
  /** Short, on-demand text advice (budget coach). */
  coach(input: CoachInput): Promise<string>;
}
