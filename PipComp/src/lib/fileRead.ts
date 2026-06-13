// src/lib/fileRead.ts
// Turns a picked file into the document parts a document-capable model accepts.
// I/O + library glue (expo-file-system, xlsx, fflate); the pure routing/text
// logic it leans on lives in ./import and is unit-tested there.
import { File } from 'expo-file-system';
import { unzipSync, strFromU8 } from 'fflate';
import * as XLSX from 'xlsx';
import type { DocPart } from '../llm/types';
import { docKindFromMime, docxXmlToText, type DocKind } from './import';

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string | null;
}

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
};

function binaryMime(file: PickedFile): string {
  const m = (file.mimeType || '').toLowerCase();
  if (m === 'application/pdf' || m.startsWith('image/')) return m;
  const e = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  return EXT_MIME[e] ?? 'application/octet-stream';
}

/** Classify, then read a picked file into the parts to hand the model. */
export async function readDocumentParts(file: PickedFile): Promise<{ kind: DocKind; parts: DocPart[] }> {
  const kind = docKindFromMime(file.mimeType ?? '', file.name);
  const f = new File(file.uri);

  switch (kind) {
    case 'binary': {
      const base64 = await f.base64();
      return { kind, parts: [{ kind: 'binary', base64, mimeType: binaryMime(file) }] };
    }
    case 'csv': {
      const text = await f.text();
      return { kind, parts: [{ kind: 'text', text }] };
    }
    case 'xlsx': {
      const bytes = await f.bytes();
      const wb = XLSX.read(bytes, { type: 'array' });
      const text = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n\n').trim();
      return { kind, parts: [{ kind: 'text', text }] };
    }
    case 'docx': {
      const bytes = await f.bytes();
      const entries = unzipSync(bytes);
      const xml = entries['word/document.xml'];
      const text = xml ? docxXmlToText(strFromU8(xml)) : '';
      return { kind, parts: [{ kind: 'text', text }] };
    }
    default:
      return { kind, parts: [] };
  }
}
