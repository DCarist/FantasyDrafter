// Test Suite: Scripts Syntax & Browser Loading Integrity
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { assert, finishSuite, printSuiteHeader, resetFailures } from './test-helper.mjs';

printSuiteHeader('Scripts Syntax & Browser Startup Integrity');
resetFailures();

const scriptsToVerify = [
  'draft-logic.js',
  existsSync('data/players-data.js') ? 'data/players-data.js' : 'players-data.js',
  'js/draft-audio.js',
  'js/draft-state.js',
  'js/draft-sync-client.js',
  'js/draft-ui.js',
  'js/app.js',
];

// 1. Verify all script files parse cleanly with no SyntaxErrors
for (const scriptPath of scriptsToVerify) {
  const fullPath = resolve(scriptPath);
  if (!existsSync(fullPath)) {
    console.warn(`Skipping missing script: ${scriptPath}`);
    continue;
  }
  const code = readFileSync(fullPath, 'utf8');
  let syntaxOk = false;
  try {
    new vm.Script(code, { filename: scriptPath });
    syntaxOk = true;
  } catch (err) {
    console.error(`Syntax error in ${scriptPath}:`, err);
  }
  assert(syntaxOk, `${scriptPath} compiles cleanly without syntax errors`);
}

// 2. Simulate browser startup sequence and verify lifecycle initApp()
const mockWindow = {
  addEventListener: () => {},
  removeEventListener: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  setTimeout: (fn) => {
    fn();
    return 1;
  },
  clearTimeout: () => {},
  console: console,
  location: { origin: 'http://localhost:8517' },
  document: {
    getElementById: (id) => {
      // Mock minimal DOM elements for initApp
      return {
        id,
        value: '',
        checked: false,
        textContent: '',
        innerHTML: '',
        style: {},
        classList: {
          contains: () => false,
          add: () => {},
          remove: () => {},
        },
        addEventListener: () => {},
      };
    },
    addEventListener: () => {},
    title: '',
  },
  localStorage: {
    _data: {},
    getItem(k) {
      return this._data[k] || null;
    },
    setItem(k, v) {
      this._data[k] = String(v);
    },
    removeItem(k) {
      delete this._data[k];
    },
  },
};
mockWindow.window = mockWindow;
mockWindow.globalThis = mockWindow;

const vmContext = vm.createContext(mockWindow);

let evalSuccess = true;
try {
  for (const scriptPath of scriptsToVerify) {
    const fullPath = resolve(scriptPath);
    if (!existsSync(fullPath)) continue;
    const code = readFileSync(fullPath, 'utf8');
    vm.runInContext(code, vmContext, { filename: scriptPath });
  }
} catch (err) {
  console.error('Runtime error during script evaluation:', err);
  evalSuccess = false;
}

assert(evalSuccess, 'All browser scripts evaluate sequentially without runtime errors');
assert(
  typeof mockWindow.state === 'object' && mockWindow.state !== null,
  'mockWindow.state is initialized',
);
assert(typeof mockWindow.openLeagueSetup === 'function', 'mockWindow.openLeagueSetup is defined');
assert(typeof mockWindow.render === 'function', 'mockWindow.render is defined');
assert(typeof mockWindow.initApp === 'function', 'mockWindow.initApp is defined');

let initRanCleanly = true;
try {
  mockWindow.initApp();
} catch (err) {
  console.error('Error in initApp():', err);
  initRanCleanly = false;
}
assert(initRanCleanly, 'mockWindow.initApp() executes to completion without throwing');

finishSuite('Scripts Syntax & Browser Startup Integrity');
