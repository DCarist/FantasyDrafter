// Test suite validating player data integrity, schemas, byes, and positions
import { readFileSync, existsSync } from 'fs';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

resetFailures();
printSuiteHeader('Data Pipeline & Schema Integrity');

assert(existsSync('players-data.js'), 'players-data.js exists');

const jsContent = readFileSync('players-data.js', 'utf-8');
const eqIdx = jsContent.indexOf('=');
assert(eqIdx !== -1, 'players-data.js contains assignment');
const jsonStr = jsContent.substring(eqIdx + 1).trim().replace(/;$/, '');
const data = JSON.parse(jsonStr);

assert(Array.isArray(data.players), 'data.players is an array');
assert(data.players.length > 0, `data.players has ${data.players.length} players`);
assert(data.generated && typeof data.generated === 'string', `data.generated timestamp is present (${data.generated})`);
assert(data.byes && typeof data.byes === 'object', 'data.byes map is present');
assert(Object.keys(data.byes).length === 32, `32 NFL teams in bye map (found ${Object.keys(data.byes).length})`);

// Validate player structure
let validRanks = 0;
let validPositions = 0;
const validPosSet = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);

for (const p of data.players) {
  assert(p.name && typeof p.name === 'string', `Player has valid name: ${p.name}`);
  if (validPosSet.has(p.pos)) {
    validPositions++;
  }
  if (p.dynSF != null || p.redraft != null || p.adp != null) {
    validRanks++;
  }
}

eq(validPositions, data.players.length, 'All players have standard fantasy positions (QB/RB/WR/TE/K/DST)');
eq(validRanks, data.players.length, 'All players have at least one valid ranking metric');

// --- Validate Defense (DST) Harmonization (Exactly 32 unique teams, no duplicates) ---
const dstPlayers = data.players.filter(p => p.pos === 'DST');
eq(dstPlayers.length, 32, `Exactly 32 unique NFL defenses in player pool (found ${dstPlayers.length})`);

const dstTeams = new Set(dstPlayers.map(p => p.team));
eq(dstTeams.size, 32, 'All 32 NFL teams have exactly one defense entry');

// Verify Jaguars specifically
const jaxDsts = dstPlayers.filter(p => p.team === 'JAX');
eq(jaxDsts.length, 1, 'Only one Jacksonville Jaguars D/ST entry exists');
eq(jaxDsts[0].name, 'Jacksonville Jaguars', 'JAX D/ST has canonical name Jacksonville Jaguars');
assert(data.players.every(p => p.name !== 'Jaguars D/ST'), 'No raw "Jaguars D/ST" duplicate exists in player pool');

// Verify draft-logic resolver
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

eq(L.resolveDstCanonical('Jaguars D/ST'), { name: 'Jacksonville Jaguars', team: 'JAX', pos: 'DST' }, 'Resolves Jaguars D/ST to canonical JAX');
eq(L.resolveDstCanonical('Jacksonville Jaguars'), { name: 'Jacksonville Jaguars', team: 'JAX', pos: 'DST' }, 'Resolves Jacksonville Jaguars to canonical JAX');
eq(L.resolveDstCanonical('49ers D/ST'), { name: 'San Francisco 49ers', team: 'SF', pos: 'DST' }, 'Resolves 49ers D/ST to SF');
eq(L.resolveDstCanonical('Patriots D/ST'), { name: 'New England Patriots', team: 'NE', pos: 'DST' }, 'Resolves Patriots D/ST to NE');
eq(L.resolveDstCanonical('JAX'), { name: 'Jacksonville Jaguars', team: 'JAX', pos: 'DST' }, 'Resolves team code JAX to JAX D/ST');

const success = finishSuite('Data Pipeline & Schema Integrity');
if (!success) {
  process.exit(1);
}
