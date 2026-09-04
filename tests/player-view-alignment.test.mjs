// Test suite for Player Pool Table View Alignment & Filter Persistence
import { readFileSync, existsSync } from 'fs';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

resetFailures();
printSuiteHeader('Player Pool Table Alignment & Filter Persistence');

// --- 1. draft-board.html Thead Structure & Column Count ---
assert(existsSync('draft-board.html'), 'draft-board.html exists');
const html = readFileSync('draft-board.html', 'utf-8');

const theadMatch = html.match(/<thead>\s*<tr>([\s\S]*?)<\/tr>\s*<\/thead>/);
assert(theadMatch, 'draft-board.html contains <thead><tr> block');

const thMatches = [...theadMatch[1].matchAll(/<th([^>]*)>([\s\S]*?)<\/th>/g)];
eq(thMatches.length, 11, 'Table thead contains exactly 11 column headers');

const thTexts = thMatches.map(m => m[2].trim());
const thAttrs = thMatches.map(m => m[1]);

// Validate individual header text & semantic roles
eq(thTexts[0], '#', 'Header 1 is # rank/priority');
eq(thTexts[1], 'Player', 'Header 2 is Player name');
eq(thTexts[2], 'Pos', 'Header 3 is Position');
eq(thTexts[3], 'Tier', 'Header 4 is Tier');
eq(thTexts[4], 'Team', 'Header 5 is NFL Team');
eq(thTexts[5], 'Bye', 'Header 6 is Bye week');
assert(thAttrs[6].includes('id="th_rank1"'), 'Header 7 has id="th_rank1"');
assert(thAttrs[7].includes('id="th_rank2"'), 'Header 8 has id="th_rank2"');
eq(thTexts[8], 'Edge', 'Header 9 is Edge (Market Arbitrage)');
eq(thTexts[9], 'Score', 'Header 10 is Draft Score');

// Validate explicit IDs
assert(thAttrs[0].includes('id="th_rk"'), 'Header 1 has id="th_rk"');
assert(thAttrs[1].includes('id="th_name"'), 'Header 2 has id="th_name"');
assert(thAttrs[2].includes('id="th_pos"'), 'Header 3 has id="th_pos"');
assert(thAttrs[3].includes('id="th_tier"'), 'Header 4 has id="th_tier"');
assert(thAttrs[4].includes('id="th_team"'), 'Header 5 has id="th_team"');
assert(thAttrs[5].includes('id="th_bye"'), 'Header 6 has id="th_bye"');
assert(thAttrs[8].includes('id="th_edge"'), 'Header 9 has id="th_edge"');
assert(thAttrs[8].includes('Market Arbitrage Edge'), 'Header 9 has informative title tooltip');

// --- 2. draft-ui.js Row Construction & 11 Cell Count ---
assert(existsSync('js/draft-ui.js'), 'js/draft-ui.js exists');
const draftUiCode = readFileSync('js/draft-ui.js', 'utf-8');

