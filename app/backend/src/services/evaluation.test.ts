import { afterAll, beforeAll, describe, expect, it } from "vitest";
import evaluation from "../../evaluation/ask-evaluation.json";
import { buildKnowledgePassages, buildKnowledgeSql } from "../knowledge/corpus";
import { createTestD1 } from "../test/sqlite-d1";
import { searchKnowledge } from "./knowledge";

let db: D1Database;
let close: () => void;
const passageIds = new Set(buildKnowledgePassages().map((passage) => passage.id));

beforeAll(async () => {
  ({ db, close } = createTestD1());
  await db.exec(buildKnowledgeSql(buildKnowledgePassages(), "eval", "2026-09-29T00:00:00Z"));
});

afterAll(() => close());

describe("Ask evaluation set", () => {
  it("meets the planned size and references only real passages", () => {
    expect(evaluation.supported.length).toBeGreaterThanOrEqual(20);
    expect(evaluation.unsupported.length).toBeGreaterThanOrEqual(10);
    expect(evaluation.jobDescriptions.length).toBeGreaterThanOrEqual(10);
    const referenced = [...evaluation.supported, ...evaluation.jobDescriptions].flatMap((item) => item.expected);
    expect(referenced.filter((id) => !passageIds.has(id))).toEqual([]);
  });

  it.each(evaluation.supported)("retrieves expected evidence for: $question", async ({ question, expected }) => {
    const ids = (await searchKnowledge(db, question, "question")).map((result) => result.id);
    expect(ids.some((id) => expected.includes(id)), `retrieved ${ids.join(", ")}`).toBe(true);
  });

  it.each(evaluation.jobDescriptions)("retrieves expected evidence for job description $#", async ({ text, expected }) => {
    const ids = (await searchKnowledge(db, text, "job_description")).map((result) => result.id);
    expect(ids.some((id) => expected.includes(id)), `retrieved ${ids.join(", ")}`).toBe(true);
  });
});
