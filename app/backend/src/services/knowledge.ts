import type { AskMode, EvidenceLink } from "@portfolio/shared";

export interface RetrievedPassage extends EvidenceLink {
  body: string;
}

const STOPWORDS = new Set(("a about above after again all also am an and any are as at be been being both but by can could did "
  + "do does doing done for from had has have having he her here him his how i if in into is it its just me more most my "
  + "no nor not of off on once only or other our out over own same she should so some such than that the their them then "
  + "there these they this those through to too under until up very was we were what when where which while who whom why "
  + "will with would you your branden farmer he's his him tell know does experience worked work working role job "
  + "ability able strong excellent preferred required requirements responsibilities candidate team years year plus including "
  + "kind kinds hold holds move moved use used uses build builds built building develop develops developed developing")
  .split(" "));

const ALIASES: Record<string, string[]> = {
  bi: ["business", "intelligence"],
  app: ["application"],
  apps: ["application"],
  powerbi: ["power", "bi"],
  etl: ["elt", "pipelines"],
  elt: ["etl"],
  foundry: ["palantir"],
  llm: ["ai"],
  js: ["javascript"],
  ts: ["typescript"],
  postgres: ["postgresql"],
  dashboards: ["dashboard"],
  reporting: ["reports", "dashboards"],
  software: ["application", "development"],
  received: ["receive", "recipient"],
  looking: ["availability", "available", "exploring"],
};

const MAX_TERMS = { question: 16, job_description: 40 } as const;
const RESULT_LIMIT = { question: 4, job_description: 5 } as const;

function termGroups(text: string, mode: AskMode): string[][] {
  const groups: string[][] = [];
  const seen = new Set<string>();
  for (const word of text.toLowerCase().normalize("NFKC").match(/[a-z0-9]+/g) ?? []) {
    if (word.length < 2 || STOPWORDS.has(word) || seen.has(word)) continue;
    const group = [word, ...(ALIASES[word] ?? [])];
    const newTerms = group.filter((term) => !seen.has(term));
    if (newTerms.length === 0) continue;
    groups.push(newTerms);
    for (const term of newTerms) seen.add(term);
    if (seen.size >= MAX_TERMS[mode]) break;
  }
  return groups;
}

function termVariants(term: string): string[] {
  return term.length > 4 && term.endsWith("s") && !term.endsWith("ss") ? [term.slice(0, -1), term] : [term];
}

interface SearchCandidate extends RetrievedPassage {
  tags: string;
}

function hasEnoughTermCoverage(passages: SearchCandidate[], groups: string[][]): boolean {
  const searchable = passages.map((passage) => `${passage.title} ${passage.body} ${passage.tags}`).join(" ");
  const tokens = new Set(searchable.toLowerCase().normalize("NFKC").match(/[a-z0-9]+/g) ?? []);
  const matches = groups.filter((group) => group.some((term) => termVariants(term).some((variant) => tokens.has(variant)))).length;
  return matches >= Math.min(3, Math.ceil(groups.length * 0.75));
}

export function buildMatchQuery(text: string, mode: AskMode): string | null {
  const terms = new Set(termGroups(text, mode).flatMap((group) => group.flatMap(termVariants)).slice(0, MAX_TERMS[mode]));
  if (terms.size === 0) return null;
  // Terms are restricted to [a-z0-9], so quoting yields a literal FTS5 phrase.
  return [...terms].map((term) => `"${term}"`).join(" OR ");
}

export async function searchKnowledge(db: D1Database, text: string, mode: AskMode): Promise<RetrievedPassage[]> {
  const groups = termGroups(text, mode);
  const query = buildMatchQuery(text, mode);
  if (!query) return [];
  const result = await db.prepare(`SELECT p.passage_id AS id, p.title, p.url, p.body, p.tags
    FROM knowledge_passages_fts f
    JOIN knowledge_passages p ON p.rowid = f.rowid
    JOIN knowledge_versions v ON v.version = p.content_version AND v.active = 1
    WHERE knowledge_passages_fts MATCH ? AND p.status = 'published'
    ORDER BY bm25(knowledge_passages_fts, 4.0, 2.0, 1.0) LIMIT ?`)
    .bind(query, RESULT_LIMIT[mode] * 4)
    .all<SearchCandidate>();
  const selected = result.results.slice(0, RESULT_LIMIT[mode]);
  if (!hasEnoughTermCoverage(selected, groups)) return [];
  return selected.map((passage) => ({
    id: passage.id,
    title: passage.title,
    url: passage.url,
    body: passage.body,
  }));
}
