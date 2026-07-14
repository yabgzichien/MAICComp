// One-click PDF export (P2.11)  officers file PDFs, not markdown, so PDF is the primary
// artifact export for both the adverse-action letter and the credit memo. Client-side only
// (jsPDF), deterministic layout: this module only lays out text that's already been
// assembled elsewhere (letterToText / memoToMarkdown callers build the section list); it
// never invents or reformats content.

import { jsPDF } from 'jspdf';

export interface PdfSection {
  heading: string;
  /** Each entry is one paragraph or bullet line; wrapped to the page width. */
  lines: string[];
}

export interface PdfDoc {
  title: string;
  subtitle?: string;
  /** A short boxed notice under the header, e.g. "Template. Review before sending." */
  notice?: string;
  sections: PdfSection[];
}

const PAGE_WIDTH = 595; // A4 pt
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Renders a simple single-column document (title, optional notice, heading+body sections)
 *  and triggers a browser download. Paginates automatically when content overflows. */
export function downloadPdf(doc: PdfDoc, filename: string): void {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = MARGIN;

  function ensureRoom(next: number) {
    if (y + next > PAGE_HEIGHT - MARGIN) {
      pdf.addPage();
      y = MARGIN;
    }
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  ensureRoom(22);
  pdf.text(doc.title, MARGIN, y);
  y += 22;

  if (doc.subtitle) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    ensureRoom(16);
    pdf.text(doc.subtitle, MARGIN, y);
    y += 20;
  }

  if (doc.notice) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    const wrapped = pdf.splitTextToSize(doc.notice, CONTENT_WIDTH - 16) as string[];
    ensureRoom(wrapped.length * 12 + 14);
    pdf.setFillColor(255, 248, 230);
    pdf.setDrawColor(240, 214, 138);
    pdf.rect(MARGIN, y - 10, CONTENT_WIDTH, wrapped.length * 12 + 12, 'FD');
    pdf.setTextColor(138, 97, 0);
    wrapped.forEach((line, i) => pdf.text(line, MARGIN + 8, y + i * 12));
    pdf.setTextColor(0, 0, 0);
    y += wrapped.length * 12 + 20;
  }

  for (const section of doc.sections) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    ensureRoom(18);
    pdf.text(section.heading.toUpperCase(), MARGIN, y);
    y += 16;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    for (const line of section.lines) {
      const wrapped = pdf.splitTextToSize(line, CONTENT_WIDTH) as string[];
      for (const wline of wrapped) {
        ensureRoom(14);
        pdf.text(wline, MARGIN, y);
        y += 14;
      }
    }
    y += 10;
  }

  pdf.save(filename);
}
