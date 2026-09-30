CREATE TABLE knowledge_versions (
  version TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  published_at TEXT NOT NULL
);

CREATE UNIQUE INDEX one_active_knowledge_version
  ON knowledge_versions (active) WHERE active = 1;

CREATE TABLE knowledge_passages (
  passage_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status = 'published'),
  last_reviewed TEXT NOT NULL,
  content_version TEXT NOT NULL REFERENCES knowledge_versions(version) ON DELETE CASCADE,
  PRIMARY KEY (content_version, passage_id)
);

CREATE INDEX knowledge_passages_version ON knowledge_passages (content_version);

CREATE VIRTUAL TABLE knowledge_passages_fts USING fts5(
  title, tags, body, content='knowledge_passages', content_rowid='rowid'
);

CREATE TRIGGER knowledge_passages_insert AFTER INSERT ON knowledge_passages BEGIN
  INSERT INTO knowledge_passages_fts (rowid, title, tags, body)
  VALUES (new.rowid, new.title, new.tags, new.body);
END;

CREATE TRIGGER knowledge_passages_delete AFTER DELETE ON knowledge_passages BEGIN
  INSERT INTO knowledge_passages_fts (knowledge_passages_fts, rowid, title, tags, body)
  VALUES ('delete', old.rowid, old.title, old.tags, old.body);
END;

CREATE TRIGGER knowledge_passages_update AFTER UPDATE OF title, tags, body ON knowledge_passages BEGIN
  INSERT INTO knowledge_passages_fts (knowledge_passages_fts, rowid, title, tags, body)
  VALUES ('delete', old.rowid, old.title, old.tags, old.body);
  INSERT INTO knowledge_passages_fts (rowid, title, tags, body)
  VALUES (new.rowid, new.title, new.tags, new.body);
END;