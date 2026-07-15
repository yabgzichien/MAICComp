// src/ekyc/scan.ts
// Shared identity-extraction call used by both the camera scanner and the gallery upload.
// Resolves the configured vision provider and OCRs the document photo. The image is not stored.
import { getProvider } from '../llm';
import { LLMError } from '../llm/types';
import type { IdentityExtraction } from '../llm/ekycPrompt';
import { configFor, loadSettings } from '../settings/settingsStore';

export async function scanIdentityImage(base64: string, mimeType: string): Promise<IdentityExtraction> {
  const cfg = configFor(await loadSettings(), 'general');
  const provider = getProvider(cfg.provider);
  if (!cfg.apiKey || !provider.extractIdentity) {
    throw new LLMError('no_key', "Scanning isn't available right now. You can also enter your details manually.");
  }
  return provider.extractIdentity({
    apiKey: cfg.apiKey,
    model: cfg.model,
    parts: [{ kind: 'binary', base64, mimeType }],
  });
}
