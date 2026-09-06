// Test suite for Unlisted Picks, Custom Positions, and Team Roster Statistics
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Unlisted Picks & Custom Player Resolution');

// 1. Resolving standard listed players
const mockPlayers = [
  { id: 0, name: 'Josh Allen', pos: 'QB', bye: 7 },
  { id: 1, name: 'Bijan Robinson', pos: 'RB', bye: 11 }
];

const listedPick = { overall: 1, playerId: 0, mine: true };
const resolvedListed = L.resolvePickPlayer(listedPick, mockPlayers);
eq(resolvedListed.name, 'Josh Allen', 'Resolves listed player name');
eq(resolvedListed.pos, 'QB', 'Resolves listed player position');
eq(resolvedListed.bye, 7, 'Resolves listed player bye');
eq(resolvedListed.isUnlisted, undefined, 'Listed player is not marked unlisted');

// 2. Resolving unlisted player with custom name & position
const customPick = {
  overall: 2,
  playerId: null,
  customName: 'Ray-Ray McCloud',
  customPos: 'WR',
  customBye: 9,
  mine: false
};
const resolvedCustom = L.resolvePickPlayer(customPick, mockPlayers);
eq(resolvedCustom.name, 'Ray-Ray McCloud', 'Resolves custom name for unlisted pick');
eq(resolvedCustom.pos, 'WR', 'Resolves custom position for unlisted pick');
eq(resolvedCustom.bye, 9, 'Resolves custom bye for unlisted pick');
eq(resolvedCustom.isUnlisted, true, 'Unlisted pick has isUnlisted=true');

// 3. Resolving unlisted player with default generated name
const fallbackPick = {
  overall: 3,
  playerId: null,
  customPos: 'TE',
  mine: false
};
const resolvedFallback = L.resolvePickPlayer(fallbackPick, mockPlayers);
eq(resolvedFallback.name, 'Unlisted TE', 'Generates clean fallback name based on position');
eq(resolvedFallback.pos, 'TE', 'Preserves position on fallback');

// 4. Roster counting simulation with mixed listed and unlisted picks
const draftLog = [
  { overall: 1, playerId: 0, mine: true },                                    // Slot 1 (Josh Allen, QB)
  { overall: 2, playerId: 1, mine: false },                                   // Slot 2 (Bijan Robinson, RB)
  { overall: 3, playerId: null, customName: 'Carnell Tate', customPos: 'WR' }, // Slot 3 (Unlisted WR)
  { overall: 4, playerId: null, customPos: 'QB' },                            // Slot 4 (Unlisted QB)
  { overall: 5, playerId: null, customPos: 'TE' },                            // Slot 5 (Unlisted TE)
];

// Verify slot assignments and team pick counts in a 10-team league
// Verify team field is resolved
eq(resolvedListed.team, '—', 'Listed player has fallback team if not present');
eq(resolvedCustom.team, '—', 'Custom player without team gets fallback');

const customPickWithTeam = { overall: 6, playerId: null, customName: 'Tyler Warren', customPos: 'TE', customTeam: 'IND' };
const resolvedWithTeam = L.resolvePickPlayer(customPickWithTeam, mockPlayers);
eq(resolvedWithTeam.team, 'IND', 'Custom player resolves specified NFL team');

// 5. formatPickForClipboard tests
const mockSettings = {
  teams: 12,
  mode: 'snake',
  slot: 4,
  teamNames: ['Tyheem', 'Cody', 'Kenny', 'Doug', 'Team 5', 'Team 6', 'Team 7', 'Team 8', 'Team 9', 'Team 10', 'Team 11', 'Team 12']
};

const mockPlayerPool = {
  10: { name: 'James Cook III', pos: 'RB', team: 'BUF' },
  20: { name: 'Brock Bowers', pos: 'TE', team: 'LV' },
  30: { name: 'Jahmyr Gibbs', pos: 'RB', team: 'DET' }
};

// Test A: Normal pick (own team) - verify no (You) and no check box
const normalPick = { overall: 4, playerId: 10, mine: true };
const normalPickStr = L.formatPickForClipboard(normalPick, mockSettings, {}, mockPlayerPool);
eq(normalPickStr, '#4 (1.04) Doug: James Cook III (RB · BUF)', 'Formats standard pick for clipboard');
assert(!normalPickStr.includes('(You)'), 'Omits (You) from clipboard string');
assert(!normalPickStr.includes('✅'), 'Omits check mark from clipboard string');
assert(!normalPickStr.includes('checkbox'), 'Omits check box indicator from clipboard string');

// Test B: Keeper pick - verify keeper attribution preserved, but no (You) and no check box
const keeperPick = { overall: 93, playerId: 20, isKeeper: true, mine: true };
const keeperPickStr = L.formatPickForClipboard(keeperPick, mockSettings, {}, mockPlayerPool);
eq(keeperPickStr, '#93 (8.09) Doug: Brock Bowers (TE · LV) [Keeper]', 'Formats keeper pick with [Keeper] attribution');
assert(!keeperPickStr.includes('(You)'), 'Keeper pick omits (You)');
assert(!keeperPickStr.includes('✅'), 'Keeper pick omits check mark');
assert(keeperPickStr.includes('[Keeper]'), 'Keeper pick preserves [Keeper] tag');

// Test C: Other team pick
const otherTeamPick = { overall: 1, playerId: 30, mine: false };
const otherTeamPickStr = L.formatPickForClipboard(otherTeamPick, mockSettings, {}, mockPlayerPool);
eq(otherTeamPickStr, '#1 (1.01) Tyheem: Jahmyr Gibbs (RB · DET)', 'Formats other team pick');

