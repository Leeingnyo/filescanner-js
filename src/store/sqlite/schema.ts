import Database from 'better-sqlite3';

export function ensureSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS roots (
      rootId TEXT PRIMARY KEY,
      rootKey TEXT UNIQUE NOT NULL,
      os TEXT NOT NULL,
      osPath TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      casePolicy TEXT NOT NULL,
      capabilitiesCaseSensitive INTEGER NOT NULL,
      capabilitiesSupportsFileId INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      snapshotId TEXT PRIMARY KEY,
      rootId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      lastPatchedAt TEXT NOT NULL,
      lastRunId TEXT NOT NULL,
      lastCoverage TEXT NOT NULL,
      statsJson TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entities (
      snapshotId TEXT NOT NULL,
      entityKey TEXT NOT NULL,
      firstSeenAt TEXT NOT NULL,
      PRIMARY KEY (snapshotId, entityKey)
    );

    CREATE TABLE IF NOT EXISTS nodes (
      snapshotId TEXT NOT NULL,
      nodeId TEXT NOT NULL,
      rootId TEXT NOT NULL,
      layersJson TEXT NOT NULL,
      layersSigHash TEXT NOT NULL,
      vpath TEXT NOT NULL,
      vpathFold TEXT NOT NULL,
      vpathKey TEXT NOT NULL,
      parentKey TEXT,
      name TEXT NOT NULL,
      nameKey TEXT NOT NULL,
      kind TEXT NOT NULL,
      size INTEGER,
      mtime TEXT,
      ctime TEXT,
      birthtime TEXT,
      identityJson TEXT NOT NULL,
      identityValue TEXT,
      entityKey TEXT NOT NULL,
      firstSeenAt TEXT NOT NULL,
      isDeleted INTEGER NOT NULL,
      deletedAt TEXT,
      hashesJson TEXT NOT NULL,
      extrasJson TEXT NOT NULL,
      observedInRunId TEXT NOT NULL,
      lastObservedAt TEXT NOT NULL,
      errorsJson TEXT NOT NULL,
      canonical TEXT NOT NULL,
      osVpath TEXT NOT NULL,
      osVpathKey TEXT NOT NULL,
      PRIMARY KEY (snapshotId, nodeId),
      UNIQUE (snapshotId, rootId, layersSigHash, vpathKey)
    );

    CREATE TABLE IF NOT EXISTS node_hashes (
      snapshotId TEXT NOT NULL,
      nodeId TEXT NOT NULL,
      algo TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (snapshotId, nodeId, algo, value)
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes (snapshotId, parentKey, nameKey);
    CREATE INDEX IF NOT EXISTS idx_nodes_entity ON nodes (snapshotId, entityKey);
    CREATE INDEX IF NOT EXISTS idx_nodes_identity ON nodes (snapshotId, identityValue);
    CREATE INDEX IF NOT EXISTS idx_nodes_size ON nodes (snapshotId, size);
    CREATE INDEX IF NOT EXISTS idx_nodes_vpath ON nodes (snapshotId, vpathKey);
    CREATE INDEX IF NOT EXISTS idx_hashes_value ON node_hashes (snapshotId, algo, value);
  `);
}
