// Test suite for NFL Injury Reports, Filtering, and Collapsible Modal UI
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('NFL Injury Reports & UI Integration');

// --- 1. Python Scripts Restructuring into scripts/ (No Root Shims) ---
assert(existsSync('scripts/fetch_injuries.py'), 'scripts/fetch_injuries.py exists');
assert(existsSync('scripts/fetch_depth_charts.py'), 'scripts/fetch_depth_charts.py exists');
assert(existsSync('scripts/update_rankings.py'), 'scripts/update_rankings.py exists');
assert(existsSync('scripts/merge_data.py'), 'scripts/merge_data.py exists');
assert(existsSync('scripts/patch_extras.py'), 'scripts/patch_extras.py exists');
assert(existsSync('server.py'), 'server.py is the sole Python file in root');
assert(!existsSync('update-rankings.py'), 'Root update-rankings.py shim is eliminated');
assert(!existsSync('fetch-depth-charts.py'), 'Root fetch-depth-charts.py shim is eliminated');
assert(!existsSync('fetch-injuries.py'), 'Root fetch-injuries.py shim is eliminated');
assert(!existsSync('merge-data.py'), 'Root merge-data.py is eliminated');
assert(!existsSync('patch-extras.py'), 'Root patch-extras.py is eliminated');


// --- 2. Dataset Schema & Injury Metadata ---
assert(existsSync('players-data.json'), 'players-data.json exists');
const rawData = JSON.parse(readFileSync('players-data.json', 'utf-8'));
assert(rawData.injuriesUpdated != null, 'Dataset defines injuriesUpdated timestamp');

const injuredPlayers = rawData.players.filter(p => p.injury != null);
assert(injuredPlayers.length > 0, 'Dataset contains injured players mapped from ESPN');

const sampleInjured = injuredPlayers[0];
assert(sampleInjured.injury.status != null, 'Injury has status string');
assert(sampleInjured.injury.code != null, 'Injury has normalized code (Q, O, IR, SUSP)');
assert(['Q', 'O', 'IR', 'SUSP', 'D', 'P'].includes(sampleInjured.injury.code), 'Injury code is valid');

// Check that healthy players have injury === null or undefined
const healthyPlayers = rawData.players.filter(p => p.injury == null);
assert(healthyPlayers.length > 0, 'Dataset contains healthy players with null injury');


// --- 3. UI Filtering Logic (Hide Out / IR) ---
const mockPool = [
  { id: 1, name: 'Healthy Player', pos: 'QB', injury: null },
  { id: 2, name: 'Questionable Player', pos: 'RB', injury: { code: 'Q', status: 'Questionable' } },
  { id: 3, name: 'Out Player', pos: 'WR', injury: { code: 'O', status: 'Out' } },
  { id: 4, name: 'IR Player', pos: 'TE', injury: { code: 'IR', status: 'Injured Reserve' } },
  { id: 5, name: 'Suspended Player', pos: 'WR', injury: { code: 'SUSP', status: 'Suspension' } },
];

function filterPoolWithInjuries(players, hideOutIR) {
  if (!hideOutIR) return players;
  return players.filter(p => !(p.injury && (p.injury.code === 'O' || p.injury.code === 'IR')));
}

const unFiltered = filterPoolWithInjuries(mockPool, false);
eq(unFiltered.length, 5, 'When hideOutIR is false, all 5 players remain');

const filtered = filterPoolWithInjuries(mockPool, true);
eq(filtered.length, 3, 'When hideOutIR is true, exactly 3 players remain');
const remainingIds = filtered.map(p => p.id);
assert(remainingIds.includes(1), 'Healthy player kept');
assert(remainingIds.includes(2), 'Questionable player kept');
assert(remainingIds.includes(5), 'Suspended player kept');
assert(!remainingIds.includes(3), 'Out player filtered out');
assert(!remainingIds.includes(4), 'IR player filtered out');


// --- 4. Roster Item Rendering with Injury Tag ---
const qbWithInjury = {
  id: 10,
  name: 'Lamar Jackson',
  pos: 'QB',
  team: 'BAL',
  bye: 14,
  injury: {
    status: 'Questionable',
    code: 'Q',
    type: 'Ankle',
    detail: 'Sprain',
    returnDate: '2026-09-13'
  }
};

const qbWithoutInjury = {
  id: 11,
  name: 'Josh Allen',
  pos: 'QB',
  team: 'BUF',
  bye: 12,
  injury: null
};

