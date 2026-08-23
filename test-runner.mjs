#!/usr/bin/env node
// Test runner for FantasyDrafter.
// Discovers and runs test-draft-logic.mjs and all tests in tests/*.test.mjs

import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

console.log('=============================================');
console.log('     FantasyDrafter Test Suite Runner        ');
console.log('=============================================\n');

const testFiles = [];

// 1. Existing baseline test suite (kept intact)
if (existsSync('test-draft-logic.mjs')) {
  testFiles.push('test-draft-logic.mjs');
}

// 2. Discover test suites in tests/
if (existsSync('tests')) {
  const dirFiles = readdirSync('tests')
    .filter(f => f.endsWith('.test.mjs') || f.endsWith('.test.js'))
    .map(f => join('tests', f));
  testFiles.push(...dirFiles);
}

let passedSuites = 0;
let failedSuites = 0;

for (const file of testFiles) {
  console.log(`\n▶ Running: ${file}`);
  const result = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  if (result.status === 0) {
    passedSuites++;
  } else {
    failedSuites++;
    console.error(`❌ Suite failed: ${file} (Exit code: ${result.status})`);
  }
}

console.log('\n=============================================');
console.log(`Summary: ${passedSuites} passed, ${failedSuites} failed (Total: ${testFiles.length} suites)`);
console.log('=============================================');

if (failedSuites > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

