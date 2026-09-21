#!/usr/bin/env node
// Test runner for FantasyDrafter.
// Discovers and runs test-draft-logic.mjs and all tests in tests/*.test.mjs

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

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
    .filter((f) => f.endsWith('.test.mjs') || f.endsWith('.test.js'))
    .map((f) => join('tests', f));
  testFiles.push(...dirFiles);
}

let passedSuites = 0;
let failedSuites = 0;
const concurrency = Math.min(os.cpus().length || 4, 8);
let nextIdx = 0;

async function runWorker() {
  while (nextIdx < testFiles.length) {
    const file = testFiles[nextIdx++];
    const result = await new Promise((resolve) => {
      const p = spawn(process.execPath, [file], { stdio: 'pipe' });
      let output = '';
      p.stdout.on('data', (chunk) => {
        output += chunk;
      });
      p.stderr.on('data', (chunk) => {
        output += chunk;
      });
      p.on('close', (status) => {
        resolve({ file, status, output });
      });
    });

    console.log(`\n▶ Running: ${result.file}`);
    if (result.output) {
      process.stdout.write(result.output);
    }
    if (result.status === 0) {
      passedSuites++;
    } else {
      failedSuites++;
      console.error(`❌ Suite failed: ${result.file} (Exit code: ${result.status})`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => runWorker()));

console.log('\n=============================================');
console.log(
  `Summary: ${passedSuites} passed, ${failedSuites} failed (Total: ${testFiles.length} suites)`,
);
console.log('=============================================');

if (failedSuites > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
