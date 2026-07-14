import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pip } from './Pip';
import { PrimaryButton, BtnLabel } from './ui';
import { colors, uiFont } from '../theme';

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
      <View style={styles.compact}>
        <Text style={styles.compactText}>{this.props.title ?? "Couldn't render this"}</Text>
        {this.props.message && <Text style={styles.compactSub}>{this.props.message}</Text>}
      </View>
    ) : (
      <View style={styles.full}>
        <Pip size={72} expr="curious" />
        <Text style={styles.title}>{this.props.title ?? 'Something went wrong'}</Text>
        <Text style={styles.message}>
          {this.props.message ?? "This screen hit a snag. Your data is safe. Try again, and if it keeps happening, restart the app."}
        </Text>
        <PrimaryButton onPress={this.reset} height={48}>
          <BtnLabel>Try again</BtnLabel>
        </PrimaryButton>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  full: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 32,
    backgroundColor: colors.bg,
  },
  title: { fontFamily: uiFont(700), fontSize: 17, color: colors.ink, textAlign: 'center' },
  message: { fontFamily: uiFont(500), fontSize: 13.5, color: colors.ink2, textAlign: 'center', lineHeight: 19, marginBottom: 6 },
  compact: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    gap: 4,
  },
  compactText: { fontFamily: uiFont(600), fontSize: 13, color: colors.ink },
  compactSub: { fontFamily: uiFont(500), fontSize: 11.5, color: colors.ink2, textAlign: 'center' },
});
