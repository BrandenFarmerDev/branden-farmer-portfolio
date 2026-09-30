/// <reference types="node" />
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

type Value = string | number | boolean | null;

export function createTestD1(migrations: string[] = ["0001_knowledge.sql", "0002_portfolio_data.sql"]) {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON;");
  for (const migration of migrations) {
    database.exec(readFileSync(new URL(`../../migrations/${migration}`, import.meta.url), "utf8"));
  }

  const statement = (sql: string, raw: Value[] = []) => {
    // D1 binds booleans as integers; node:sqlite rejects them.
    const values = raw.map((value) => typeof value === "boolean" ? Number(value) : value);
    return {
      bind: (...next: Value[]) => statement(sql, next),
      run: async () => ({ meta: { changes: Number(database.prepare(sql).run(...values).changes) } }),
      first: async () => database.prepare(sql).get(...values) ?? null,
      all: async () => ({ results: database.prepare(sql).all(...values), meta: {} }),
    };
  };

  const db = {
    prepare: (sql: string) => statement(sql),
    exec: async (sql: string) => {
      database.exec(sql);
      return { count: 1, duration: 0 };
    },
    batch: async (statements: Array<ReturnType<typeof statement>>) => {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const item of statements) results.push(await item.all());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;

  return { db, close: () => database.close() };
}
