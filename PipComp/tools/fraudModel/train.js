'use strict';

const fs = require('fs');
const path = require('path');

// ── Configuration ────────────────────────────────────────────────────────────
const FEATURE_NAMES = [
  'provenance_trust',
  'benford_conformity',
  'round_ratio',
  'duplicate_ratio',
  'gap_mean',
  'gap_variance',
  'merchant_entropy',
  'amount_mean_norm',
  'amount_cv',
];
const N_FEATURES = 9;
const LR = 0.1;
const ITERATIONS = 1000;
const LAMBDA = 0.01; // L2 regularization

// ── Helpers ──────────────────────────────────────────────────────────────────
function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function dot(w, x) {
  let s = 0;
  for (let j = 0; j < w.length; j++) s += w[j] * x[j];
  return s;
}

// ── Load dataset ─────────────────────────────────────────────────────────────
const datasetPath = path.resolve(__dirname, '../fraudData/dataset.json');
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
const n = dataset.length;

// ── Compute feature statistics over ALL samples ───────────────────────────────
const featureMeans = new Array(N_FEATURES).fill(0);
const featureStds  = new Array(N_FEATURES).fill(0);

for (const sample of dataset) {
  for (let j = 0; j < N_FEATURES; j++) {
    featureMeans[j] += sample.features[j];
  }
}
for (let j = 0; j < N_FEATURES; j++) featureMeans[j] /= n;

for (const sample of dataset) {
  for (let j = 0; j < N_FEATURES; j++) {
    const diff = sample.features[j] - featureMeans[j];
    featureStds[j] += diff * diff;
  }
}
for (let j = 0; j < N_FEATURES; j++) featureStds[j] = Math.sqrt(featureStds[j] / n);

// ── Standardize ───────────────────────────────────────────────────────────────
function standardize(features) {
  return features.map((x, j) => (x - featureMeans[j]) / (featureStds[j] + 1e-8));
}

const allX = dataset.map(s => standardize(s.features));
const allY = dataset.map(s => s.label);

// ── Train/test split (80/20) ─────────────────────────────────────────────────
const splitIdx = Math.floor(0.8 * n);
const trainX = allX.slice(0, splitIdx);
const trainY = allY.slice(0, splitIdx);
const testX  = allX.slice(splitIdx);
const testY  = allY.slice(splitIdx);

// ── Logistic regression via gradient descent ──────────────────────────────────
const w = new Array(N_FEATURES).fill(0);
let bias = 0;
const nTrain = trainX.length;

for (let iter = 0; iter < ITERATIONS; iter++) {
  const gradW = new Array(N_FEATURES).fill(0);
  let gradBias = 0;

  for (let i = 0; i < nTrain; i++) {
    const z    = dot(w, trainX[i]) + bias;
    const pred = sigmoid(z);
    const err  = pred - trainY[i];
    for (let j = 0; j < N_FEATURES; j++) {
      gradW[j] += err * trainX[i][j];
    }
    gradBias += err;
  }

  for (let j = 0; j < N_FEATURES; j++) {
    gradW[j] = gradW[j] / nTrain + LAMBDA * w[j]; // L2 term
    w[j] -= LR * gradW[j];
  }
  bias -= LR * (gradBias / nTrain);
}

// ── Evaluate on test set ──────────────────────────────────────────────────────
const nTest = testX.length;
const scores = testX.map(x => sigmoid(dot(w, x) + bias));

// Precision / Recall at threshold 0.5
let tp = 0, fp = 0, fn = 0;
for (let i = 0; i < nTest; i++) {
  const pred = scores[i] >= 0.5 ? 1 : 0;
  if (pred === 1 && testY[i] === 1) tp++;
  if (pred === 1 && testY[i] === 0) fp++;
  if (pred === 0 && testY[i] === 1) fn++;
}
const precision = tp / (tp + fp) || 0;
const recall    = tp / (tp + fn) || 0;

// AUC-ROC via ranking (concordant pairs)
const positives = [];
const negatives = [];
for (let i = 0; i < nTest; i++) {
  if (testY[i] === 1) positives.push(scores[i]);
  else negatives.push(scores[i]);
}
let concordant = 0;
let tied = 0;
for (const p of positives) {
  for (const q of negatives) {
    if (p > q) concordant++;
    else if (p === q) tied++;
  }
}
const auc = (concordant + 0.5 * tied) / (positives.length * negatives.length);

console.log(`AUC: ${auc.toFixed(4)}, Precision: ${precision.toFixed(4)}, Recall: ${recall.toFixed(4)}`);
console.log(`Training samples: ${nTrain}, Test samples: ${nTest}`);

// ── Export weights ────────────────────────────────────────────────────────────
const weightsPath = path.resolve(__dirname, '../../src/lib/fraudModelWeights.json');
const payload = {
  featureNames: FEATURE_NAMES,
  weights: Array.from(w),
  bias,
  featureMeans: Array.from(featureMeans),
  featureStds:  Array.from(featureStds),
};
fs.writeFileSync(weightsPath, JSON.stringify(payload, null, 2), 'utf8');
console.log(`Weights written to ${weightsPath}`);

// ── Write METRICS.md ─────────────────────────────────────────────────────────
const metricsPath = path.resolve(__dirname, 'METRICS.md');
const metricsContent = `# Fraud Model  Training Metrics

## Results

| Metric    | Value    |
|-----------|----------|
| AUC-ROC   | ${auc.toFixed(4)} |
| Precision | ${precision.toFixed(4)} |
| Recall    | ${recall.toFixed(4)} |

## Dataset

| Split         | Samples |
|---------------|---------|
| Training set  | ${nTrain} |
| Test set      | ${nTest} |

## Dataset source

**Semi-real.** The *genuine* class is computed from real bank transactions  the **Berka
(PKDD'99) Czech-bank dataset** (~5,300 accounts, ~1M transactions, CC0)  so the genuine
behaviour (Benford distribution, inter-transaction gaps, amount dispersion) is real. The *fraud*
class is those same real accounts run through \`tools/fraudRealData/perturb.ts\` (partial, varied
fabrication). Rebuild with \`npx tsx tools/fraudRealData/build.ts\` then re-run this trainer.

The discriminating signals are currency- and country-agnostic (Benford, timing regularity,
dispersion), so the model generalises; production retrains/fine-tunes on real Malaysian e-wallet
data. \`merchant_entropy\`/\`duplicate_ratio\` use Berka's \`k_symbol\` codes as a merchant proxy
(real but low-cardinality).

## Hyperparameters

- Algorithm: Logistic Regression (gradient descent)
- Learning rate: ${LR}
- Iterations: ${ITERATIONS}
- L2 regularization lambda: ${LAMBDA}
- Threshold: 0.5

## Features (in order)

${FEATURE_NAMES.map((name, i) => `${i}. \`${name}\``).join('\n')}
`;
fs.writeFileSync(metricsPath, metricsContent, 'utf8');
console.log(`Metrics written to ${metricsPath}`);
