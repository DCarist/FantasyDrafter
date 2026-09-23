// Player pool alignment, rank display, market edge, and persisted filters.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { assert, eq, finishSuite, printSuiteHeader, resetFailures } from './test-helper.mjs';

resetFailures();
printSuiteHeader('Player Pool Table Alignment & Filter Persistence');

// The actual header and rendered rows must agree, including the empty state.
const page = readFileSync('draft-board.html', 'utf8');
const header = page.match(/<thead>\s*<tr>([\s\S]*?)<\/tr>\s*<\/thead>/)?.[1];
assert(header, 'Player pool presents a table header');
const headerLabels = [...header.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].trim());
eq(
  headerLabels,
  ['#', 'Player', 'Pos', 'Tier', 'Team', 'Bye', 'Dyn SF', 'Redraft', 'Edge', 'Score', ''],
  'Columns identify player details, ranks, edge, score and action in display order',
);

const elements = new Map();
function element(id) {
  if (!elements.has(id))
    elements.set(id, {
      value: '',
      checked: false,
      textContent: '',
      innerHTML: '',
      style: {},
      listeners: new Map(),
      addEventListener(event, fn) {
        this.listeners.set(event, fn);
      },
    });
  return elements.get(id);
}
const sandbox = {
  document: { readyState: 'loading', getElementById: element, addEventListener: () => {} },
  state: {
    settings: {
      leagueType: 'dynasty',
      qbFormat: 'sf',
      scoring: 'half',
      blend: 60,
      teams: 12,
      slot: 1,
      mode: 'snake',
      teamNames: ['Mine', ...Array.from({ length: 11 }, (_, i) => `Team ${i + 2}`)],
    },
    log: [{ overall: 1, playerId: 3 }],
    keepers: [],
    watchlist: [],
    tradedPicks: {},
  },
  getDynastyRank: (p) => p.activeDyn,
  getRedraftRank: (p) => p.activeRed,
  getProspectRank: () => null,
  computeFormatScore: (p) => p.score,
  ui: {
    search: '',
    posFilter: 'ALL',
    sort: 'score',
    tierFilter: null,
    hideTaken: false,
    hideOutIR: false,
  },
  takenMap: () => new Map([[3, 'other']]),
  normalizeName: (name) => String(name).toLowerCase(),
  resolveDstCanonical: () => null,
  isWatched: () => false,
  currentPick: () => 1,
  teamForOverall: () => ({ isMe: true, name: 'Mine' }),
  fmtPick: () => '1.01',
  getMyRosterPlayers: () => [],
  undo: () => {},
  resetDraft: () => {},
  openUnlistedPickModal: () => {},
  openLeagueSetup: () => {},
  byId: () => null,
  getByeClashStatus: () => ({ type: null }),
  getTeamName: () => 'Mine',
  save: () => {
    sandbox.saved = JSON.stringify(sandbox.state.settings);
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const players = [
  {
    id: 1,
    name: 'Market Steal',
    pos: 'QB',
    team: 'HOU',
    bye: 14,
    posTier: 1,
    overallTier: 1,
    activeDyn: 4,
    activeRed: 42,
    espn_ppr: 65,
    espn_std: 60,
    score: 90,
  },
  {
    id: 2,
    name: 'Overdraft Risk',
    pos: 'RB',
    team: 'NYJ',
    bye: 12,
    posTier: 2,
    overallTier: 2,
    activeDyn: 8,
    activeRed: 86,
    espn_ppr: 4,
    espn_std: 70,
    score: 80,
    injury: { code: 'IR', status: 'Injured' },
  },
  {
    id: 3,
    name: 'Market Neutral',
    pos: 'WR',
    team: 'MIN',
    bye: 6,
    posTier: 2,
    overallTier: 2,
    activeDyn: 50,
    activeRed: 50,
    espn_ppr: 50,
    espn_std: 50,
    score: 70,
  },
];
sandbox.PLAYERS = players;
vm.createContext(sandbox);
vm.runInContext(readFileSync('js/draft-ui.js', 'utf8'), sandbox);

function renderedRows() {
  return [...element('pool').innerHTML.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]),
  );
}
function rowFor(name) {
  return renderedRows().find((cells) => cells[1]?.includes(name));
}

sandbox.renderPool();
for (const row of renderedRows())
  eq(row.length, headerLabels.length, 'Rendered player row aligns with table headers');
