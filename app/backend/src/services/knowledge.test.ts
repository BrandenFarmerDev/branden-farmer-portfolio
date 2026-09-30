import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildKnowledgePassages, buildKnowledgeSql } from "../knowledge/corpus";
import { createTestD1 } from "../test/sqlite-d1";
import { buildMatchQuery, searchKnowledge } from "./knowledge";

let db: D1Database;
let close: () => void;

beforeEach(async () => {
  ({ db, close } = createTestD1());
  await db.exec(buildKnowledgeSql(buildKnowledgePassages(), "v1", "2026-09-29T00:00:00Z"));
});

afterEach(() => close());

describe("approved knowledge", () => {
  it("builds unique passages with site-relative links and honest project status", () => {
    const passages = buildKnowledgePassages();
    expect(new Set(passages.map((passage) => passage.id)).size).toBe(passages.length);
    expect(passages.every((passage) => /^\/(resume|about|work)(#[a-z0-9-]+)?$/.test(passage.url))).toBe(true);
    expect(passages.filter((passage) => passage.id.startsWith("project-"))
      .every((passage) => passage.body.includes("not a finished product"))).toBe(true);
    expect(passages.some((passage) => passage.body.includes("(775)"))).toBe(false);
  });

  it("retrieves ranked evidence from the active version only", async () => {
    const results = await searchKnowledge(db, "What experience does he have with Power BI and Palantir Foundry?", "question");
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(4);
    expect(results.map((result) => result.id)).toContain("resume-project-palantir-foundry-operational-applications");

    const replacement = [{ id: "only", title: "Replacement", body: "Kubernetes evidence", tags: "", url: "/about" }];
    await db.exec(buildKnowledgeSql(replacement, "v2", "2026-09-30T00:00:00Z"));
    expect(await searchKnowledge(db, "Palantir Foundry", "question")).toEqual([]);
    expect((await searchKnowledge(db, "kubernetes", "question"))[0]).toMatchObject({ id: "only" });
  });

  it("returns no evidence for unsupported or empty topics without building unsafe queries", async () => {
    expect(await searchKnowledge(db, "What is his favorite color?", "question")).toEqual([]);
    expect(await searchKnowledge(db, "Has he built mobile games?", "question")).toEqual([]);
    expect(await searchKnowledge(db, "Did he design aircraft engines?", "question")).toEqual([]);
    expect(await searchKnowledge(db, "Has he managed hospital operations?", "question")).toEqual([]);
    expect(await searchKnowledge(db, "Can he develop iOS applications?", "question")).toEqual([]);
    expect(buildMatchQuery("the and of", "question")).toBeNull();
    expect(buildMatchQuery('BI" OR x NEAR(', "question")).toBe('"bi" OR "business" OR "intelligence" OR "near"');
    expect(buildMatchQuery("dashboards", "question")).toBe('"dashboard" OR "dashboards"');
  });
});
