#!/usr/bin/env node
/**
 * Quality Checker & Workflow Runner for FantasyDrafter
 *
 * Runs code quality tools across all languages used in the repository:
 *   - Biome: JS, HTML, CSS formatting and linting
 *   - Ruff: Python linting and format checking
 *   - Ty: Python type checking
 *   - Test Runner: Node.js feature & unit tests
 *
 * Usage:
 *   node scripts/check-quality.mjs                     # Run all quality checks
 *   node scripts/check-quality.mjs --tool=biome        # Run Biome (JS, HTML, CSS)
 *   node scripts/check-quality.mjs --tool=ruff         # Run Ruff (Python lint & format)
 *   node scripts/check-quality.mjs --tool=ty           # Run Ty (Python type check)
 *   node scripts/check-quality.mjs --tool=py           # Run all Python tools (Ruff + Ty)
 *   node scripts/check-quality.mjs --tool=tests        # Run tests
 *   node scripts/check-quality.mjs --fix               # Auto-fix formatting and safe lints
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const isFix = args.includes('--fix');
const toolArg = args.find((a) => a.startsWith('--tool='));
const selectedTool = toolArg ? toolArg.split('=')[1].toLowerCase() : 'all';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function logHeader(title) {
  console.log(`\n${colors.cyan}${colors.bold}=== ${title} ===${colors.reset}`);
}

function runStep(name, command, cmdArgs) {
  console.log(`\n${colors.yellow}▶ Running ${name}...${colors.reset}`);
  console.log(`${colors.dim}$ ${command} ${cmdArgs.join(' ')}${colors.reset}\n`);

  const startTime = Date.now();
  const res = spawnSync(command, cmdArgs, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: true
  });
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  const passed = res.status === 0;
  if (passed) {
    console.log(`\n${colors.green}✔ ${name} passed (${duration}s)${colors.reset}`);
  } else {
    console.log(`\n${colors.red}✖ ${name} failed with exit code ${res.status} (${duration}s)${colors.reset}`);
  }

  return { name, passed, duration, exitCode: res.status };
}

const steps = [];

// 1. Biome (JS, HTML, CSS)
if (['all', 'biome', 'js'].includes(selectedTool)) {
  logHeader('Biome: JavaScript, HTML, CSS');
  if (isFix) {
    steps.push(runStep('Biome Format & Fix', 'npx', ['biome', 'check', '--write', '.']));
  } else {
    steps.push(runStep('Biome Check', 'npx', ['biome', 'check', '.']));
  }
}

// 2. Ruff (Python Linting & Formatting)
if (['all', 'ruff', 'py', 'python'].includes(selectedTool)) {
  logHeader('Ruff: Python Linting & Formatting');
  if (isFix) {
    steps.push(runStep('Ruff Format', 'ruff', ['format', '.']));
    steps.push(runStep('Ruff Lint Fix', 'ruff', ['check', '--fix', '.']));
  } else {
    steps.push(runStep('Ruff Format Check', 'ruff', ['format', '--check', '.']));
    steps.push(runStep('Ruff Lint Check', 'ruff', ['check', '.']));
  }
}

// 3. Ty (Python Type Checking)
if (['all', 'ty', 'py', 'python'].includes(selectedTool)) {
  logHeader('Ty: Python Type Checking');
  steps.push(runStep('Ty Type Check', 'ty', ['check', '.']));
}

// 4. Test Suite
if (['all', 'tests', 'test'].includes(selectedTool)) {
  logHeader('Test Suite');
  steps.push(runStep('Unit & Feature Tests', 'node', ['test-runner.mjs']));
}

// Summary
console.log(`\n${colors.bold}================ Quality Checks Summary ================${colors.reset}`);
let allPassed = true;
for (const step of steps) {
  const statusBadge = step.passed ? `${colors.green}[PASS]${colors.reset}` : `${colors.red}[FAIL]${colors.reset}`;
  console.log(`  ${statusBadge} ${step.name.padEnd(30)} (${step.duration}s)`);
  if (!step.passed) allPassed = false;
}
console.log(`${colors.bold}========================================================${colors.reset}`);

if (allPassed) {
  console.log(`\n${colors.green}${colors.bold}🎉 All requested quality checks passed successfully!${colors.reset}\n`);
  process.exit(0);
} else {
  console.log(`\n${colors.red}${colors.bold}⚠️  Some quality checks reported errors. Please review the output above.${colors.reset}\n`);
  process.exit(1);
}

