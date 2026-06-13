import React, { useEffect, useState } from 'react';
import { suggestForMerchant } from '../lib/recommend';
import type { ExtractedTxn, Transaction } from '../lib/types';
import { configFor, loadSettings } from '../settings/settingsStore';
import { useAppData, type NewLearned } from '../state/store';
import { AttachScreen, type PickedImage } from './AttachScreen';
import { CategorizeScreen } from './CategorizeScreen';
import { ExtractScreen } from './ExtractScreen';
import { ImportScreen } from './ImportScreen';
import { ManualEntryScreen } from './ManualEntryScreen';
import { SavedScreen } from './SavedScreen';

type Phase = 'attach' | 'extract' | 'categorize' | 'manual' | 'saved' | 'import';

/**
 * The add-a-receipt flow: Attach → Extract → Categorize → Saved.
 * Mirrors the design's state machine but wired to the real LLM + SQLite.
 */
export function AddFlow({
  onClose,
  onOpenSettings,
  initialPhase = 'attach',
}: {
  onClose: () => void;
  onOpenSettings: () => void;
  initialPhase?: Phase;
}) {
  const { commitCategorized, memory, categories, catById } = useAppData();

  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [image, setImage] = useState<PickedImage | null>(null);
  const [extracted, setExtracted] = useState<ExtractedTxn[]>([]);
  const [suggestions, setSuggestions] = useState<(string | null)[]>([]);
  const [cached, setCached] = useState<ExtractedTxn[] | undefined>(undefined);
  const [result, setResult] = useState<Transaction[]>([]);
  const [newLearned, setNewLearned] = useState<NewLearned[]>([]);
  const [hasKey, setHasKey] = useState(true);

  useEffect(() => {
    loadSettings().then((s) => setHasKey(!!configFor(s, 'general').apiKey));
  }, []);

  const onPicked = (img: PickedImage) => {
    setImage(img);
    setCached(undefined);
    setPhase('extract');
  };

  const onExtracted = (items: ExtractedTxn[]) => {
    setExtracted(items);
    setSuggestions(
      items.map((it) => {
        const s = suggestForMerchant(memory, it.merchant);
        if (!s) return null;
        const cat = catById[s];
        // only pre-fill if the learned category matches this item's kind
        return cat && cat.kind === it.type ? s : null;
      })
    );
    setPhase('categorize');
  };

  const onCategorized = async (assignments: (string | null)[], items: ExtractedTxn[]) => {
    const { created, newLearned: learned } = await commitCategorized(items, assignments, 'extracted');
    setResult(created);
    setNewLearned(learned);
    setPhase('saved');
  };

  const onManualComplete = async (item: ExtractedTxn, categoryId: string) => {
    const { created, newLearned: learned } = await commitCategorized([item], [categoryId], 'manual');
    setResult(created);
    setNewLearned(learned);
    setPhase('saved');
  };

  if (phase === 'attach') {
    return (
      <AttachScreen
        hasKey={hasKey}
        onClose={onClose}
        onPicked={onPicked}
        onOpenSettings={onOpenSettings}
        onManual={() => setPhase('manual')}
        onImport={() => setPhase('import')}
      />
    );
  }
  if (phase === 'import') {
    return <ImportScreen onClose={onClose} onOpenSettings={onOpenSettings} />;
  }
  if (phase === 'manual') {
    return <ManualEntryScreen categories={categories} onBack={() => setPhase('attach')} onComplete={onManualComplete} />;
  }
  if (phase === 'extract' && image) {
    return (
      <ExtractScreen
        key={`${image.uri}:${cached ? 'c' : 'f'}`}
        image={image}
        cachedItems={cached}
        onBack={() => setPhase('attach')}
        onDone={onExtracted}
      />
    );
  }
  if (phase === 'categorize') {
    return (
      <CategorizeScreen
        extracted={extracted}
        suggestions={suggestions}
        categories={categories}
        onBack={() => {
          setCached(extracted);
          setPhase('extract');
        }}
        onComplete={onCategorized}
      />
    );
  }
  return <SavedScreen result={result} newLearned={newLearned} catById={catById} onDone={onClose} />;
}
