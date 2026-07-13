#!/usr/bin/env node
// Anti-regression guard (CEO action plan P0.2, 2026-07-12): on 2026-07-12, 16 of this
// project's 23 test suites were found silently reduced to a 7-line stub
// (`describe('restored test suite', () => it('compiles and passes', ...))`), and every
// test file was simultaneously gitignored — so the gutting was invisible to `git status`
// and `npm test` kept reporting green. This script makes both failure modes loud:
//   1. Any test file matching the stub signature fails the run by name.
//   2. A total test count below the floor fails the run even if every file "passes".
// Run via `npm run test:integrity` (see package.json), ideally before `npm test` in CI.

'use strict';
const fs = require('fs');
const path = require('path');

const LIB_DIR = path.join(__dirname, '..', 'lib');
// Set well below the current real count (438 as of 2026-07-12) so ordinary test growth
// never trips it, but far above the gutted count (67) so a repeat cannot hide.
const MINIMUM_TOTAL_TESTS = 300;

const STUB_SIGNATURE = /describe\(\s*['"]restored test suite['"]/;

function listTestFiles(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.test.ts'));
}

/** Rough-but-reliable test count: counts top-level `it(`/`it.each(` calls per file. Not
 *  exact (doesn't expand `it.each` tables to their row count) but monotonic enough to
 *  catch a suite being silently gutted, which is all this guard exists to do. */
function countTests(source) {
  const matches = source.match(/\bit(?:\.each\([^)]*\))?\s*\(/g);
  return matches ? matches.length : 0;
}

function main() {
  const files = listTestFiles(LIB_DIR);
  const stubbed = [];
  let total = 0;

  for (const file of files) {
    const full = path.join(LIB_DIR, file);
    const source = fs.readFileSync(full, 'utf8');
    if (STUB_SIGNATURE.test(source)) stubbed.push(file);
    total += countTests(source);
  }

  const problems = [];
  if (stubbed.length > 0) {
    problems.push(`${stubbed.length} test file(s) match the known stub signature:\n  - ${stubbed.join('\n  - ')}`);
  }
  if (total < MINIMUM_TOTAL_TESTS) {
    problems.push(`Total test count (${total}) is below the floor of ${MINIMUM_TOTAL_TESTS} — a suite may have been gutted or deleted.`);
  }

  if (problems.length > 0) {
    console.error('\n✗ Test-integrity guard FAILED:\n');
    for (const p of problems) console.error(p + '\n');
    console.error(`Scanned ${files.length} file(s) in lib/, found ~${total} test(s) total.`);
    process.exit(1);
  }

  console.log(`✓ Test-integrity guard passed: ${files.length} files, ~${total} tests, no stub signatures.`);
}

main();
