// Test suite validating player data integrity, schemas, byes, and positions
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { assert, eq, finishSuite, printSuiteHeader, resetFailures } from './test-helper.mjs';

resetFailures();
printSuiteHeader('Data Pipeline & Schema Integrity');

const playersJsPath = existsSync('data/players-data.js')
  ? 'data/players-data.js'
  : 'players-data.js';
assert(existsSync(playersJsPath), 'players-data.js exists');

const browser = { window: {} };
runInNewContext(readFileSync(playersJsPath, 'utf-8'), browser, { filename: playersJsPath });
const data = browser.window.DRAFT_DATA;

assert(Array.isArray(data.players), 'data.players is an array');
assert(/^\d{4}-\d{2}-\d{2}$/.test(data.generated), 'data.generated is an ISO date');
assert(
  data.byes && !Array.isArray(data.byes) && typeof data.byes === 'object',
  'data.byes map is present',
);
eq(Object.keys(data.byes).length, 32, '32 NFL teams in bye map');
eq(
  Object.entries(data.byes)
    .filter(([, week]) => !Number.isInteger(week) || week < 4 || week > 18)
    .slice(0, 3),
  [],
  'Every NFL team has a valid bye week',
);

// Aggregate invalid records instead of logging once per player in the full dataset.
const validPosSet = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);
const invalidNames = [];
const invalidPositions = [];
const invalidTeams = [];
const invalidByes = [];
const invalidRookies = [];
const invalidRankings = [];
for (const [index, player] of data.players.entries()) {
  const id = `${index}: ${player.name}`;
  if (typeof player.name !== 'string' || !player.name.trim()) invalidNames.push(id);
  if (!validPosSet.has(player.pos)) invalidPositions.push(id);
  if (
    player.team !== null &&
    player.team !== 'FA' &&
    (typeof player.team !== 'string' || !Object.hasOwn(data.byes, player.team))
  ) {
    invalidTeams.push(id);
  }
  if (player.bye !== null && (!Number.isInteger(player.bye) || player.bye < 4 || player.bye > 18)) {
    invalidByes.push(id);
  }
  if (typeof player.rookie !== 'boolean') invalidRookies.push(id);
  const rankings = [player.dynSF, player.dyn1QB, player.redraft, player.adp];
  if (
    !rankings.some((rank) => Number.isFinite(rank) && rank > 0) ||
    rankings.some((rank) => rank != null && (!Number.isFinite(rank) || rank <= 0))
  ) {
    invalidRankings.push(id);
  }
}
eq(
  invalidNames.slice(0, 3),
  [],
  `All ${data.players.length} players have nonempty names (${invalidNames.length} invalid)`,
);
eq(
  invalidPositions.slice(0, 3),
  [],
  `All players have standard fantasy positions (${invalidPositions.length} invalid)`,
);
eq(
  invalidTeams.slice(0, 3),
  [],
  `Player teams are NFL teams, free agents, or unassigned (${invalidTeams.length} invalid)`,
);
eq(
  invalidByes.slice(0, 3),
  [],
  `Player byes are valid weeks or unknown (${invalidByes.length} invalid)`,
);
eq(
  invalidRookies.slice(0, 3),
  [],
  `All players have a boolean rookie flag (${invalidRookies.length} invalid)`,
);
eq(
  invalidRankings.slice(0, 3),
  [],
  `All players have a finite positive ranking metric (${invalidRankings.length} invalid)`,
);

// --- Validate Defense (DST) Harmonization (Exactly 32 unique teams, no duplicates) ---
const dstPlayers = data.players.filter((p) => p.pos === 'DST');
eq(
  dstPlayers.length,
  32,
  `Exactly 32 unique NFL defenses in player pool (found ${dstPlayers.length})`,
);

const dstTeams = new Set(dstPlayers.map((p) => p.team));
eq(dstTeams.size, 32, 'All 32 NFL teams have exactly one defense entry');

// Verify Jaguars specifically
const jaxDsts = dstPlayers.filter((p) => p.team === 'JAX');
eq(jaxDsts.length, 1, 'Only one Jacksonville Jaguars D/ST entry exists');
eq(jaxDsts[0].name, 'Jacksonville Jaguars', 'JAX D/ST has canonical name Jacksonville Jaguars');
assert(
  data.players.every((p) => p.name !== 'Jaguars D/ST'),
  'No raw "Jaguars D/ST" duplicate exists in player pool',
);

// Verify draft-logic resolver
const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

eq(
  L.resolveDstCanonical('Jaguars D/ST'),
  { name: 'Jacksonville Jaguars', team: 'JAX', pos: 'DST' },
  'Resolves Jaguars D/ST to canonical JAX',
);
eq(
  L.resolveDstCanonical('Jacksonville Jaguars'),
  { name: 'Jacksonville Jaguars', team: 'JAX', pos: 'DST' },
  'Resolves Jacksonville Jaguars to canonical JAX',
);
eq(
  L.resolveDstCanonical('49ers D/ST'),
  { name: 'San Francisco 49ers', team: 'SF', pos: 'DST' },
  'Resolves 49ers D/ST to SF',
);
eq(
  L.resolveDstCanonical('Patriots D/ST'),
  { name: 'New England Patriots', team: 'NE', pos: 'DST' },
  'Resolves Patriots D/ST to NE',
);
eq(
  L.resolveDstCanonical('JAX'),
  { name: 'Jacksonville Jaguars', team: 'JAX', pos: 'DST' },
  'Resolves team code JAX to JAX D/ST',
);

const success = finishSuite('Data Pipeline & Schema Integrity');
if (!success) {
  process.exit(1);
}
