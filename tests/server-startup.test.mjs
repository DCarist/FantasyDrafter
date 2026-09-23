// Test suite for Server Startup & 1-Click Opener

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { assert, eq, finishSuite, printSuiteHeader, resetFailures } from './test-helper.mjs';

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
eq(
  pkg.scripts['start:headless'],
  'python server.py --no-browser',
  'npm run start:headless passes --no-browser',
);
eq(pkg.scripts.serve, 'python server.py', 'npm run serve alias invokes python server.py');

// --- Test 4: server.py CLI Argument Parsing & Help Flags ---
const helpResult = spawnSync('python', ['server.py', '--help'], { encoding: 'utf-8' });
eq(helpResult.status, 0, 'python server.py --help exits with code 0');
assert(
  helpResult.stdout.includes('--no-browser'),
  'server.py documents --no-browser flag in help output',
);
assert(helpResult.stdout.includes('--port'), 'server.py documents --port flag in help output');
assert(
  helpResult.stdout.includes('--skip-update'),
  'server.py documents --skip-update flag in help output',
);
assert(helpResult.stdout.includes('--update'), 'server.py documents --update flag in help output');
assert(
  helpResult.stdout.includes('--max-age'),
  'server.py documents --max-age flag in help output',
);

// Dispatch real handler methods against an in-memory HTTP response. A source
// string containing an endpoint name does not prove that it is reachable.
const handlerScript = `
import io, json
from unittest.mock import patch
from server import SyncRelayHandler

def request(path, method, body=b''):
    handler = SyncRelayHandler.__new__(SyncRelayHandler)
    handler.path = path
    handler.wfile = io.BytesIO()
    handler.rfile = io.BytesIO(body)
    handler.headers = {'Content-Length': str(len(body))}
    statuses, headers = [], {}
    handler.send_response = lambda status: statuses.append(status)
    handler.send_header = lambda name, value: headers.__setitem__(name, value)
    handler.end_headers = lambda: None
    with patch('server.log_event') as log:
        getattr(handler, method)()
    return statuses[0], headers, handler.wfile.getvalue().decode(), log.call_args is not None

favicon = request('/favicon.ico', 'do_GET')
logged = request('/api/sync/log', 'do_POST', json.dumps({'message': 'fixture'}).encode())
print(json.dumps({'favicon': favicon, 'logged': logged}))
`;
const handlerResult = spawnSync('python', ['-c', handlerScript], { encoding: 'utf-8' });
eq(
  handlerResult.status,
  0,
  `HTTP handler dispatches (${handlerResult.stderr || 'no Python errors'})`,
);
if (handlerResult.status === 0) {
  const { favicon, logged } = JSON.parse(handlerResult.stdout);
  eq(favicon[0], 200, 'Favicon GET succeeds');
  eq(favicon[1]['Content-Type'], 'image/svg+xml', 'Favicon serves SVG');
  assert(favicon[2].includes('<svg'), 'Favicon body contains SVG markup');
  eq(logged[0], 200, 'Log POST succeeds');
  eq(JSON.parse(logged[2]), { ok: true }, 'Log POST acknowledges the message');
  assert(logged[3], 'Log POST records the submitted message');
}

// --- Test 7: Player Data Age Evaluation ---
const ageCheckResult = spawnSync(
  'python',
  [
    '-c',
    'from server import get_player_data_age; age, d = get_player_data_age(); assert age is not None; print(f"{age},{d}")',
  ],
  { encoding: 'utf-8' },
);
eq(ageCheckResult.status, 0, 'get_player_data_age runs without error');
assert(/\b\d{4}-\d{2}-\d{2}\b/.test(ageCheckResult.stdout), 'get_player_data_age returns a date');

const success = finishSuite('Server Startup & 1-Click Launchers');
if (!success) {
  process.exit(1);
}
