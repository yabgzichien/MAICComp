// src/lib/platformAlert.ts
// react-native-web's Alert.alert() is a hard no-op (no dialog, no callback — see
// node_modules/react-native-web/src/exports/Alert), so every confirm/notify in this
// app silently did nothing on web. These wrappers fall back to window.alert/confirm
// on web and keep native behavior (RN's real Alert) everywhere else.
import { Alert, Platform } from 'react-native';

/** A single-button informational message. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/** A Cancel + destructive-action confirm; `onConfirm` only runs if the user confirms. */
export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void | Promise<void>): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
