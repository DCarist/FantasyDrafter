// Guard the assertion primitives used by every feature suite against false positives.
import { strict as nodeAssert } from 'node:assert';
import {
  assert,
  assertThrows,
  eq,
  failureCount,
  finishSuite,
  resetFailures,
} from './test-helper.mjs';

const errors = [];
const originalError = console.error;
console.error = (message) => errors.push(message);
try {
  resetFailures();
  eq({ a: 1, b: 2 }, { b: 2, a: 1 }, 'object key insertion order is irrelevant');
  eq({ a: undefined }, {}, 'missing and undefined properties differ');
  eq(NaN, null, 'NaN differs from null');
  assert(false, 'false condition fails');
  assertThrows(() => {}, 'non-throwing function fails');
  nodeAssert.equal(failureCount, 4);
  nodeAssert.equal(finishSuite('intentional failures'), false);
  nodeAssert.equal(errors.length, 5);

  resetFailures();
  eq(new Set([1, 2]), new Set([2, 1]), 'sets compare by value');
  assertThrows(() => {
    throw new Error('expected');
  }, 'throwing function passes');
  nodeAssert.equal(failureCount, 0);
  nodeAssert.equal(finishSuite('valid assertions'), true);
} finally {
  console.error = originalError;
  resetFailures();
}
