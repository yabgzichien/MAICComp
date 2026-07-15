import { useEffect, type ReactNode, type RefObject } from 'react';
import { FONT, GLOSSARY, type Palette } from './tokens';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal accessibility (2026-07-15 agent-work review, item 6b): Esc-to-close already existed
 * per-modal; this adds the two things that didn't  focus moves into the dialog on open (and
 * back to whatever triggered it on close), and Tab/Shift+Tab cycles within the dialog instead
 * of escaping to the page behind the scrim. One hook so CreditMemo and AdverseActionLetter
 * (the two real modals) share one implementation rather than drifting.
 */
export function useModalA11y(dialogRef: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusables = (): HTMLElement[] =>
      dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null) : [];

    (focusables()[0] ?? dialog)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);
}

export function SectionLabel({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <p
      role="heading"
      aria-level={2}
      style={{
        fontFamily: FONT.ui,
        fontSize: 12,
        fontWeight: 700,
        // ink3 (#9aa7a0) measures ~2.2-2.5:1 contrast  too low for meaningful text like a
        // section label; default to ink2 (#5d6b63) instead. Explicit `color` still wins.
        color: color ?? '#5d6b63',
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        marginBottom: 3,
      }}
    >
      {children}
    </p>
  );
}

/** A small circular "i" button that opens the glossary modal for `entry`. Use `dark` on dark
 *  backgrounds (the pool-stats bar). Stops click propagation so it never triggers a parent press. */
export function InfoButton({
  entry,
  onOpen,
  dark,
  color,
}: {
  entry: string;
  onOpen: (entry: string) => void;
  dark?: boolean;
  color?: string;
}) {
  return (
    <button
      type="button"
      aria-label={`What is ${GLOSSARY[entry]?.term ?? 'this'}?`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(entry);
      }}
      style={{
        width: 15,
        height: 15,
        borderRadius: '50%',
        border: 'none',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        padding: 0,
        lineHeight: 1,
        verticalAlign: 'middle',
        background: dark ? 'rgba(255,255,255,0.16)' : 'rgba(20,40,30,0.07)',
        color: color ?? (dark ? 'rgba(255,255,255,0.72)' : '#7d8a83'),
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontStyle: 'italic',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      i
    </button>
  );
}

/** Centered glossary modal. Renders nothing when `entry` is null. Dismiss via backdrop, ✕, or Esc. */
export function InfoModal({ entry, onClose, p }: { entry: string | null; onClose: () => void; p: Palette }) {
  useEffect(() => {
    if (!entry) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entry, onClose]);

  if (!entry) return null;
  const e = GLOSSARY[entry];
  if (!e) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(14,24,18,0.46)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'fade-in-up 0.16s ease-out',
      }}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        style={{
          background: p.surface,
          borderRadius: 16,
          width: '100%',
          maxWidth: 460,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(14,24,18,0.34)',
        }}
      >
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${p.hairline}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: p.ink3, marginBottom: 6 }}>
              Glossary
            </p>
            <h3 style={{ fontFamily: FONT.ui, fontSize: 19, fontWeight: 800, color: p.ink1, letterSpacing: '-0.3px' }}>{e.term}</h3>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{ border: 'none', background: p.surface2, borderRadius: 8, width: 30, height: 30, flexShrink: 0, cursor: 'pointer', color: p.ink2, fontSize: 15, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: '16px 24px 22px' }}>
          <p style={{ fontFamily: FONT.ui, fontSize: 13.5, fontWeight: 600, color: p.accentInk, lineHeight: 1.55, marginBottom: 12 }}>{e.short}</p>
          <p style={{ fontFamily: FONT.ui, fontSize: 12.5, color: p.ink2, lineHeight: 1.7 }}>{e.body}</p>
        </div>
      </div>
    </div>
  );
}

export function MiniBar({ pct, color, track }: { pct: number; color: string; track: string }) {
  return (
    <div style={{ height: 5, borderRadius: 3, background: track, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
    </div>
  );
}
