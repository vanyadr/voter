import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateCode,
  hashCode,
  signSession,
  verifySession,
  SESSION_SECONDS,
} from "../src/lib/crypto";
import { validScores, weightedScore } from "../src/lib/model";

const secret = "a".repeat(64);
test("code formatting does not affect authentication", () => {
  assert.equal(
    hashCode("abcd-ef01-2345-6789", secret),
    hashCode(" ABCD EF01 2345 6789 ", secret),
  );
  assert.match(generateCode(), /^[A-F0-9]{4}(-[A-F0-9]{4}){3}$/);
  assert.notEqual(generateCode(), generateCode());
});
test("sessions reject tampering, wrong keys and expiry", () => {
  const actor = { memberId: "11111111-1111-4111-8111-111111111111" };
  const session = signSession(actor, secret, 1000);
  assert.deepEqual(verifySession(session, secret, 2000), actor);
  assert.equal(verifySession(session + "x", secret, 2000), null);
  assert.equal(verifySession(session, "wrong", 2000), null);
  assert.equal(
    verifySession(session, secret, 1000 + SESSION_SECONDS * 1000),
    null,
  );
  assert.equal(verifySession("malformed", secret), null);
  assert.deepEqual(
    verifySession(signSession({ bootstrap: true }, secret), secret),
    { bootstrap: true },
  );
});
test("criteria weights and validation match championship rules", () => {
  assert.equal(weightedScore([5, 5, 5, 5, 5, 5]), 60);
  assert.equal(weightedScore([1, 1, 1, 1, 1, 1]), 12);
  assert.equal(weightedScore([2, 2, 3, 3, 4, 4]), 32);
  for (const invalid of [
    [],
    new Array(6),
    [1, 2, 3],
    [1, 2, 3, 4, 5, 0],
    [1, 2, 3, 4, 5, 6],
    [1, 2, 3, 4, 5, 1.5],
    [1, 2, 3, 4, 5, "5"],
    null,
  ])
    assert.equal(validScores(invalid), false);
});
