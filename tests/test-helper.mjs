import { inspect, isDeepStrictEqual } from 'node:util';

// Reusable testing utilities and assertion helpers for FantasyDrafter.

export let failureCount = 0;

export function resetFailures() {
  failureCount = 0;
}
// VM-backed browser tests produce cross-realm objects with different prototypes.
// Normalize cloneable values without losing undefined, NaN, Map, or Set semantics.
function comparable(value) {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

export function eq(actual, expected, label) {
  if (!isDeepStrictEqual(comparable(actual), comparable(expected))) {
    failureCount++;
    console.error(
      `  FAIL: ${label}\n     Expected: ${inspect(expected, { depth: 4 })}\n     Received: ${inspect(actual, { depth: 4 })}`,
    );
  } else if (process.env.TEST_VERBOSE === '1') {
    console.log(`  ok: ${label}`);
  }
}

export function assert(condition, label) {
  if (!condition) {
    failureCount++;
    console.error(`  FAIL: ${label}`);
  } else if (process.env.TEST_VERBOSE === '1') {
    console.log(`  ok: ${label}`);
  }
}

export function assertThrows(fn, label) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, `${label} (expected function to throw)`);
}

export function printSuiteHeader(suiteName) {
  console.log(`\n--- Test Suite: ${suiteName} ---`);
}

export function finishSuite(suiteName) {
  if (failureCount > 0) {
    console.error(`\n${suiteName}: ${failureCount} test(s) failed`);
    return false;
  }
  console.log(`${suiteName}: All tests passed`);
  return true;
}
