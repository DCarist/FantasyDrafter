// Test suite for Server Startup & 1-Click Opener
import { readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

resetFailures();
printSuiteHeader('Server Startup & 1-Click Launchers');

// --- Test 1: start.bat Launcher File Validation ---
assert(existsSync('start.bat'), 'start.bat exists in repository root');
const batContent = readFileSync('start.bat', 'utf-8');
assert(batContent.includes('cd /d "%~dp0"'), 'start.bat changes directory to script location');
assert(batContent.includes('python server.py'), 'start.bat invokes python server.py');
assert(batContent.includes('py server.py'), 'start.bat includes fallback to py launcher');

// --- Test 2: start.ps1 PowerShell Script Validation ---
assert(existsSync('start.ps1'), 'start.ps1 exists in repository root');
const psContent = readFileSync('start.ps1', 'utf-8');
assert(psContent.includes('$PSScriptRoot'), 'start.ps1 references script root directory');
assert(psContent.includes('python server.py'), 'start.ps1 runs python server.py');

// --- Test 3: package.json Script Commands ---
assert(existsSync('package.json'), 'package.json exists');
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
assert(Boolean(pkg.scripts), 'package.json defines scripts');
eq(pkg.scripts.start, 'python server.py', 'npm start invokes python server.py');
eq(pkg.scripts['start:headless'], 'python server.py --no-browser', 'npm run start:headless passes --no-browser');
eq(pkg.scripts.serve, 'python server.py', 'npm run serve alias invokes python server.py');

// --- Test 4: server.py CLI Argument Parsing & Help Flags ---
const helpResult = spawnSync('python', ['server.py', '--help'], { encoding: 'utf-8' });
eq(helpResult.status, 0, 'python server.py --help exits with code 0');
assert(helpResult.stdout.includes('--no-browser'), 'server.py documents --no-browser flag in help output');
assert(helpResult.stdout.includes('--port'), 'server.py documents --port flag in help output');
assert(helpResult.stdout.includes('--skip-update'), 'server.py documents --skip-update flag in help output');
assert(helpResult.stdout.includes('--update'), 'server.py documents --update flag in help output');
assert(helpResult.stdout.includes('--max-age'), 'server.py documents --max-age flag in help output');

// --- Test 5: server.py Source Code Anchoring & Pick/Log/Update Handlers ---
const serverPyContent = readFileSync('server.py', 'utf-8');
assert(serverPyContent.includes('webbrowser'), 'server.py imports webbrowser module');
assert(serverPyContent.includes('os.chdir'), 'server.py ensures working directory is anchored to script directory');
assert(serverPyContent.includes('/favicon.ico'), 'server.py handles /favicon.ico requests');
assert(serverPyContent.includes('FAVICON_SVG'), 'server.py defines SVG football favicon');
assert(serverPyContent.includes('/api/sync/log'), 'server.py handles /api/sync/log requests');
assert(serverPyContent.includes('get_player_data_age'), 'server.py defines get_player_data_age function');
assert(serverPyContent.includes('ensure_player_data_fresh'), 'server.py defines ensure_player_data_fresh function');
assert(serverPyContent.includes('log_message'), 'server.py overrides log_message to filter background noise');

// --- Test 6: draft-board.html Favicon, Smart Zero-Poll SSE & Server Reporting ---
const htmlContent = readFileSync('draft-board.html', 'utf-8');
assert(htmlContent.includes('rel="icon"'), 'draft-board.html defines favicon link tag');
assert(htmlContent.includes('stopFallbackPolling()'), 'draft-board.html halts polling on SSE connect/message');
assert(htmlContent.includes('startFallbackPolling()'), 'draft-board.html only activates fallback polling on error');
assert(htmlContent.includes('reportServerPick'), 'draft-board.html defines reportServerPick helper');
assert(htmlContent.includes('reportServerEvent'), 'draft-board.html defines reportServerEvent helper');

// --- Test 7: Player Data Age Evaluation ---
const ageCheckResult = spawnSync('python', ['-c', 'from server import get_player_data_age; age, d = get_player_data_age(); assert age is not None; print(f"{age},{d}")'], { encoding: 'utf-8' });
eq(ageCheckResult.status, 0, 'get_player_data_age runs without error');
assert(ageCheckResult.stdout.includes('2026-'), 'get_player_data_age returns valid date timestamp');

const success = finishSuite('Server Startup & 1-Click Launchers');
if (!success) {
  process.exit(1);
}

