import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("built Pages headers prevent caching for every protected route and artifact", () => {
  const source = readFileSync("app/frontend/public/_headers", "utf8");
  const built = readFileSync("app/frontend/dist/_headers", "utf8");
  assert.equal(built, source, "deployable artifact must carry the reviewed headers");
  const rules = source.trim().split(/\r?\n\s*\r?\n/).map((block) => {
    const [pattern, ...headers] = block.split(/\r?\n/);
    return { pattern, cache: headers.filter((header) => /^\s+Cache-Control:/i.test(header)) };
  });
  assert.equal(rules[0].pattern, "/*");
  assert.deepEqual(rules[0].cache, ["  Cache-Control: private, no-store"]);
  assert.ok(rules.slice(1).every((rule) => rule.cache.length === 0), "specific rules must not override or merge a public cache directive");
  assert.doesNotMatch(built, /max-age|immutable|Cache-Control: public/i);
  assert.match(built, /Content-Disposition: attachment; filename="Branden_Farmer_Resume.pdf"/);
});
