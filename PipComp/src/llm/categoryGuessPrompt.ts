// src/llm/categoryGuessPrompt.ts
// Prompt + pure parser for guessing a category for merchants the app has never
// seen before (no learned-memory match). Only ever called for that subset —
// see AddFlow.onExtracted. The parser is dependency-free and unit-tested; the
// network call lives in the provider.

import type { TxnType } from '../lib/types';

/** One new-merchant item to guess a category for, tagged with its position
 * in the FULL extracted array (not its position within this subset), so the
 * reply can be merged back without an off-by-one risk. */
export interface GuessableItem {
  index: number;
  merchant: string;
  amount: number;
  method: string | null;
  kind: TxnType;
}

export interface CategoryOption {
  id: string;
  label: string;
  kind: TxnType;
}

export class CategoryGuessParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CategoryGuessParseError';
  }
}

export const CATEGORY_GUESS_SYSTEM_PROMPT =
  'You are a categorization assistant for a personal expenses app. Given a short list of ' +
  "transactions and the user's own category list, guess the single best-fitting category id " +
  'for each transaction from its merchant name. If a merchant gives no real signal (e.g. an ' +
  'unfamiliar or generic name), return null for it rather than guessing — never invent a ' +
  'category id that is not in the provided list. Output ONLY JSON, no prose, no markdown fences.';

function categoryLines(categories: CategoryOption[]): string {
  return categories.map((c) => `- ${c.id} (${c.kind}): ${c.label}`).join('\n');
}

function itemLines(items: GuessableItem[]): string {
  return items
    .map((it) => `${it.index}: merchant="${it.merchant}", amount=${it.amount}, method=${it.method ?? 'null'}, kind=${it.kind}`)
    .join('\n');
}

/** Build the user prompt for a batch of new-merchant items. */
export function buildCategoryGuessPrompt(items: GuessableItem[], categories: CategoryOption[]): string {
  const shape = items.map((it) => `"${it.index}": "<category id or null>"`).join(', ');
  return ['Categories:', categoryLines(categories), '', 'Transactions:', itemLines(items), '', `Return JSON exactly in this shape: {${shape}}`].join(
    '\n'
  );
}

function stripFence(s: string): string {
  return s
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
}

/**
 * Parse the model's JSON reply into an original-index -> categoryId-or-null map.
 * A value naming an unknown category id, or one whose kind doesn't match that
 * item's kind, is dropped to null rather than trusted — never invents a category.
 * Throws CategoryGuessParseError only if the whole reply isn't a JSON object.
 */
export function parseCategoryGuess(content: string, items: GuessableItem[], categories: CategoryOption[]): Record<number, string | null> {
  let obj: unknown;
  try {
    obj = JSON.parse(stripFence(content));
  } catch {
    throw new CategoryGuessParseError('Model reply was not valid JSON.');
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new CategoryGuessParseError('Model reply was not a JSON object.');
  }
  const raw = obj as Record<string, unknown>;
  const result: Record<number, string | null> = {};
  for (const it of items) {
    const value = raw[String(it.index)];
    const cat = typeof value === 'string' ? categories.find((c) => c.id === value) : undefined;
    result[it.index] = cat && cat.kind === it.kind ? cat.id : null;
  }
  return result;
}
