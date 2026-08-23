// Reusable testing utilities and assertion helpers for FantasyDrafter.

export let failureCount = 0;

export function resetFailures() {
  failureCount = 0;
}

export function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failureCount++;
    console.error(`  ❌ FAIL: ${label}\n     Expected: ${e}\n     Received: ${a}`);
  } else {
    console.log(`  ✅ ok: ${label}`);
  }
}

export function assert(condition, label) {
  if (!condition) {
    failureCount++;
    console.error(`  ❌ FAIL: ${label}`);
  } else {
    console.log(`  ✅ ok: ${label}`);
  }
}

export function assertThrows(fn, label) {
  try {
    fn();
    failureCount++;
    console.error(`  ❌ FAIL: ${label} (expected function to throw, but it succeeded)`);
  } catch (err) {
    console.log(`  ✅ ok: ${label} (threw error as expected)`);
  }
}

export function printSuiteHeader(suiteName) {
  console.log(`\n--- Test Suite: ${suiteName} ---`);
}

export function finishSuite(suiteName) {
  if (failureCount > 0) {
    console.error(`\n❌ ${suiteName}: ${failureCount} test(s) failed`);
    return false;
  } else {
    console.log(`\n🎉 ${suiteName}: All tests passed`);
    return true;
  }
}

