import assert from "node:assert/strict";
import test from "node:test";
import { validatePushState } from "./pre-push.js";

const head = "a".repeat(40);
const update = (localSha = head) => ({ localRef: "refs/heads/bfarmer/change", localSha, remoteRef: "refs/heads/bfarmer/change", remoteSha: "b".repeat(40) });

test("allows only clean pushes whose refs all point to the tested commit", () => {
  assert.equal(validatePushState([update()], head, true), undefined);
  assert.match(validatePushState([update(), update("c".repeat(40))], head, true), /tested HEAD/);
  assert.match(validatePushState([update()], head, false), /worktree must be clean/);
  assert.match(validatePushState([update("0".repeat(40))], head, true), /Deleting remote refs/);
  assert.match(validatePushState([], head, true), /No refs/);
});
