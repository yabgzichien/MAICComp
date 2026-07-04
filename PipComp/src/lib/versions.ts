// src/lib/versions.ts
// Single source of truth for the version stamps carried inside every signed passport
// (`provenanceMeta`). A disputed decision can only be re-run later if the passport
// records exactly which logic produced it — these constants are that record.
//
// Bump rules (bump BEFORE shipping the change that triggers it):
// - ENGINE_VERSION: any change that alters computeCreditScore / computeDataConfidence
//   outputs — factor weights, band cutoffs, confidence weighting, integrity rings.
// - POLICY_VERSION: any change to the loans.ts policy constants (confidence floor,
//   DSR cap, surplus share, coverage gates) or to DEFAULT_PRODUCTS.
// - MODEL_WEIGHTS_VERSION: any retrain that rewrites fraudModelWeights.json.
//
// tools/demoPassport/generate.js reads these constants by regex — keep each export
// in the single-quoted `export const NAME = '...'` literal form below.

export const ENGINE_VERSION = '1.0.0';
export const POLICY_VERSION = '1.0.0';
export const MODEL_WEIGHTS_VERSION = '1.0.0-berka9';
