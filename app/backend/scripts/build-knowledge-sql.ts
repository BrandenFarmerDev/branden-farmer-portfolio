/// <reference types="node" />
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildKnowledgePassages, buildKnowledgeSql } from "../src/knowledge/corpus.ts";

const output = process.argv[2] ?? ".generated/knowledge.sql";
const passages = buildKnowledgePassages();
const version = createHash("sha256").update(JSON.stringify(passages)).digest("hex").slice(0, 16);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, buildKnowledgeSql(passages, version, new Date().toISOString()));
console.log(`Wrote ${passages.length} approved passages for content version ${version} to ${output}`);
