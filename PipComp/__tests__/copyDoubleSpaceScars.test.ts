// Guard test (2026-07-15 agent-work review, item 2): the C1 em-dash sweep replaced every
// "X  Y" (a double space left behind by a stripped em-dash) with "X. Y", but new copy written
// after that sweep reintroduced the same scar. This walks the real TS AST (not a naive quote
// regex, which mismatches on apostrophes like "doesn't" inside comments/JSX text) to collect
// every string literal, template-literal chunk, and JSX text node, then checks each for the
// stripped-em-dash signature so the mistake can't silently ship again.
import fs from 'fs';
import path from 'path';
import * as ts from 'typescript';

const ROOT = path.join(__dirname, '..');
const COPY_DIRS = ['src/screens', 'src/components'];
const COPY_FILES = ['src/lib/tourSteps.ts', 'src/lib/loans.ts'];

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every real string/text chunk in a TS/TSX file: string literals, template-literal parts
 *  (not the ${expr} holes), and JSX text nodes. Comments and identifiers are never visited. */
function collectCopyStrings(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      out.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      out.push(node.head.text);
      node.templateSpans.forEach((s) => out.push(s.literal.text));
    } else if (ts.isJsxText(node)) {
      out.push(node.getText(sf));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

// A run of 2+ literal spaces adjacent to real content is the stripped-em-dash signature.
// Multi-line JSX source formatting wraps text across lines with a newline + indentation
// (e.g. "...text.\n              "); collapsing any "whitespace containing a newline" down to
// one space first means that normal wrapping is never mistaken for a scar, while a genuine
// same-line double space  including one that sits right at a JSX sibling-element boundary,
// like "Hmm  <B>...</B>"  survives the collapse and gets caught (checked at the string's
// start/end too, since a JSX text node ends exactly at that boundary).
function hasDoubleSpaceScar(text: string): boolean {
  // \s (not just [ \t]) so a run of MULTIPLE newlines (an intentional paragraph break, say)
  // collapses to exactly one space too, not one space per newline.
  const normalized = text.replace(/\s*\n\s*/g, ' ');
  return /\S {2,}\S/.test(normalized) || /\S {2,}$/.test(normalized) || /^ {2,}\S/.test(normalized);
}

const files = [
  ...COPY_DIRS.flatMap((d) => collectSourceFiles(path.join(ROOT, d))),
  ...COPY_FILES.map((f) => path.join(ROOT, f)),
];

describe('user-facing copy has no stripped-em-dash double-space scars', () => {
  it.each(files.map((f) => [path.relative(ROOT, f), f] as const))('%s', (_label, file) => {
    const offenders = collectCopyStrings(file).filter(hasDoubleSpaceScar);
    expect(offenders).toEqual([]);
  });
});
