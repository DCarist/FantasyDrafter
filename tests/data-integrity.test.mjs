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
const validPosSet = new Set(['QB', 'RB', 'WR', 'TE']);

for (const p of data.players) {
  assert(p.name && typeof p.name === 'string', `Player has valid name: ${p.name}`);
  if (validPosSet.has(p.pos)) {
    validPositions++;
  }
  if (p.dynSF != null || p.redraft != null || p.adp != null) {
    validRanks++;
  }
}

eq(validPositions, data.players.length, 'All players have standard offensive fantasy positions (QB/RB/WR/TE)');
eq(validRanks, data.players.length, 'All players have at least one valid ranking metric');

const success = finishSuite('Data Pipeline & Schema Integrity');
if (!success) {
  process.exit(1);
}
