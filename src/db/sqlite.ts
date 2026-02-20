import * as SQLite from 'expo-sqlite';

const DB_NAME = 'kidklothes.db';
const LATEST_DB_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let initPromise: Promise<void> | null = null;

const createTablesSql = `
CREATE TABLE IF NOT EXISTS children (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  notes TEXT,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY NOT NULL,
  childId TEXT NOT NULL,
  url TEXT,
  brand TEXT,
  title TEXT,
  imageUrl TEXT,
  clothingType TEXT NOT NULL,
  size TEXT NOT NULL,
  status TEXT,
  tags TEXT,
  notes TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY(childId) REFERENCES children(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS outfits (
  id TEXT PRIMARY KEY NOT NULL,
  childId TEXT NOT NULL,
  name TEXT NOT NULL,
  itemIds TEXT NOT NULL,
  notes TEXT,
  previewUri TEXT,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY(childId) REFERENCES children(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_child_id ON items(childId);
CREATE INDEX IF NOT EXISTS idx_outfits_child_id ON outfits(childId);
`;

const seedDb = async (db: SQLite.SQLiteDatabase) => {
  const countRow = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM children;');
  if ((countRow?.count ?? 0) > 0) return;

  const now = Date.now();

  await db.runAsync(
    'INSERT INTO children (id, name, notes, createdAt) VALUES (?, ?, ?, ?);',
    'child-ava',
    'Ava',
    'Likes soft fabrics',
    now,
  );

  await db.runAsync(
    'INSERT INTO children (id, name, notes, createdAt) VALUES (?, ?, ?, ?);',
    'child-noah',
    'Noah',
    null,
    now,
  );

  await db.runAsync(
    `INSERT INTO items (
      id, childId, url, brand, title, imageUrl, clothingType, size, status, tags, notes, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    'item-1',
    'child-ava',
    'https://example.com/tee',
    'Primary',
    'Striped Cotton Tee',
    null,
    'top',
    '5T',
    'owned',
    JSON.stringify(['casual', 'spring']),
    null,
    now,
    now,
  );

  await db.runAsync(
    `INSERT INTO items (
      id, childId, url, brand, title, imageUrl, clothingType, size, status, tags, notes, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    'item-2',
    'child-ava',
    'https://example.com/shorts',
    'Gap Kids',
    'Denim Shorts',
    null,
    'bottom',
    '5',
    'wishlist',
    JSON.stringify(['summer']),
    null,
    now,
    now,
  );

  await db.runAsync(
    'INSERT INTO outfits (id, childId, name, itemIds, notes, previewUri, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?);',
    'outfit-1',
    'child-ava',
    'Park Day',
    JSON.stringify(['item-1', 'item-2']),
    null,
    null,
    now,
  );
};

const migrate = async (db: SQLite.SQLiteDatabase) => {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA journal_mode = WAL;');

  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < 1) {
    await db.execAsync(createTablesSql);
    await db.execAsync(`PRAGMA user_version = ${LATEST_DB_VERSION};`);
  }

  await seedDb(db);
};

export const getDb = async () => {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  return dbPromise;
};

export const initDatabase = async () => {
  if (!initPromise) {
    initPromise = (async () => {
      const db = await getDb();
      await migrate(db);
    })();
  }
  return initPromise;
};
