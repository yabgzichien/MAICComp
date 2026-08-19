// MUST be first: polyfills crypto.getRandomValues for @noble/ed25519 on Hermes/React Native
// (the browser and Node already provide it, so this is only needed on-device).
import 'react-native-get-random-values';

import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';

// Register background task handler for Android home screen widgets (Android only)
if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widget/widgetTask');
  registerWidgetTaskHandler(widgetTaskHandler);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