// Ensure row template string builds exactly 11 <td> cells
const rowHtmlBlock = draftUiCode.match(/html \+= '<tr' \+ dragAttrs \+ '>'([\s\S]*?)<\/tr>';/);
assert(rowHtmlBlock, 'draft-ui.js defines row template block');

const staticTdMatches = (rowHtmlBlock[1].match(/<td/g) || []).length;
eq(staticTdMatches, 7, 'Template string directly contains 7 static <td> elements (plus rankCell, byeCell, edgeCell, actionCell = 11 total)');

assert(rowHtmlBlock[1].includes('rankCell'), 'Row includes rankCell (#1)');
assert(rowHtmlBlock[1].includes('clickname'), 'Row includes clickname / Player (#2)');
assert(rowHtmlBlock[1].includes('posClass'), 'Row includes posClass pill (#3)');
assert(rowHtmlBlock[1].includes('formatTierPill'), 'Row includes formatTierPill (#4)');
assert(rowHtmlBlock[1].includes('p.team'), 'Row includes team (#5)');
assert(rowHtmlBlock[1].includes('byeCell'), 'Row includes byeCell (#6)');
assert(rowHtmlBlock[1].includes('rank1Val'), 'Row includes dynamic rank1Val (#7)');
assert(rowHtmlBlock[1].includes('rank2Val'), 'Row includes dynamic rank2Val (#8)');
assert(rowHtmlBlock[1].includes('edgeCell'), 'Row includes dynamic edgeCell (#9)');
assert(rowHtmlBlock[1].includes('p.score'), 'Row includes score (#10)');
assert(rowHtmlBlock[1].includes('actionCell'), 'Row includes actionCell (#11)');

// Check empty message colspan matches 11
assert(draftUiCode.includes('colspan="11"'), 'Empty pool message spans all 11 columns');

// --- 3. Dynamic League-Type Header & Rank Selection Logic ---
function simulateHeaders(settings) {
  const isRedraft = (settings.leagueType === 'redraft');
  const scTag = settings.scoring === 'ppr' ? 'PPR' : (settings.scoring === 'std' ? 'STD' : 'Half');
  const redLabel = 'Red (' + (settings.qbFormat === '1qb' ? scTag : 'SF ' + scTag) + ')';

  let rank1Title = '', rank2Title = '';
  if (isRedraft) {
    rank1Title = redLabel;
    rank2Title = 'ESPN (' + (settings.scoring === 'std' ? 'STD' : 'PPR') + ')';
  } else {
    rank1Title = (settings.qbFormat === '1qb') ? 'Dyn 1QB' : 'Dyn SF';
    rank2Title = redLabel;
  }
  return { rank1Title, rank2Title };
}

function simulateRowRanks(player, settings) {
  const isRedraft = (settings.leagueType === 'redraft');
  let rank1Val, rank2Val;
  if (isRedraft) {
    rank1Val = (player.activeRed ?? '—');
    const espnRank = (settings.scoring === 'std' ? (player.espn_std ?? player.espn_ppr) : (player.espn_ppr ?? player.espn_std)) ?? player.yahoo ?? null;
    rank2Val = espnRank != null ? espnRank : '—';
  } else {
    rank1Val = (player.activeDyn ?? '—');
    rank2Val = (player.activeRed ?? '—');
  }
  return { rank1Val, rank2Val };
}

// Dynasty Superflex
const dynSfHeaders = simulateHeaders({ leagueType: 'dynasty', qbFormat: 'sf', scoring: 'half' });
eq(dynSfHeaders.rank1Title, 'Dyn SF', 'Dynasty SF header 1 is Dyn SF');
eq(dynSfHeaders.rank2Title, 'Red (SF Half)', 'Dynasty SF header 2 is Red (SF Half)');

// Dynasty 1QB
const dyn1qbHeaders = simulateHeaders({ leagueType: 'dynasty', qbFormat: '1qb', scoring: 'ppr' });
eq(dyn1qbHeaders.rank1Title, 'Dyn 1QB', 'Dynasty 1QB header 1 is Dyn 1QB');
eq(dyn1qbHeaders.rank2Title, 'Red (PPR)', 'Dynasty 1QB header 2 is Red (PPR)');

// Redraft 1QB STD
const red1qbStdHeaders = simulateHeaders({ leagueType: 'redraft', qbFormat: '1qb', scoring: 'std' });
eq(red1qbStdHeaders.rank1Title, 'Red (STD)', 'Redraft STD header 1 is Red (STD)');
eq(red1qbStdHeaders.rank2Title, 'ESPN (STD)', 'Redraft STD header 2 is ESPN (STD)');

// Redraft SF PPR
const redSfPprHeaders = simulateHeaders({ leagueType: 'redraft', qbFormat: 'sf', scoring: 'ppr' });
eq(redSfPprHeaders.rank1Title, 'Red (SF PPR)', 'Redraft SF PPR header 1 is Red (SF PPR)');
eq(redSfPprHeaders.rank2Title, 'ESPN (PPR)', 'Redraft SF PPR header 2 is ESPN (PPR)');

// Test row values
const samplePlayer = {
  activeDyn: 4,
  activeRed: 12,
  espn_ppr: 15,
  espn_std: 18,
  yahoo: 14
};

const dynRowRanks = simulateRowRanks(samplePlayer, { leagueType: 'dynasty', scoring: 'half' });
eq(dynRowRanks.rank1Val, 4, 'Dynasty row rank1 is activeDyn');
eq(dynRowRanks.rank2Val, 12, 'Dynasty row rank2 is activeRed');

const redRowRanksPpr = simulateRowRanks(samplePlayer, { leagueType: 'redraft', scoring: 'ppr' });
eq(redRowRanksPpr.rank1Val, 12, 'Redraft row rank1 is activeRed');
eq(redRowRanksPpr.rank2Val, 15, 'Redraft row rank2 is espn_ppr');

const redRowRanksStd = simulateRowRanks(samplePlayer, { leagueType: 'redraft', scoring: 'std' });
eq(redRowRanksStd.rank1Val, 12, 'Redraft row rank1 is activeRed');
eq(redRowRanksStd.rank2Val, 18, 'Redraft row rank2 is espn_std');

// --- 4. CSS Compact Widths & Styling ---
// --- 4. Market Arbitrage Edge Calculation & Hover Tooltips ---
assert(draftUiCode.includes('getPlayerEdge'), 'draft-ui.js defines getPlayerEdge function');

function simulatePlayerEdge(p, settings) {
  const isRedraft = (settings && settings.leagueType === 'redraft');
  const consensus = isRedraft ? p.activeRed : (p.activeDyn ?? p.activeRed);
  const espnRank = (settings && settings.scoring === 'std' ? (p.espn_std ?? p.espn_ppr) : (p.espn_ppr ?? p.espn_std)) ?? p.yahoo ?? null;
  if (consensus == null || espnRank == null) return null;
  const edge = Math.round(espnRank - consensus);
  let tip;
  if (edge > 0) {
    tip = 'Market Steal: ESPN ranks at #' + Math.round(espnRank) + ' vs Consensus #' + Math.round(consensus) + ' (+' + edge + ' edge).\nOpponents following ESPN\'s queue will let this player slide!';
  } else if (edge < 0) {
    tip = 'Overdraft Risk: ESPN ranks at #' + Math.round(espnRank) + ' vs Consensus #' + Math.round(consensus) + ' (' + edge + ' reach).\nOpponents following ESPN\'s queue may draft this player early.';
  } else {
    tip = 'Market Neutral: ESPN rank (#' + Math.round(espnRank) + ') matches Consensus (#' + Math.round(consensus) + ').';
  }
  return { edge, tip };
}

// Positive edge (Steal): Consensus #42, ESPN #65 -> +23
const stealPlayer = { activeRed: 42, espn_ppr: 65 };
const stealRes = simulatePlayerEdge(stealPlayer, { leagueType: 'redraft', scoring: 'ppr' });
eq(stealRes.edge, 23, 'Calculates positive steal edge of +23');
assert(stealRes.tip.includes('Market Steal: ESPN ranks at #65 vs Consensus #42 (+23 edge)'), 'Steal tooltip explains positive edge');
assert(stealRes.tip.includes('let this player slide'), 'Steal tooltip gives actionable guidance');

// Negative edge (Overdraft Risk): Consensus #86, ESPN #66 -> -20
const reachPlayer = { activeRed: 86, espn_ppr: 66 };
const reachRes = simulatePlayerEdge(reachPlayer, { leagueType: 'redraft', scoring: 'ppr' });
eq(reachRes.edge, -20, 'Calculates negative reach edge of -20');
assert(reachRes.tip.includes('Overdraft Risk: ESPN ranks at #66 vs Consensus #86 (-20 reach)'), 'Reach tooltip explains overdraft risk');
assert(reachRes.tip.includes('draft this player early'), 'Reach tooltip gives actionable warning');

// Neutral edge: Consensus #50, ESPN #50 -> 0
const neutralPlayer = { activeRed: 50, espn_ppr: 50 };
const neutralRes = simulatePlayerEdge(neutralPlayer, { leagueType: 'redraft', scoring: 'ppr' });
eq(neutralRes.edge, 0, 'Calculates neutral edge of 0');
assert(neutralRes.tip.includes('Market Neutral'), 'Neutral tooltip indicates matching ranks');

// --- 5. CSS Compact Widths & Styling ---
assert(existsSync('css/draft-board.css'), 'css/draft-board.css exists');
const css = readFileSync('css/draft-board.css', 'utf-8');

assert(css.includes('th#th_rk'), 'CSS defines th#th_rk styling');
assert(css.includes('td.rk:first-child'), 'CSS constrains td.rk:first-child width');
assert(css.includes('.col-center'), 'CSS defines .col-center alignment');
assert(css.includes('.clickname'), 'CSS defines .clickname styling');
assert(css.includes('.edge-pos'), 'CSS defines .edge-pos styling');
assert(css.includes('.edge-neg'), 'CSS defines .edge-neg styling');
assert(css.includes('.edge-zero'), 'CSS defines .edge-zero styling');
assert(css.includes('cursor: help'), 'CSS adds cursor: help for edge tooltips');

// --- 6. State Persistence for hideTaken & hideOutIR ---
assert(existsSync('js/draft-state.js'), 'js/draft-state.js exists');
const stateCode = readFileSync('js/draft-state.js', 'utf-8');

assert(stateCode.includes('hideTaken: false'), 'draft-state.js defines hideTaken in DEFAULTS');
assert(stateCode.includes('hideOutIR: false'), 'draft-state.js defines hideOutIR in DEFAULTS');
assert(stateCode.includes('s.settings.hideTaken = !!s.settings.hideTaken;'), 'normalizeState normalizes hideTaken');
assert(stateCode.includes('s.settings.hideOutIR = !!s.settings.hideOutIR;'), 'normalizeState normalizes hideOutIR');
assert(stateCode.includes('hideTaken: !!(state && state.settings && state.settings.hideTaken)'), 'ui initializes hideTaken from persisted settings');

assert(existsSync('js/app.js'), 'js/app.js exists');
const appCode = readFileSync('js/app.js', 'utf-8');

assert(appCode.includes("$('hidetaken').checked = !!s.hideTaken;"), 'bindHeaderControls restores hidetaken state');
assert(appCode.includes("$('hideoutir').checked = !!s.hideOutIR;"), 'bindHeaderControls restores hideoutir state');
assert(appCode.includes('global.state.settings.hideTaken = val;'), 'hidetaken change event writes to settings');
assert(appCode.includes('global.state.settings.hideOutIR = val;'), 'hideoutir change event writes to settings');

finishSuite('Player Pool Table Alignment & Filter Persistence');
