// Test Suite: League Setup Modal & Button Click Integrity Fix
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { assert, finishSuite, printSuiteHeader, resetFailures } from './test-helper.mjs';

printSuiteHeader('League Setup Modal & Button Click Integrity Fix');
resetFailures();

// 1. Simulate a clean browser window and load scripts in page order.
const mockElements = new Map();
function getOrCreateElement(id) {
  if (!mockElements.has(id)) {
    const classes = new Set();
    mockElements.set(id, {
      id,
      value: id === 'setup_team_count' ? '12' : id === 'setup_rounds_count' ? '25' : '',
      checked: false,
      textContent: '',
      innerHTML: '',
      style: {},
      classList: {
        contains: (c) => classes.has(c),
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
      },
      addEventListener: () => {},
    });
  }
  return mockElements.get(id);
}

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
    getElementById: (id) => getOrCreateElement(id),
    querySelectorAll: () => [],
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

const scriptsToLoad = [
  'draft-logic.js',
  existsSync('data/players-data.js') ? 'data/players-data.js' : 'players-data.js',
  'js/draft-audio.js',
  'js/draft-state.js',
  'js/draft-sync-client.js',
  'js/draft-ui.js',
  'js/roster-manager-state.js',
  'js/roster-manager-ui.js',
  'js/app.js',
];

let scriptsLoadedOk = true;
try {
  for (const s of scriptsToLoad) {
    const fullPath = resolve(s);
    if (!existsSync(fullPath)) continue;
    const code = readFileSync(fullPath, 'utf8');
    vm.runInContext(code, vmContext, { filename: s });
  }
} catch (err) {
  console.error('Error evaluating scripts:', err);
  scriptsLoadedOk = false;
}
assert(scriptsLoadedOk, 'All browser scripts evaluate cleanly in sequential order');

// 2. Initialize application
let appInitOk = true;
try {
  mockWindow.initApp();
} catch (err) {
  console.error('Error during initApp():', err);
  appInitOk = false;
}
assert(appInitOk, 'initApp() completes successfully');

// 3. Verify openLeagueSetup() executes without RangeError: Maximum call stack size exceeded
let setupOpenedOk = false;
let setupError = null;
try {
  mockWindow.openLeagueSetup();
  setupOpenedOk = true;
} catch (err) {
  setupError = err;
}
assert(setupOpenedOk, 'openLeagueSetup() executes without throwing call-stack recursion or errors');
if (setupError) {
  console.error('setupError:', setupError);
}

const overlayEl = getOrCreateElement('overlay');
assert(overlayEl.classList.contains('show'), 'openLeagueSetup() shows #overlay modal');
const modalBoxEl = getOrCreateElement('modalbox');
assert(
  modalBoxEl.innerHTML.includes('⚙️ League Setup &amp; Draft Positions') ||
    modalBoxEl.innerHTML.includes('⚙️ League Setup & Draft Positions'),
  'modalbox contains League Setup title',
);
assert(
  modalBoxEl.innerHTML.includes('setup_platform_select'),
  'modalbox contains In-Season Platform selector',
);

// Click the handler emitted in the actual in-season view, rather than inventing a snippet.
mockWindow.inSeasonState.activeLeagueId = 'click-target';
mockWindow.inSeasonState.leagues = [
  {
    id: 'click-target',
    name: 'Click Test League',
    platform: 'espn',
    season: '2026',
    team_count: 10,
  },
];
mockWindow.inSeasonState.currentView = 'team';
mockWindow.inSeasonState.rosterData = null;
mockWindow.renderManagerView();
const managerHtml = getOrCreateElement('manager_views_container').innerHTML;
const setupButtons = [
  ...managerHtml.matchAll(/<button\b[^>]*onclick="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g),
].filter(([, , text]) => text.includes('League Setup'));
assert(setupButtons.length === 1, 'Active league displays one setup button');
try {
  vm.runInContext(setupButtons[0][1], vmContext);
  assert(
    getOrCreateElement('overlay').classList.contains('show'),
    'Clicking active league setup opens the modal',
  );
  assert(
    mockWindow.state.settings.inSeasonLeagueId === 'click-target',
    'Clicking active league setup links the selected league',
  );
  assert(
    mockWindow.state.settings.platform === 'espn',
    'Clicking active league setup loads its platform',
  );
} catch (err) {
  console.error('Rendered league setup click failed:', err);
  assert(false, 'Rendered league setup button executes without a browser ReferenceError');
}

finishSuite('League Setup Modal & Button Click Integrity Fix');
