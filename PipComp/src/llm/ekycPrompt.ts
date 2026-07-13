// src/llm/ekycPrompt.ts
// Prompt + pure parser for extracting identity fields from an IC/passport photo via a vision
// model. The parser is dependency-free and unit-tested; the network call lives in the provider.

export type IdentityDocType = 'ic' | 'passport' | 'unknown';

export interface IdentityExtraction {
  docType: IdentityDocType;
  fullName: string | null;
  idNumber: string | null;
}

export class IdentityParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityParseError';
  }
}

export const IDENTITY_SYSTEM_PROMPT =
  'You read a photo of a Malaysian identity document (MyKad IC or passport) and return ONLY ' +
  'JSON. Never invent data  if a field is unreadable, use null.';

export const IDENTITY_USER_PROMPT =
  'Extract the holder identity from this document photo. Return strict JSON with exactly these ' +
  'keys: {"document_type": "ic" | "passport" | "unknown", "full_name": string | null, ' +
  '"id_number": string | null}. For a MyKad, id_number is the 12-digit IC (keep the dashes ' +
  'YYMMDD-PB-####). For a passport, id_number is the passport number. Output JSON only.';

function stripFence(s: string): string {
  return s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
}

function nonEmpty(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function normaliseType(v: unknown): IdentityDocType {
  const t = typeof v === 'string' ? v.toLowerCase() : '';
  if (t === 'ic' || t === 'mykad' || t === 'nric') return 'ic';
  if (t === 'passport') return 'passport';
  return 'unknown';
}

/** Parse the model's JSON reply into a normalised identity record. Throws on non-JSON. */
export function parseIdentityExtraction(content: string): IdentityExtraction {
  let obj: any;
  try {
    obj = JSON.parse(stripFence(content));
  } catch {
    throw new IdentityParseError('Model reply was not valid JSON.');
  }
  if (obj === null || typeof obj !== 'object') {
    throw new IdentityParseError('Model reply was not a JSON object.');
  }
  return {
    docType: normaliseType(obj.document_type),
    fullName: nonEmpty(obj.full_name),
    idNumber: nonEmpty(obj.id_number),
  };
}