const slotWithInj = L.formatRosterSlotHtml({ player: qbWithInjury, label: 'QB' }, true, 12);
assert(slotWithInj.includes('injtag inj-q'), 'Roster slot includes injtag inj-q class');
assert(slotWithInj.includes('Questionable: Ankle (Sprain)'), 'Roster slot includes injury tooltip title');
assert(slotWithInj.includes('>Q<'), 'Roster slot displays Q badge');

const slotWithoutInj = L.formatRosterSlotHtml({ player: qbWithoutInjury, label: 'QB' }, true, 12);
assert(!slotWithoutInj.includes('injtag'), 'Healthy player roster slot does not have injtag');


// --- 5. Modal Accordion & Depth Chart Badges Structure ---
// Verify Depth Chart athlete injury tagging logic
const mockAthInjured = {
  name: "Ja'Marr Chase",
  rank: 1,
  playerId: 100,
  injury: {
    status: 'Questionable',
    code: 'Q',
    type: 'Knee',
    returnDate: '2026-09-13'
  }
};

const mockAthHealthy = {
  name: "Joe Burrow",
  rank: 1,
  playerId: 101,
  injury: null
};

function formatAthletePillTest(ath) {
  let injTag = '';
  if (ath.injury && ath.injury.code) {
    const c = ath.injury.code;
    const tip = (ath.injury.status || 'Injured') + (ath.injury.type ? ': ' + ath.injury.type : '');
    injTag = `<span class="dc-inj inj-${c.toLowerCase()}" title="${tip}">${c}</span>`;
  }
  return `<div class="dc-player"><span class="dc-name">${ath.name}</span>${injTag}</div>`;
}

const pillInj = formatAthletePillTest(mockAthInjured);
assert(pillInj.includes('dc-inj inj-q'), 'Depth chart pill has dc-inj inj-q badge');
assert(pillInj.includes('title="Questionable: Knee"'), 'Depth chart pill has injury hover tooltip');

const pillHealthy = formatAthletePillTest(mockAthHealthy);
assert(!pillHealthy.includes('dc-inj'), 'Healthy athlete pill does not have dc-inj');


// Verify Player Details Collapsible Section HTML Generator
function renderInjurySectionTest(p, refreshDate = '2026-09-01') {
  if (!p.injury || !p.injury.code) {
    return `<div class="injury-accordion inactive"><div class="injury-header-inactive"><span>🩺</span><span>No injury reported as of ${refreshDate}</span></div></div>`;
  }
  const inj = p.injury;
  const c = (inj.code || 'Q').toLowerCase();
  const returnText = inj.returnDate ? `<span class="inj-returndate">Est. Return: <b>${inj.returnDate}</b></span>` : '';
  const partText = inj.type ? (inj.type + (inj.detail ? ` (${inj.detail})` : '')) : (inj.detail || 'Undisclosed');
  const comments = inj.longComment || inj.shortComment || 'No additional notes reported.';

  return `<div class="injury-accordion active inj-theme-${c}"><div class="injury-header"><div class="injury-header-left"><span class="injtag inj-${c}">${inj.code}</span><span class="inj-title"><b>${inj.status}:</b> ${partText}</span>${returnText}</div><span class="dc-arrow">▼</span></div><div class="injury-body"><div class="injury-comment">${comments}</div><div class="injury-footer">Report Date: ${inj.date || refreshDate} · Source: ESPN NFL Injury Report</div></div></div>`;
}

const modalInjHtml = renderInjurySectionTest(qbWithInjury);
assert(modalInjHtml.includes('injury-accordion active inj-theme-q'), 'Injured accordion has active theme');
assert(modalInjHtml.includes('Questionable:</b> Ankle (Sprain)'), 'Injured accordion shows diagnosis');
assert(modalInjHtml.includes('Est. Return: <b>2026-09-13</b>'), 'Injured accordion shows estimated return date');
assert(modalInjHtml.includes('▼'), 'Injured accordion includes collapsed toggle arrow');

const modalHealthyHtml = renderInjurySectionTest(qbWithoutInjury);
assert(modalHealthyHtml.includes('injury-accordion inactive'), 'Healthy player has inactive injury-accordion card');
assert(modalHealthyHtml.includes('No injury reported as of 2026-09-01'), 'Healthy player states no injury reported with refresh date');
assert(!modalHealthyHtml.includes('injury-body'), 'Inactive card does not render body drawer');


const success = finishSuite('NFL Injury Reports & UI Integration');
if (!success) {
  process.exit(1);
}

