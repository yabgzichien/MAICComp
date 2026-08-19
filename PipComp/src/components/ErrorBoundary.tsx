import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pip } from './Pip';
import { PrimaryButton, BtnLabel } from './ui';
import { useThemeColors } from '../state/colorScheme';
import { uiFont } from '../theme';

type Props = {
  children: React.ReactNode;
  /** Custom fallback; defaults to a full-screen recoverable error card. */
  fallback?: (reset: () => void) => React.ReactNode;
  /** Compact inline fallback instead of the full-screen default (for a single crashy widget). */
  compact?: boolean;
  title?: string;
  message?: string;
};

type State = { hasError: boolean };

/**
 * Catches render-time errors in its subtree so a single broken component (e.g. a QR code
 * whose payload exceeds encoding capacity) can never blank the whole app. React error boundaries
 * only catch render/lifecycle errors, not event handlers or async code — those are handled at
 * their own call sites.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary caught:', error);
    }
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);
    return this.props.compact ? (
      <CompactFallback title={this.props.title} message={this.props.message} />
    ) : (
      <FullFallback title={this.props.title} message={this.props.message} onReset={this.reset} />
    );
  }
}

/** Class components can't call hooks, so the fallback UI (which needs the reactive theme) lives
 *  in these small function components instead. */
function CompactFallback({ title, message }: { title?: string; message?: string }) {
  const colorTheme = useThemeColors();
  return (
    <View style={[styles.compact, { borderColor: colorTheme.line, backgroundColor: colorTheme.surface2 }]}>
      <Text style={[styles.compactText, { color: colorTheme.ink }]}>{title ?? "Couldn't render this"}</Text>
      {message && <Text style={[styles.compactSub, { color: colorTheme.ink2 }]}>{message}</Text>}
    </View>
  );
}

function FullFallback({ title, message, onReset }: { title?: string; message?: string; onReset: () => void }) {
  const colorTheme = useThemeColors();
  return (
    <View style={[styles.full, { backgroundColor: colorTheme.bg }]}>
      <Pip size={72} expr="curious" />
      <Text style={[styles.title, { color: colorTheme.ink }]}>{title ?? 'Something went wrong'}</Text>
      <Text style={[styles.message, { color: colorTheme.ink2 }]}>
        {message ?? "This screen hit a snag. Your data is safe. Try again, and if it keeps happening, restart the app."}
      </Text>
      <PrimaryButton onPress={onReset} height={48}>
        <BtnLabel>Try again</BtnLabel>
      </PrimaryButton>
    </View>
  );
}

const styles = StyleSheet.create({
  full: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 32,
  },
  title: { fontFamily: uiFont(700), fontSize: 17, textAlign: 'center' },
  message: { fontFamily: uiFont(500), fontSize: 13.5, textAlign: 'center', lineHeight: 19, marginBottom: 6 },
  compact: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  compactText: { fontFamily: uiFont(600), fontSize: 13 },
  compactSub: { fontFamily: uiFont(500), fontSize: 11.5, textAlign: 'center' },
});
