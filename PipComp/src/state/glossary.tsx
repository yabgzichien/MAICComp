import React, { createContext, useContext, useMemo, useState } from 'react';

interface GlossaryCtx {
  openEntry: string | null;
  open: (entry: string) => void;
  close: () => void;
}

const Ctx = createContext<GlossaryCtx>({ openEntry: null, open: () => {}, close: () => {} });

/** Holds which glossary entry (if any) the InfoButton/GlossaryModal pair is showing, app-wide. */
export function GlossaryProvider({ children }: { children: React.ReactNode }) {
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const value = useMemo<GlossaryCtx>(
    () => ({ openEntry, open: setOpenEntry, close: () => setOpenEntry(null) }),
    [openEntry]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGlossary(): GlossaryCtx {
  return useContext(Ctx);
}
