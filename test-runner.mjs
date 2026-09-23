#!/usr/bin/env node
// Test runner for FantasyDrafter.
// Discovers and runs test-draft-logic.mjs and all tests in tests/*.test.mjs

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

console.log('=============================================');
console.log('     FantasyDrafter Test Suite Runner        ');
console.log('=============================================\n');

const root = dirname(fileURLToPath(import.meta.url));
const testFiles = ['test-draft-logic.mjs'];

if (existsSync(join(root, 'tests'))) {
  testFiles.push(
    ...readdirSync(join(root, 'tests'))
      .filter((file) => file.endsWith('.test.mjs') || file.endsWith('.test.js'))
      .sort()
      .map((file) => join('tests', file)),
  );
}
if (testFiles.length === 1) throw new Error('No feature suites found in tests/');

const concurrency = Math.min(os.availableParallelism?.() || os.cpus().length, 8, testFiles.length);
const results = new Array(testFiles.length);
let nextIdx = 0;

async function runWorker() {
  while (nextIdx < testFiles.length) {
    const index = nextIdx++;
    const file = testFiles[index];
    results[index] = await new Promise((resolve) => {
      const child = spawn(process.execPath, [file], { cwd: root, stdio: 'pipe' });
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });
      child.on('error', (error) => resolve({ file, status: null, output: `${output}\n${error}` }));
      child.on('close', (status) => resolve({ file, status, output }));
    });
  }
}

await Promise.all(Array.from({ length: concurrency }, () => runWorker()));

let failedSuites = 0;
for (const result of results) {
  console.log(`\nRunning: ${result.file}`);
  if (result.output) process.stdout.write(result.output);
  if (result.status !== 0) {
    failedSuites++;
    console.error(`Suite failed: ${result.file} (exit code: ${result.status})`);
  }
}
console.log(
  `\nSummary: ${testFiles.length - failedSuites} passed, ${failedSuites} failed (Total: ${testFiles.length} suites)`,
);
if (failedSuites > 0) process.exitCode = 1;
