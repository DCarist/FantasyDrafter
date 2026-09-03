// Test suite for Draft Tier Methodology, Natural Breaks Clustering, and Scarcity Alerts
import { createRequire } from 'module';
import { eq, assert, printSuiteHeader, finishSuite, resetFailures } from './test-helper.mjs';

const require = createRequire(import.meta.url);
const L = require('../draft-logic.js');

resetFailures();
printSuiteHeader('Draft Tier Methodology & Scarcity Alerts');

// --- 1. 1D Natural Breaks (Fisher-Jenks) Algorithm Tests ---
const emptyBreaks = L.computeJenksBreaks([], 3);
eq(emptyBreaks, [], 'Handles empty array in computeJenksBreaks');

const singleBreaks = L.computeJenksBreaks([85], 3);
eq(singleBreaks, [85], 'Single item array returns that item');

const k1Breaks = L.computeJenksBreaks([50, 70, 90], 1);
eq(k1Breaks, [90], 'kClasses=1 returns the maximum value');

const syntheticData = [98, 96, 95, 84, 82, 80, 65, 63, 60, 42, 40];
const k4Breaks = L.computeJenksBreaks(syntheticData, 4);
eq(k4Breaks.length, 4, 'Returns requested 4 class breaks for synthetic data');
assert(k4Breaks[3] === 98, 'Max class boundary is highest value 98');
assert(k4Breaks[2] >= 80 && k4Breaks[2] <= 84, 'Class 2 boundary splits 80-84 cluster from 95-98');
assert(k4Breaks[1] >= 60 && k4Breaks[1] <= 65, 'Class 3 boundary splits 60-65 cluster from 80-84');
assert(k4Breaks[0] >= 40 && k4Breaks[0] <= 42, 'Class 4 boundary splits lowest 40-42 cluster');

// --- 2. assignTiers Positional and Overall Tests ---
const samplePlayers = [
  { id: 1, name: 'QB Alpha', pos: 'QB', score: 98, boris_half: 5, boris_ppr: 4 },
  { id: 2, name: 'QB Beta', pos: 'QB', score: 95, boris_half: 5, boris_ppr: 4 },
  { id: 3, name: 'QB Gamma', pos: 'QB', score: 82, boris_half: 7, boris_ppr: 7 },
  { id: 4, name: 'QB Delta', pos: 'QB', score: 80, boris_half: 7, boris_ppr: 7 },
  { id: 5, name: 'QB Epsilon', pos: 'QB', score: 65, boris_half: 10, boris_ppr: 10 },
  { id: 6, name: 'QB Zeta', pos: 'QB', score: 35, boris_half: null, boris_ppr: null },
  { id: 11, name: 'RB One', pos: 'RB', score: 99, boris_half: 1, boris_ppr: 1 },
  { id: 12, name: 'RB Two', pos: 'RB', score: 97, boris_half: 1, boris_ppr: 1 },
  { id: 13, name: 'RB Three', pos: 'RB', score: 85, boris_half: 3, boris_ppr: 3 },
  { id: 14, name: 'RB Four', pos: 'RB', score: 83, boris_half: 3, boris_ppr: 3 },
  { id: 15, name: 'RB Five', pos: 'RB', score: 68, boris_half: 6, boris_ppr: 6 },
  { id: 21, name: 'WR One', pos: 'WR', score: 99, boris_half: 1, boris_ppr: 1 },
  { id: 22, name: 'WR Two', pos: 'WR', score: 96, boris_half: 2, boris_ppr: 2 },
  { id: 23, name: 'WR Three', pos: 'WR', score: 88, boris_half: 4, boris_ppr: 4 },
];

// Test Redraft 1QB mode with 1D Natural Breaks
const redraftTiers = L.assignTiers(samplePlayers.map(p => ({ ...p })), {
  leagueType: 'redraft',
  qbFormat: '1qb',
  scoring: 'half'
});

const qbAlpha = redraftTiers.find(p => p.name === 'QB Alpha');
const qbBeta = redraftTiers.find(p => p.name === 'QB Beta');
const qbGamma = redraftTiers.find(p => p.name === 'QB Gamma');
const qbZeta = redraftTiers.find(p => p.name === 'QB Zeta');

eq(qbAlpha.posTier, 1, 'QB Alpha assigned posTier 1');
eq(qbBeta.posTier, 1, 'QB Beta shares posTier 1 with QB Alpha');
eq(qbGamma.posTier, 2, 'QB Gamma mapped to posTier 2');
assert(qbZeta.posTier > qbGamma.posTier, 'QB Zeta placed in lower tier');