const dynasty = rowFor('Market Steal');
assert(
  dynasty?.[1].includes('Market Steal') &&
    dynasty[2].includes('QB') &&
    dynasty[4].includes('HOU') &&
    dynasty[5].includes('14'),
  'Player metadata is in its labeled columns',
);
eq(element('th_rank1').textContent, 'Dyn SF', 'Dynasty superflex presents dynasty rank first');
eq(
  element('th_rank2').textContent,
  'Red (SF Half)',
  'Dynasty superflex presents redraft rank second',
);
eq(dynasty[6], '4', 'Dynasty rank is displayed in first rank column');
eq(dynasty[7], '42', 'Redraft rank is displayed in second rank column');
assert(
  dynasty[8].includes('+61') && dynasty[8].includes('Market Steal'),
  'Positive market edge compares ESPN to dynasty consensus and explains opportunity',
);
assert(
  rowFor('Overdraft Risk')?.[8].includes('Overdraft Risk'),
  'Negative edge warns about overdraft risk',
);
assert(
  rowFor('Market Neutral')?.[8].includes('Market Neutral'),
  'Matching rankings explain neutral market edge',
);

sandbox.state.settings = {
  ...sandbox.state.settings,
  leagueType: 'redraft',
  qbFormat: '1qb',
  scoring: 'std',
};
sandbox.renderPool();
eq(element('th_rank1').textContent, 'Red (STD)', 'Redraft standard league labels consensus rank');
eq(element('th_rank2').textContent, 'ESPN (STD)', 'Redraft standard league labels ESPN rank');
eq(rowFor('Market Steal')[6], '42', 'Redraft consensus rank is first');
eq(rowFor('Market Steal')[7], '60', 'Standard scoring uses ESPN standard rank');
assert(
  rowFor('Market Steal')[8].includes('+18'),
  'Market edge reflects redraft consensus and standard ESPN rank',
);
assert(
  rowFor('Overdraft Risk')[8].includes('-16'),
  'Negative market edge is rendered with its magnitude',
);
assert(rowFor('Market Neutral')[8].includes('0'), 'Neutral market edge is rendered as zero');

sandbox.state.settings.qbFormat = 'sf';
sandbox.state.settings.scoring = 'ppr';
sandbox.renderPool();
eq(
  element('th_rank1').textContent,
  'Red (SF PPR)',
  'Superflex PPR rank header changes with format',
);
eq(element('th_rank2').textContent, 'ESPN (PPR)', 'PPR header names the relevant ESPN rank');
eq(rowFor('Market Steal')[7], '65', 'PPR uses ESPN PPR rank');

sandbox.ui.search = 'nobody matches';
sandbox.renderPool();
assert(
  element('pool').innerHTML.includes(`colspan="${headerLabels.length}"`) &&
    element('pool').innerHTML.includes('No players match'),
  'Empty results span every visible column and explain the filter',
);
sandbox.ui.search = '';

// Event handlers and reloaded state, rather than state-source spelling, establish filter persistence.
vm.runInContext(readFileSync('js/app.js', 'utf8'), sandbox);
sandbox.bindSettings();
element('hidetaken').checked = true;
element('hidetaken').listeners.get('change')();
assert(
  sandbox.state.settings.hideTaken && sandbox.ui.hideTaken && !rowFor('Market Neutral'),
  'Hide-taken control persists its choice and hides drafted players',
);
element('hideoutir').checked = true;
element('hideoutir').listeners.get('change')();
assert(
  sandbox.state.settings.hideOutIR && sandbox.ui.hideOutIR && !rowFor('Overdraft Risk'),
  'Out/IR control persists its choice and hides unavailable players',
);
const stored = new Map([
  [
    'fantasy_drafter_leagues_manifest',
    JSON.stringify({
      activeLeagueId: 'league_filters',
      leagues: [{ id: 'league_filters', name: 'League' }],
    }),
  ],
  [
    'fantasy_drafter_league_league_filters',
    JSON.stringify({ settings: JSON.parse(sandbox.saved), log: [], keepers: [] }),
  ],
]);
const reloaded = {
  localStorage: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key),
  },
  document: { getElementById: () => null },
  PLAYERS: [],
};
reloaded.window = reloaded;
reloaded.globalThis = reloaded;
vm.createContext(reloaded);
vm.runInContext(readFileSync('js/draft-state.js', 'utf8'), reloaded);
assert(
  reloaded.state.settings.hideTaken &&
    reloaded.state.settings.hideOutIR &&
    reloaded.ui.hideTaken &&
    reloaded.ui.hideOutIR,
  'Saved filters survive draft-state reload',
);

finishSuite('Player Pool Table Alignment & Filter Persistence');
