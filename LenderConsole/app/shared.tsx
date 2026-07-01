import type { ReactNode } from 'react';
import { FONT } from './tokens';

export function SectionLabel({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <p
      style={{
        fontFamily: FONT.ui,
        fontSize: 9.5,
        fontWeight: 700,
        color: color ?? '#9aa7a0',
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        marginBottom: 3,
      }}
    >
      {children}
    </p>
  );
}

export function MiniBar({ pct, color, track }: { pct: number; color: string; track: string }) {
  return (
    <div style={{ height: 5, borderRadius: 3, background: track, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
    </div>
  );
}
