// src/ekyc/scan.ts
// Shared identity-extraction call used by both the camera scanner and the gallery upload.
// Resolves the configured vision provider and OCRs the document photo. The image is not stored.
import { getLLM } from '../llm';
import { LLMError } from '../llm/types';
import type { IdentityExtraction } from '../llm/ekycPrompt';

export async function scanIdentityImage(base64: string, mimeType: string): Promise<IdentityExtraction> {
  const llm = await getLLM();
  if (!llm.can('extractIdentity')) {
    throw new LLMError('no_key', "Scanning isn't available right now. You can also enter your details manually.");
  }
  return llm.extractIdentity({ parts: [{ kind: 'binary', base64, mimeType }] });
}
