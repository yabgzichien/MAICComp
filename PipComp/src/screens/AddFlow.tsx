import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { BubbleText, PipSays } from '../components/ui';
import { getLLM } from '../llm';
import { todayISO } from '../lib/duplicates';
import { defaultLinkEffect } from '../lib/networth';
import { suggestForMerchant } from '../lib/recommend';
import type { CategorySuggestion, ExtractedTxn, Transaction } from '../lib/types';
import { emitTourSignal } from '../lib/tourSignals';
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
  const { commitCategorized, recordBalanceLink, accounts, memory, categories, catById, tourActive } = useAppData();

  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [image, setImage] = useState<PickedImage | null>(null);
  const [extracted, setExtracted] = useState<ExtractedTxn[]>([]);
  const [suggestions, setSuggestions] = useState<(CategorySuggestion | null)[]>([]);
  const [cached, setCached] = useState<ExtractedTxn[] | undefined>(undefined);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [result, setResult] = useState<Transaction[]>([]);
  const [newLearned, setNewLearned] = useState<NewLearned[]>([]);
  const [hasKey, setHasKey] = useState(true);

  useEffect(() => {
    getLLM().then((llm) => setHasKey(llm.can('extract')));
  }, []);

  const onPicked = (img: PickedImage) => {
    setImage(img);
    setCached(undefined);
    setPhase('extract');
  };

  const onExtracted = async (items: ExtractedTxn[], accountId: string | null) => {
    emitTourSignal('scan-extracted');
    setExtracted(items);
    setLinkId(accountId);

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
    const llm = await getLLM();
    if (!llm.can('guessCategories')) {
      setSuggestions(learned);
      setPhase('categorize');
      return;
    }

    try {
      const guessed = await withTimeout(
        llm.guessCategories({
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
    // If the whole batch was tagged to an account, move that account's balance
    // per saved row — direction derived from account kind + txn type (an expense
    // reduces an asset / pays down a liability; income does the reverse).
    const account = linkId ? accounts.find((a) => a.id === linkId) : null;
    if (account) {
      for (const t of created) {
        await recordBalanceLink(account.id, t.amount, defaultLinkEffect(account.kind, t.type), t.date ?? todayISO());
      }
    }
    setResult(created);
    setNewLearned(learned);
    setPhase('saved');
    emitTourSignal('scan-saved');
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
        showSamples={tourActive}
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
        linkId={linkId}
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
        linkId={linkId}
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
