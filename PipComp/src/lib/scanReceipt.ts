// src/lib/scanReceipt.ts
// Shared receipt-reading call used by both the camera capture and the gallery pick, mirroring
// ekyc/scan.ts. The photo is never stored: it is read once and the parsed lines are what the
// itemiser works from.
import { getLLM } from '../llm';
import { LLMError } from '../llm/types';
import type { ScannedReceipt } from './parseReceipt';

export async function scanReceiptImage(base64: string, mimeType: string): Promise<ScannedReceipt> {
  const llm = await getLLM();
  if (!llm.can('extractReceipt')) {
    throw new LLMError('no_key', "Reading receipts isn't available right now. You can still split the total by hand.");
  }
  return llm.extractReceipt({ parts: [{ kind: 'binary', base64, mimeType }] });
}
