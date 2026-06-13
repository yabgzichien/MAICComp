// Standard Expo Metro config. Extends Expo's defaults.
// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// --- expo-sqlite web support ---
// expo-sqlite on web is backed by wa-sqlite (WASM), so Metro must treat .wasm as an asset...
config.resolver.assetExts.push('wasm');

// ...and the WASM build needs SharedArrayBuffer, which requires cross-origin isolation.
// Set COOP/COEP headers on the dev server (`expo start --web`). For a hosted build you must
// also set these headers on the host (e.g. Netlify _headers / Vercel headers config).
config.server = config.server || {};
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    return middleware(req, res, next);
  };
};

module.exports = config;