// Test D: Unlisted custom pick
const unlistedPick = { overall: 3, playerId: null, customName: 'Carnell Tate', customPos: 'WR', customTeam: 'OSU', mine: false };
const unlistedPickStr = L.formatPickForClipboard(unlistedPick, mockSettings, {}, mockPlayerPool);
eq(unlistedPickStr, '#3 (1.03) Kenny: Carnell Tate (WR · OSU)', 'Formats unlisted custom pick');

// Test E: Traded pick ownership
const tradedPick = { overall: 25, playerId: 10, mine: false };
const tradedPickStr = L.formatPickForClipboard(tradedPick, mockSettings, { 25: 2 }, mockPlayerPool);
eq(tradedPickStr, '#25 (3.01) Cody: James Cook III (RB · BUF)', 'Resolves traded pick recipient team name');

// Test F: Null / empty edge cases
eq(L.formatPickForClipboard(null), '', 'formatPickForClipboard on null returns empty string');
eq(L.formatPickForClipboard({}), '', 'formatPickForClipboard on empty object returns clean string');

// 6. copyLastDraftPick integration and keyboard shortcut test
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const draftUiCode = fs.readFileSync(path.join(__dirname, '../js/draft-ui.js'), 'utf8');
const appJsCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

let copiedClipboardText = null;

const mockWindow = {
  getSelection: () => ({ toString: () => '' }),
  navigator: {
    clipboard: {
      writeText: async (t) => { copiedClipboardText = t; }
    }
  },
  state: {
    settings: mockSettings,
    tradedPicks: {},
    log: [
      { overall: 1, playerId: 30, mine: false },
      { overall: 4, playerId: 10, mine: true }
    ]
  },
  byId: (id) => mockPlayerPool[id] || null,
  $: (id) => ({
    id: id,
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    style: {},
    addEventListener: () => {}
  }),
  document: {
    activeElement: { tagName: 'BODY' },
    createElement: () => ({ style: {}, appendChild: () => {}, removeChild: () => {} }),
    getElementById: (id) => null,
    body: { appendChild: () => {}, removeChild: () => {} }
  },
  formatPickForClipboard: L.formatPickForClipboard
};

const uiContext = vm.createContext(Object.assign({}, L, mockWindow, {
  window: mockWindow,
  globalThis: mockWindow,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  byId: (id) => mockPlayerPool[id] || null
}));

vm.runInContext(draftUiCode, uiContext);

assert(typeof mockWindow.copyLastDraftPick === 'function', 'draft-ui.js exports copyLastDraftPick');

// Test copying last pick
copiedClipboardText = null;
const resCopied = mockWindow.copyLastDraftPick();
eq(resCopied, '#4 (1.04) Doug: James Cook III (RB · BUF)', 'copyLastDraftPick returns formatted last pick');
eq(copiedClipboardText, '#4 (1.04) Doug: James Cook III (RB · BUF)', 'Puts last pick onto clipboard');

// Test copying when log is empty
mockWindow.state.log = [];
const emptyCopied = mockWindow.copyLastDraftPick();
eq(emptyCopied, null, 'copyLastDraftPick on empty log returns null');

// Test keyboard shortcut simulation (app.js keydown listener)
let defaultPrevented = false;
let keydownListener = null;

const mockDoc = {
  activeElement: { tagName: 'BODY' },
  addEventListener: (evt, handler) => {
    if (evt === 'keydown') keydownListener = handler;
  }
};

const appContext = vm.createContext(Object.assign({}, mockWindow, {
  window: mockWindow,
  document: mockDoc,
  copyLastDraftPick: () => {
    copiedClipboardText = '#4 (1.04) Doug: James Cook III (RB · BUF)';
    return copiedClipboardText;
  },
  undo: () => {},
  resetDraft: () => {},
  openUnlistedPickModal: () => {},
  jumpTo: () => {},
  selectRosterSlot: () => {},
  save: () => {},
  renderPool: () => {},
  closeModal: () => {},
  openDraftBoardModal: () => {},
  openLeagueSetup: () => {},
  closePlayerModal: () => {},
  $: () => null,
  on: () => {},
  initBroadcastSync: () => {},
  renderTabs: () => {},
  render: () => {}
}));

vm.runInContext(appJsCode, appContext);

assert(typeof keydownListener === 'function', 'app.js registered keydown listener');

// Simulation 1: Ctrl+C with nothing selected -> triggers copyLastDraftPick and prevents default
copiedClipboardText = null;
defaultPrevented = false;
mockWindow.getSelection = () => ({ toString: () => '' });
mockDoc.activeElement = { tagName: 'BODY' };

keydownListener({
  key: 'c',
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  preventDefault: () => { defaultPrevented = true; }
});

eq(copiedClipboardText, '#4 (1.04) Doug: James Cook III (RB · BUF)', 'Ctrl+C with nothing selected copies last draft pick');
assert(defaultPrevented, 'Ctrl+C with nothing selected prevents default');

// Simulation 2: Ctrl+C with text selected -> allows native browser copy without preventDefault
copiedClipboardText = null;
defaultPrevented = false;
mockWindow.getSelection = () => ({ toString: () => 'James Cook' });

keydownListener({
  key: 'c',
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  preventDefault: () => { defaultPrevented = true; }
});

eq(copiedClipboardText, null, 'Ctrl+C with text selected does NOT hijack clipboard');
assert(!defaultPrevented, 'Ctrl+C with text selected does NOT prevent default');

const success = finishSuite('Unlisted Picks & Custom Player Resolution');
if (!success) {
  process.exit(1);
}

