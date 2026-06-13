// MUST be first: polyfills crypto.getRandomValues for @noble/ed25519 on Hermes/React Native
// (the browser and Node already provide it, so this is only needed on-device).
import 'react-native-get-random-values';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
