// Test suite for Data Pipeline & Ingestion
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

resetFailures();
printSuiteHeader('Data Pipeline & Ingestion');

// --- Test 1: CLI Help & Argument Parsing ---
const updateScript = join('scripts', 'update_rankings.py');
const helpResult = spawnSync('python', [updateScript, '--help'], { encoding: 'utf-8' });
eq(helpResult.status, 0, 'scripts/update_rankings.py --help exits with code 0');
assert(helpResult.stdout.includes('--ecr-source'), 'CLI supports --ecr-source');
assert(helpResult.stdout.includes('--values-source'), 'CLI supports --values-source');
assert(helpResult.stdout.includes('--sheet-source'), 'CLI supports --sheet-source');
assert(helpResult.stdout.includes('--dry-run'), 'CLI supports --dry-run');
assert(helpResult.stdout.includes('--out-js'), 'CLI supports --out-js');

// --- Test 2: Local Fixture Ingestion (Offline Testing) ---
const testFixtureDir = join('tests', 'fixtures');
if (!existsSync(testFixtureDir)) {
  mkdirSync(testFixtureDir, { recursive: true });
}

const mockEcrCsv = `player,pos,team,bye,page_type,ecr
"Justin Jefferson","WR","MIN",6,"dynasty-overall",1.0
"Justin Jefferson","WR","MIN",6,"dynasty-op",4.0
"Justin Jefferson","WR","MIN",6,"redraft-overall",3.0
"Josh Allen","QB","BUF",12,"dynasty-op",1.0
"Josh Allen","QB","BUF",12,"dynasty-overall",14.0
"Bijan Robinson","RB","ATL",12,"dynasty-op",3.0
`;

const mockValuesCsv = `player,age,draft_year,ecr_1qb,ecr_2qb
"Justin Jefferson",27.1,2020,1.0,4.0
"Josh Allen",29.3,2018,14.0,1.0
"Bijan Robinson",24.6,2023,2.0,3.0
`;

const mockSheetCsv = `Col0,Col1,Col2,Col3,Col4,Col5,Col6,Col7,Col8,Col9,Col10,Col11,Col12,Col13,Col14,Col15,Col16,Col17,Col18
Header1,Header2,Header3,Header4,Header5,Header6,Header7,Header8,Header9,Header10,Header11,Header12,Header13,Header14,Header15,Header16,Header17,Header18,Header19
Justin Jefferson,Justin Jefferson,,Justin Jefferson,WR,MIN,,1.0,1.0,2.0,1.0,1.5,1.0,VET,2.0,4.0,3.0,3.0,3.5
Josh Allen,Josh Allen,,Josh Allen,QB,BUF,,12.0,10.0,14.0,12.0,13.0,14.0,VET,10.0,1.0,1.0,1.0,1.0
Bijan Robinson,Bijan Robinson,,Bijan Robinson,RB,ATL,,4.0,3.0,3.0,3.0,3.0,2.0,VET,3.0,3.0,4.0,4.0,4.0
`;

const ecrPath = join(testFixtureDir, 'mock_ecr.csv');
const valPath = join(testFixtureDir, 'mock_values.csv');
const sheetPath = join(testFixtureDir, 'mock_sheet.csv');
const outJsPath = join(testFixtureDir, 'mock_players.js');
const outJsonPath = join(testFixtureDir, 'mock_players.json');

writeFileSync(ecrPath, mockEcrCsv, 'utf-8');
writeFileSync(valPath, mockValuesCsv, 'utf-8');
writeFileSync(sheetPath, mockSheetCsv, 'utf-8');

const runResult = spawnSync('python', [
  updateScript,
  '--ecr-source', ecrPath,
  '--values-source', valPath,
  '--sheet-source', sheetPath,
  '--out-js', outJsPath,
  '--out-json', outJsonPath
], { encoding: 'utf-8' });

eq(runResult.status, 0, 'Local fixture update completes successfully');
assert(runResult.stdout.includes('Total active players merged: 3'), 'Correctly merges 3 fixture players');

assert(existsSync(outJsPath), 'Generated mock_players.js exists');
assert(existsSync(outJsonPath), 'Generated mock_players.json exists');

const generatedJson = JSON.parse(readFileSync(outJsonPath, 'utf-8'));
eq(generatedJson.players.length, 3, 'Payload contains exactly 3 players');

const jjeff = generatedJson.players.find(p => p.name === 'Justin Jefferson');
assert(jjeff !== undefined, 'Justin Jefferson is present in output');
eq(jjeff.pos, 'WR', 'Justin Jefferson pos is WR');
eq(jjeff.team, 'MIN', 'Justin Jefferson team is MIN');
eq(jjeff.bye, 6, 'Justin Jefferson bye is 6');
eq(jjeff.dyn1QB, 1.0, 'Justin Jefferson dyn1QB is 1.0');
eq(jjeff.dynSF, 4.0, 'Justin Jefferson dynSF is 4.0');
eq(jjeff.age, 27.1, 'Justin Jefferson age is 27.1');

// Clean up mock files
try {
  unlinkSync(ecrPath);
  unlinkSync(valPath);
  unlinkSync(sheetPath);
  unlinkSync(outJsPath);
  unlinkSync(outJsonPath);
} catch (e) { }

const success = finishSuite('Data Pipeline & Ingestion');
if (!success) {
  process.exit(1);
}

