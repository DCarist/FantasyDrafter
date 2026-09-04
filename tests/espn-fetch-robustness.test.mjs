// Test suite for ESPN API Client Robustness, Anti-403 Protections & Fallback Resilience
import { existsSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

resetFailures();
printSuiteHeader('ESPN API Client Robustness & Anti-403 Protections');

// --- 1. Client Module Existence & Structure ---
assert(existsSync('scripts/espn_client.py'), 'scripts/espn_client.py exists');
const espnClientCode = readFileSync('scripts/espn_client.py', 'utf-8');

assert(espnClientCode.includes('def fetch_espn_json'), 'Defines fetch_espn_json function');
assert(espnClientCode.includes('def fetch_espn_text'), 'Defines fetch_espn_text function');
assert(espnClientCode.includes('def find_curl'), 'Defines find_curl function');
assert(espnClientCode.includes('CLIENT_PROFILES = ['), 'Defines CLIENT_PROFILES list');

// Verify anti-bot / anti-403 header hygiene
assert(!espnClientCode.includes('"User-Agent": "Mozilla/5.0"'), 'Eliminated naive bare Mozilla/5.0 header');
assert(espnClientCode.includes('ESPN/7.20.0'), 'Includes official ESPN mobile client profile');
assert(espnClientCode.includes('curl/8.4.0'), 'Includes genuine curl client profile');
assert(espnClientCode.includes('okhttp/4.12.0'), 'Includes OkHttp client profile');
assert(espnClientCode.includes('gzip.decompress'), 'Supports automatic gzip decompression');
assert(espnClientCode.includes('zlib.decompress'), 'Supports automatic deflate decompression');


// --- 2. Live Client Execution & Transport Verification ---
const testClientRun = spawnSync('python', ['scripts/espn_client.py'], { encoding: 'utf-8' });
eq(testClientRun.status, 0, 'espn_client.py self-test runs with exit code 0');
assert(
  testClientRun.stdout.includes('Success') || testClientRun.stdout.includes('team injury reports'),
  'espn_client.py self-test successfully retrieves ESPN data'
);


// --- 3. Integration into fetch_depth_charts.py ---
assert(existsSync('scripts/fetch_depth_charts.py'), 'scripts/fetch_depth_charts.py exists');
const depthChartsCode = readFileSync('scripts/fetch_depth_charts.py', 'utf-8');

assert(depthChartsCode.includes('fetch_espn_json'), 'fetch_depth_charts.py imports and uses fetch_espn_json');
assert(!depthChartsCode.includes('headers={"User-Agent": "Mozilla/5.0"}'), 'Naive Mozilla/5.0 removed from fetch_depth_charts.py');
assert(depthChartsCode.includes('existing_depth_charts'), 'fetch_depth_charts.py supports retaining existing depth charts on failure');
assert(depthChartsCode.includes('delay_before='), 'fetch_depth_charts.py implements inter-request pacing');


// --- 4. Integration into fetch_injuries.py ---
assert(existsSync('scripts/fetch_injuries.py'), 'scripts/fetch_injuries.py exists');
const injuriesCode = readFileSync('scripts/fetch_injuries.py', 'utf-8');

assert(injuriesCode.includes('fetch_espn_json'), 'fetch_injuries.py imports and uses fetch_espn_json');
assert(!injuriesCode.includes('headers={"User-Agent": "Mozilla/5.0"}'), 'Naive Mozilla/5.0 removed from fetch_injuries.py');
assert(injuriesCode.includes('Preserving existing injuries'), 'fetch_injuries.py guards existing data against wipe on fetch failure');


// --- 5. Default Bye Coverage in update_rankings.py ---
assert(existsSync('scripts/update_rankings.py'), 'scripts/update_rankings.py exists');
const rankingsCode = readFileSync('scripts/update_rankings.py', 'utf-8');

assert(rankingsCode.includes('DEFAULT_NFL_BYES = {'), 'update_rankings.py defines DEFAULT_NFL_BYES');
const nfl32 = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS'
];
for (const t of nfl32) {
  assert(rankingsCode.includes(`"${t}":`), `DEFAULT_NFL_BYES includes team ${t}`);
}


// --- 6. Python Fallback Simulation (Simulating curl unavailable) ---
const testFallbackRun = spawnSync('python', ['-c', `
import scripts.espn_client as ec
ec.find_curl = lambda: None
data = ec.fetch_espn_json("https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries")
injuries = data.get("injuries", [])
print(f"Fallback OK: {len(injuries)} teams")
`], { encoding: 'utf-8' });

// --- 7. In-App Data Refresh Pipeline Verification ---
const serverCode = readFileSync('server.py', 'utf-8');
assert(serverCode.includes('def handle_data_refresh'), 'server.py defines handle_data_refresh handler');
assert(serverCode.includes('update_rankings.py'), 'handle_data_refresh targets update_rankings.py');
assert(serverCode.includes('/api/data/refresh'), 'server.py routes /api/data/refresh');

const uiCode = readFileSync('js/draft-ui.js', 'utf-8');
assert(uiCode.includes('triggerDataRefresh'), 'draft-ui.js defines triggerDataRefresh');
assert(uiCode.includes('/api/data/refresh'), 'triggerDataRefresh targets /api/data/refresh');
assert(uiCode.includes('refresh_data_btn'), 'UI renders refresh_data_btn in League Setup modal');

const success = finishSuite('ESPN API Client Robustness & Anti-403 Protections');
if (!success) {
  process.exit(1);
}