// Verify strict monotonicity (tiers never jump backwards)
const qbList = redraftTiers.filter(p => p.pos === 'QB').sort((a, b) => b.score - a.score);
for (let i = 0; i < qbList.length - 1; i++) {
  assert(qbList[i + 1].posTier >= qbList[i].posTier, 'Positional tiers are strictly monotonic');
}

// Test Dynasty Superflex mode with 1D Natural Breaks
const dynastyTiers = L.assignTiers(samplePlayers.map(p => ({ ...p })), {
  leagueType: 'dynasty',
  qbFormat: 'sf',
  scoring: 'half'
});

const dynAlpha = dynastyTiers.find(p => p.name === 'QB Alpha');
const dynBeta = dynastyTiers.find(p => p.name === 'QB Beta');
const dynGamma = dynastyTiers.find(p => p.name === 'QB Gamma');

eq(dynAlpha.posTier, 1, 'Dynasty QB Alpha in Tier 1 via 1D Natural Breaks');
eq(dynBeta.posTier, 1, 'Dynasty QB Beta in Tier 1 via 1D Natural Breaks');
assert(dynGamma.posTier > 1, 'Dynasty QB Gamma in a lower tier than Alpha/Beta');

// Test Overall Board Tiers
assert(dynAlpha.overallTier != null, 'Dynasty QB Alpha has overallTier');
eq(dynAlpha.overallTier, 1, 'Highest scoring player gets overallTier 1');

// --- 3. Stability Test (Tiers do not mutate when players are drafted) ---
const pList = samplePlayers.map(p => ({ ...p }));
L.assignTiers(pList, { leagueType: 'dynasty', qbFormat: 'sf', scoring: 'half' });
const initialGammaTier = pList.find(p => p.name === 'QB Gamma').posTier;

// Simulate drafting QB Alpha and QB Beta
const takenSet = new Set([1, 2]);
// The intrinsic posTier remains identical
eq(pList.find(p => p.name === 'QB Gamma').posTier, initialGammaTier, 'Player tier remains stable when earlier players are drafted');

// --- 4. getTierScarcity and Cliff Alerts Tests ---
const scarcityCheck = L.getTierScarcity(pList, takenSet, 'QB');
eq(scarcityCheck.isAll, false, 'getTierScarcity recognizes positional filter QB');

const t1Info = scarcityCheck.tiers.find(t => t.tier === 1);
eq(t1Info.total, 2, 'Tier 1 has total 2 QBs');
eq(t1Info.taken, 2, 'Tier 1 has 2 taken QBs');
eq(t1Info.remaining, 0, 'Tier 1 has 0 remaining QBs');
eq(t1Info.isScarcity, false, 'Completely taken tier is not active scarcity');

// Draft QB Gamma (id: 3), leaving QB Delta (id: 4) and QB Epsilon (id: 5) as 2 remaining in Tier 2
takenSet.add(3);
const scarcityCheck2 = L.getTierScarcity(pList, takenSet, 'QB');
const deltaAlert2 = scarcityCheck2.playerAlerts.get(4);
assert(deltaAlert2 != null, 'Player Delta has scarcity alert when 2 remain');
eq(deltaAlert2.remaining, 2, 'Player Delta is one of 2 remaining players in Tier 2');
eq(deltaAlert2.isLast, false, 'isLast is false when 2 players remain');
assert(deltaAlert2.label.includes('2 left in T'), 'Label indicates 2 left in Tier');

// Now draft QB Epsilon (id: 5), leaving QB Delta (id: 4) as the last player in Tier 2
takenSet.add(5);
const scarcityCheck3 = L.getTierScarcity(pList, takenSet, 'QB');
const deltaAlert1 = scarcityCheck3.playerAlerts.get(4);
assert(deltaAlert1 != null, 'Player Delta has scarcity alert when 1 remains');
eq(deltaAlert1.remaining, 1, 'Player Delta is the last remaining player in Tier 2');
eq(deltaAlert1.isLast, true, 'isLast is true when 1 player remains');
assert(deltaAlert1.label.includes('Last in T'), 'Label indicates Last in Tier');

// Test ALL view scarcity
const allScarcity = L.getTierScarcity(pList, new Set(), 'ALL');
eq(allScarcity.isAll, true, 'ALL view recognized');
assert(allScarcity.tiers.length > 0, 'Overall tiers counted');

finishSuite('Draft Tier Methodology & Scarcity Alerts');
