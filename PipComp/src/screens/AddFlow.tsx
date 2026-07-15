import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { BubbleText, PipSays } from '../components/ui';
import { getProvider } from '../llm';
import { suggestForMerchant } from '../lib/recommend';
import type { CategorySuggestion, ExtractedTxn, Transaction } from '../lib/types';
import { configFor, loadSettings } from '../settings/settingsStore';
import { useAppData, type NewLearned } from '../state/store';
import { colors } from '../theme';
import { AttachScreen, type PickedImage } from './AttachScreen';
import { CategorizeScreen } from './CategorizeScreen';
import { ExtractScreen } from './ExtractScreen';
import { ImportScreen } from './ImportScreen';
import { ManualEntryScreen } from './ManualEntryScreen';
import { SavedScreen } from './SavedScreen';

type Phase = 'attach' | 'extract' | 'guessing' | 'categorize' | 'manual' | 'saved' | 'import';

const GUESS_TIMEOUT_MS = 12000;

/** Bounds an in-flight promise so a hung request can't strand the user indefinitely. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Category guess timed out.')), ms)),
  ]);
}

/**
 * The add-a-receipt flow: Attach → Extract → Categorize → Saved.
 * Mirrors the design's state machine but wired to the real LLM + SQLite.
 */
export function AddFlow({
  onClose,
  initialPhase = 'attach',
}: {
  onClose: () => void;
  initialPhase?: Phase;
}) {
  const { commitCategorized, memory, categories, catById } = useAppData();

  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [image, setImage] = useState<PickedImage | null>(null);
  const [extracted, setExtracted] = useState<ExtractedTxn[]>([]);
  const [suggestions, setSuggestions] = useState<(CategorySuggestion | null)[]>([]);
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

  const onExtracted = async (items: ExtractedTxn[]) => {
    setExtracted(items);

    const learned: (CategorySuggestion | null)[] = items.map((it) => {
      const s = suggestForMerchant(memory, it.merchant);
      if (!s) return null;
      const cat = catById[s];
      // only pre-fill if the learned category matches this item's kind
      return cat && cat.kind === it.type ? { categoryId: s, source: 'learned' } : null;
    });

    const missing = learned.map((s, i) => (s ? -1 : i)).filter((i) => i !== -1);
    if (missing.length === 0) {
      setSuggestions(learned);
      setPhase('categorize');
      return;
    }

    setPhase('guessing');
    const settings = await loadSettings();
    const config = configFor(settings, 'general');
    const provider = getProvider(config.provider);
    if (!config.apiKey || !provider.guessCategories) {
      setSuggestions(learned);
      setPhase('categorize');
      return;
    }

    try {
      const guessed = await withTimeout(
        provider.guessCategories({
          apiKey: config.apiKey,
          model: config.model,
          items: missing.map((i) => ({ index: i, merchant: items[i].merchant, amount: items[i].amount, method: items[i].method, kind: items[i].type })),
          categories: categories.map((c) => ({ id: c.id, label: c.label, kind: c.kind })),
        }),
        GUESS_TIMEOUT_MS
      );
      setSuggestions(learned.map((s, i) => s ?? (guessed[i] ? { categoryId: guessed[i]!, source: 'guess' } : null)));
    } catch {
      // Enhancement-only: any failure (network, timeout, bad reply) just falls
      // back to today's behavior  no suggestion for that merchant.
      setSuggestions(learned);
    }
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
        onManual={() => setPhase('manual')}
        onImport={() => setPhase('import')}
      />
    );
  }
  if (phase === 'import') {
    return <ImportScreen onClose={onClose} />;
  }
  if (phase === 'guessing') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', paddingHorizontal: 18 }}>
        <PipSays expr="think">
          <BubbleText>Thinking about your new merchants… this can take a few seconds.</BubbleText>
        </PipSays>
      </View>
    );
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
