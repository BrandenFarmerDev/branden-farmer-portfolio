import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { assertCleanSarif } from "./source-scan.mjs";

const report = (results = [], successful = true) => ({ version: "2.1.0", runs: [{ results, invocations: [{ executionSuccessful: successful }] }] });
test("source gate rejects every finding, incomplete analysis and malformed reports", () => {
  assert.doesNotThrow(() => assertCleanSarif(report()));
  assert.throws(() => assertCleanSarif(report([{ level: "note" }])), /unresolved/);
  assert.throws(() => assertCleanSarif(report([], false)), /incomplete/);
  for (const invalid of [{}, { version: "2.1.0", runs: [] }, { version: "2.1.0", runs: [{}] }]) {
    assert.throws(() => assertCleanSarif(invalid));
  }
});
test("a missing source scanner fails closed", () => {
  const result = spawnSync(process.execPath, ["scripts/source-scan.mjs"], {
    env: { ...process.env, CODEQL_BINARY: "missing-portfolio-codeql-executable" }, encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot execute CodeQL/);
});
