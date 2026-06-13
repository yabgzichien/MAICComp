// src/lib/parseBalance.ts
// Defensive parser for the "scan a balance" reply: {"amount": number}. Pure & tested.

export function parseBalance(content: string): number | null {
  const cleaned = stripFences(content).trim();
  if (!cleaned) return null;
  let data: any;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const raw = data?.amount;
  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'string') {
    const c = raw.replace(/[^0-9.]/g, '');
    if (!/[0-9]/.test(c)) return null;
    n = Number(c);
  } else {
    return null;
  }
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1] : s;
}
