import * as SQLite from 'expo-sqlite';
import { inferSizeScheme, isShoeCategory, normalizeSize } from '@/lib/sizing';

const DB_NAME = 'layetteout.db';
const LATEST_DB_VERSION = 28;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let initPromise: Promise<void> | null = null;
const LEGACY_SAMPLE_CHILD_IDS = ['child-ava', 'child-noah'] as const;
const LEGACY_SAMPLE_ITEM_IDS = ['item-1', 'item-2', 'item-3', 'item-4', 'item-5', 'item-6'] as const;

const createTablesSql = `
CREATE TABLE IF NOT EXISTS children (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  photoUri TEXT,
  notes TEXT,
  hiddenClosetCategories TEXT,
  usesMixedSizes INTEGER NOT NULL DEFAULT 0,
  apparelSizeCurrent TEXT,
  apparelSizeNext TEXT,
  shoeSizeCurrent TEXT,
  shoeSizeNext TEXT,
  shoeSizeSystem TEXT DEFAULT 'US_SHOE',
  currentSizeCode TEXT,
  currentSizeOther TEXT,
  nextSizeCode TEXT,
  nextSizeOther TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY NOT NULL,
  childId TEXT,
  url TEXT,
  sourceDomain TEXT,
  canonicalUrl TEXT,
  outboundUrl TEXT,
  clickCount INTEGER NOT NULL DEFAULT 0,
  brand TEXT,
  printName TEXT,
  printNameNorm TEXT,
  title TEXT,
  imageUrl TEXT,
  imageUrls TEXT,
  cachedImageUri TEXT,
  clothingType TEXT NOT NULL,
  size TEXT NOT NULL,
  status TEXT,
  tags TEXT,
  notes TEXT,
  purchasePrice REAL,
  targetResalePrice REAL,
  soldPrice REAL,
  soldDate TEXT,
  listedAt TEXT,
  bundleId TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  sizeNormalized TEXT,
  sizeType TEXT,
  sizeSystem TEXT,
  sizeScheme TEXT,
  sizeRaw TEXT,
  category TEXT,
  brandFit TEXT,
  kidFit TEXT,
  brandSizeNote TEXT,
  fabric TEXT,
  fitRating TEXT,
  fitException TEXT,
  condition TEXT,
  seasonTags TEXT,
  lastWornAt INTEGER,
  wornCount INTEGER NOT NULL DEFAULT 0,
  fitBin TEXT DEFAULT 'unsure',
  fitBinTouched INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS child_items (
  id TEXT PRIMARY KEY NOT NULL,
  childId TEXT NOT NULL,
  itemId TEXT NOT NULL,
  storageLocationId TEXT,
  sizeAtTime TEXT,
  statusForChild TEXT NOT NULL,
  notesForChild TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  UNIQUE(childId, itemId)
);

CREATE TABLE IF NOT EXISTS outfits (
  id TEXT PRIMARY KEY NOT NULL,
  childId TEXT NOT NULL,
  name TEXT NOT NULL,
  itemIds TEXT NOT NULL,
  notes TEXT,
  previewUri TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  occasionTags TEXT,
  weatherHint TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS item_tags (
  itemId TEXT NOT NULL,
  tagId TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  PRIMARY KEY (itemId, tagId)
);

CREATE TABLE IF NOT EXISTS item_brands (
  itemId TEXT NOT NULL,
  brandId TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  PRIMARY KEY (itemId, brandId)
);

CREATE TABLE IF NOT EXISTS outfit_tags (
  outfitId TEXT NOT NULL,
  tagId TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  PRIMARY KEY (outfitId, tagId)
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY NOT NULL,
  detailPromptMode TEXT NOT NULL,
  closetAddDefaultView TEXT NOT NULL DEFAULT 'detailed',
  notificationsEnabled INTEGER NOT NULL,
  notifyWeeklyTidy INTEGER NOT NULL,
  notifyOutgrow INTEGER NOT NULL,
  monetizationEnabled INTEGER NOT NULL,
  guidedOnboarding INTEGER NOT NULL,
  guidedOnboardingCompleted INTEGER NOT NULL DEFAULT 0,
  advancedFeaturesUnlocked INTEGER NOT NULL,
  lastShoppingType TEXT,
  lastShoppingChildId TEXT,
  lastPromptedAt INTEGER,
  lastUpsellShownAt INTEGER,
  closetCategoryOrder TEXT,
  hiddenClosetCategoriesGlobal TEXT,
  wishlistCategoryOrder TEXT,
  hiddenWishlistCategories TEXT,
  kidsPreviewCategories TEXT,
  inventoryRealityCheckOwnedThreshold INTEGER,
  developerModeEnabled INTEGER NOT NULL DEFAULT 0,
  betaKidLimitBannerDismissed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  payload TEXT,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  appliedAt INTEGER NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS purchase_state (
  id INTEGER PRIMARY KEY NOT NULL,
  isEntitled INTEGER NOT NULL,
  payloadJson TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS filter_presets (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  childId TEXT,
  status TEXT,
  clothingType TEXT,
  includeUnsorted INTEGER NOT NULL,
  query TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);

CREATE TABLE IF NOT EXISTS storage_locations (
  id TEXT PRIMARY KEY NOT NULL,
  childId TEXT,
  name TEXT NOT NULL,
  type TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);

CREATE TABLE IF NOT EXISTS print_aliases (
  id TEXT PRIMARY KEY NOT NULL,
  canonical TEXT NOT NULL,
  alias TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deletedAt);
CREATE INDEX IF NOT EXISTS idx_child_items_child ON child_items(childId, deletedAt);
CREATE INDEX IF NOT EXISTS idx_child_items_item ON child_items(itemId, deletedAt);
CREATE INDEX IF NOT EXISTS idx_child_items_location ON child_items(storageLocationId, deletedAt);
CREATE INDEX IF NOT EXISTS idx_outfits_deleted ON outfits(deletedAt);
CREATE INDEX IF NOT EXISTS idx_filter_presets_deleted ON filter_presets(deletedAt, updatedAt);
CREATE INDEX IF NOT EXISTS idx_item_brands_item ON item_brands(itemId);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_items_print_name ON items(printName);
CREATE INDEX IF NOT EXISTS idx_items_bundle ON items(bundleId, deletedAt);
CREATE INDEX IF NOT EXISTS idx_storage_locations_child ON storage_locations(childId, deletedAt);
CREATE INDEX IF NOT EXISTS idx_print_aliases_canonical ON print_aliases(canonical, deletedAt);
CREATE INDEX IF NOT EXISTS idx_print_aliases_alias ON print_aliases(alias, deletedAt);
`;

const ensureDefaultSettings = async (db: SQLite.SQLiteDatabase) => {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM settings;');
  if ((row?.count ?? 0) > 0) return;

  await db.runAsync(
    `INSERT INTO settings (id, detailPromptMode, closetAddDefaultView, notificationsEnabled, notifyWeeklyTidy, notifyOutgrow, monetizationEnabled, guidedOnboarding, guidedOnboardingCompleted, advancedFeaturesUnlocked, lastShoppingType, lastShoppingChildId, lastPromptedAt, lastUpsellShownAt, closetCategoryOrder, hiddenClosetCategoriesGlobal, wishlistCategoryOrder, hiddenWishlistCategories, kidsPreviewCategories, inventoryRealityCheckOwnedThreshold, developerModeEnabled, betaKidLimitBannerDismissed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    'app',
    'sometimes',
    'detailed',
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    null,
    null,
    null,
    null,
    null,
    '[]',
    null,
    '[]',
    null,
    null,
    0,
    0,
  );
};

const ensureSchemaMigrationsTable = async (db: SQLite.SQLiteDatabase) => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      appliedAt INTEGER NOT NULL,
      note TEXT
    );
  `);
};

const syncSchemaMigrations = async (db: SQLite.SQLiteDatabase, version: number) => {
  if (version <= 0) return;
  await ensureSchemaMigrationsTable(db);
  const now = Date.now();
  for (let entry = 1; entry <= version; entry += 1) {
    await db.runAsync(
      `INSERT OR IGNORE INTO schema_migrations (version, appliedAt, note) VALUES (?, ?, ?);`,
      entry,
      now,
      entry === version ? 'synced-from-user_version' : 'historical-sync',
    );
  }
};

const ensureSeedData = async (db: SQLite.SQLiteDatabase) => {
  await ensureDefaultSettings(db);
};

const archiveLegacySeedData = async (db: SQLite.SQLiteDatabase) => {
  const now = Date.now();
  const childPlaceholders = LEGACY_SAMPLE_CHILD_IDS.map(() => '?').join(', ');
  const itemPlaceholders = LEGACY_SAMPLE_ITEM_IDS.map(() => '?').join(', ');

  await db.runAsync(
    `UPDATE children SET deletedAt = COALESCE(deletedAt, ?), updatedAt = ? WHERE id IN (${childPlaceholders});`,
    now,
    now,
    ...LEGACY_SAMPLE_CHILD_IDS,
  );
  await db.runAsync(
    `UPDATE child_items SET deletedAt = COALESCE(deletedAt, ?), updatedAt = ? WHERE childId IN (${childPlaceholders}) OR itemId IN (${itemPlaceholders});`,
    now,
    now,
    ...LEGACY_SAMPLE_CHILD_IDS,
    ...LEGACY_SAMPLE_ITEM_IDS,
  );
  await db.runAsync(
    `UPDATE outfits SET deletedAt = COALESCE(deletedAt, ?), updatedAt = ? WHERE childId IN (${childPlaceholders});`,
    now,
    now,
    ...LEGACY_SAMPLE_CHILD_IDS,
  );
  await db.runAsync(
    `UPDATE storage_locations SET deletedAt = COALESCE(deletedAt, ?), updatedAt = ? WHERE childId IN (${childPlaceholders});`,
    String(now),
    String(now),
    ...LEGACY_SAMPLE_CHILD_IDS,
  );
  await db.runAsync(
    `UPDATE items SET deletedAt = COALESCE(deletedAt, ?), updatedAt = ? WHERE id IN (${itemPlaceholders});`,
    now,
    now,
    ...LEGACY_SAMPLE_ITEM_IDS,
  );
};

const migrate = async (db: SQLite.SQLiteDatabase) => {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await ensureSchemaMigrationsTable(db);

  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < 1) {
    await db.execAsync(createTablesSql);
    // Fresh installs get the latest schema from createTablesSql, so skip legacy ALTER migrations.
    await db.execAsync(`PRAGMA user_version = ${LATEST_DB_VERSION};`);
    currentVersion = LATEST_DB_VERSION;
  }

  if (currentVersion < 2) {
    await db.execAsync(`
      ALTER TABLE items ADD COLUMN sizeNormalized TEXT;
      ALTER TABLE items ADD COLUMN category TEXT;
      ALTER TABLE items ADD COLUMN brandSizeNote TEXT;
      ALTER TABLE items ADD COLUMN fitRating TEXT;
      ALTER TABLE items ADD COLUMN condition TEXT;
      ALTER TABLE items ADD COLUMN seasonTags TEXT;
      ALTER TABLE items ADD COLUMN lastWornAt INTEGER;
      ALTER TABLE outfits ADD COLUMN occasionTags TEXT;
      ALTER TABLE outfits ADD COLUMN weatherHint TEXT;
      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY NOT NULL,
        detailPromptMode TEXT NOT NULL,
        notificationsEnabled INTEGER NOT NULL,
        notifyWeeklyTidy INTEGER NOT NULL,
        notifyOutgrow INTEGER NOT NULL,
        lastPromptedAt INTEGER
      );
    `);
    await db.execAsync('PRAGMA user_version = 2;');
  }

  if (currentVersion < 3) {
    await db.execAsync(`
      ALTER TABLE children ADD COLUMN updatedAt INTEGER;
      ALTER TABLE children ADD COLUMN deletedAt INTEGER;
      ALTER TABLE items ADD COLUMN deletedAt INTEGER;
      ALTER TABLE outfits ADD COLUMN updatedAt INTEGER;
      ALTER TABLE outfits ADD COLUMN deletedAt INTEGER;
      CREATE TABLE IF NOT EXISTS child_items (
        id TEXT PRIMARY KEY NOT NULL,
        childId TEXT NOT NULL,
        itemId TEXT NOT NULL,
        storageLocationId TEXT,
        sizeAtTime TEXT,
        statusForChild TEXT NOT NULL,
        notesForChild TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        deletedAt INTEGER,
        UNIQUE(childId, itemId)
      );
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE,
        createdAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS item_tags (
        itemId TEXT NOT NULL,
        tagId TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        PRIMARY KEY (itemId, tagId)
      );
      CREATE TABLE IF NOT EXISTS outfit_tags (
        outfitId TEXT NOT NULL,
        tagId TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        PRIMARY KEY (outfitId, tagId)
      );
      CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deletedAt);
      CREATE INDEX IF NOT EXISTS idx_child_items_child ON child_items(childId, deletedAt);
      CREATE INDEX IF NOT EXISTS idx_child_items_item ON child_items(itemId, deletedAt);
      CREATE INDEX IF NOT EXISTS idx_child_items_location ON child_items(storageLocationId, deletedAt);
      CREATE INDEX IF NOT EXISTS idx_outfits_deleted ON outfits(deletedAt);
      UPDATE children SET updatedAt = COALESCE(updatedAt, createdAt) WHERE updatedAt IS NULL;
      UPDATE outfits SET updatedAt = COALESCE(updatedAt, createdAt) WHERE updatedAt IS NULL;
    `);

    const legacyRows = await db.getAllAsync<{ id: string; childId: string | null; size: string; status: string | null; createdAt: number; updatedAt: number }>(
      'SELECT id, childId, size, status, createdAt, updatedAt FROM items WHERE childId IS NOT NULL;',
    );

    for (const row of legacyRows) {
      if (!row.childId) continue;
      await db.runAsync(
        `INSERT OR IGNORE INTO child_items (id, childId, itemId, storageLocationId, sizeAtTime, statusForChild, notesForChild, createdAt, updatedAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        `legacy-${row.childId}-${row.id}`,
        row.childId,
        row.id,
        null,
        row.size,
        row.status ?? 'wishlist',
        null,
        row.createdAt,
        row.updatedAt,
        null,
      );
    }

    await db.execAsync('PRAGMA user_version = 3;');
  }

  if (currentVersion < 4) {
    await db.execAsync(`
      ALTER TABLE items ADD COLUMN imageUrls TEXT;
      ALTER TABLE items ADD COLUMN cachedImageUri TEXT;
      CREATE TABLE IF NOT EXISTS filter_presets (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        childId TEXT,
        status TEXT,
        clothingType TEXT,
        includeUnsorted INTEGER NOT NULL,
        query TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        deletedAt INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_filter_presets_deleted ON filter_presets(deletedAt, updatedAt);
      UPDATE items
      SET imageUrls = CASE
        WHEN imageUrl IS NULL OR TRIM(imageUrl) = '' THEN '[]'
        ELSE json_array(imageUrl)
      END
      WHERE imageUrls IS NULL;
    `);
    await db.execAsync('PRAGMA user_version = 4;');
  }

  if (currentVersion < 5) {
    await db.execAsync(`
      ALTER TABLE items ADD COLUMN sourceDomain TEXT;
      ALTER TABLE items ADD COLUMN canonicalUrl TEXT;
      ALTER TABLE items ADD COLUMN outboundUrl TEXT;
      ALTER TABLE items ADD COLUMN clickCount INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE settings ADD COLUMN monetizationEnabled INTEGER NOT NULL DEFAULT 0;
      UPDATE items SET canonicalUrl = COALESCE(canonicalUrl, url) WHERE url IS NOT NULL;
      UPDATE items SET outboundUrl = COALESCE(outboundUrl, canonicalUrl, url) WHERE url IS NOT NULL;
    `);
    await db.execAsync('PRAGMA user_version = 5;');
  }

  if (currentVersion < 6) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS brands (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE,
        createdAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS item_brands (
        itemId TEXT NOT NULL,
        brandId TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        PRIMARY KEY (itemId, brandId)
      );
      CREATE INDEX IF NOT EXISTS idx_item_brands_item ON item_brands(itemId);
    `);

    const brandRows = await db.getAllAsync<{ id: string; brand: string | null }>(
      'SELECT id, brand FROM items WHERE brand IS NOT NULL AND TRIM(brand) <> "";',
    );
    for (const row of brandRows) {
      const name = (row.brand ?? '').trim().toLowerCase();
      if (!name) continue;
      await db.runAsync('INSERT OR IGNORE INTO brands (id, name, createdAt) VALUES (?, ?, ?);', `brand-${name}`, name, Date.now());
      const brand = await db.getFirstAsync<{ id: string }>('SELECT id FROM brands WHERE name = ?;', name);
      if (!brand) continue;
      await db.runAsync('INSERT OR IGNORE INTO item_brands (itemId, brandId, createdAt) VALUES (?, ?, ?);', row.id, brand.id, Date.now());
    }

    await db.execAsync('PRAGMA user_version = 6;');
  }

  if (currentVersion < 7) {
    await db.execAsync(`
      ALTER TABLE items ADD COLUMN fitException TEXT;
      ALTER TABLE items ADD COLUMN wornCount INTEGER NOT NULL DEFAULT 0;
    `);
    await db.execAsync('PRAGMA user_version = 7;');
  }

  if (currentVersion < 8) {
    await db.execAsync(`
      ALTER TABLE settings ADD COLUMN guidedOnboarding INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE settings ADD COLUMN advancedFeaturesUnlocked INTEGER NOT NULL DEFAULT 0;
    `);
    await db.execAsync('PRAGMA user_version = 8;');
  }

  if (currentVersion < 9) {
    await db.execAsync(`
      ALTER TABLE settings ADD COLUMN lastShoppingType TEXT;
      ALTER TABLE settings ADD COLUMN lastShoppingChildId TEXT;
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        payload TEXT,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_created ON events(createdAt DESC);
    `);
    await db.execAsync('PRAGMA user_version = 9;');
  }

  if (currentVersion < 10) {
    await db.execAsync(`
      ALTER TABLE items ADD COLUMN printName TEXT;
      CREATE INDEX IF NOT EXISTS idx_items_print_name ON items(printName);
    `);
    await db.execAsync('PRAGMA user_version = 10;');
  }

  if (currentVersion < 11) {
    await db.execAsync(`
      ALTER TABLE items ADD COLUMN purchasePrice REAL;
      ALTER TABLE items ADD COLUMN targetResalePrice REAL;
      ALTER TABLE items ADD COLUMN soldPrice REAL;
      ALTER TABLE items ADD COLUMN soldDate TEXT;
    `);
    await db.execAsync('PRAGMA user_version = 11;');
  }

  if (currentVersion < 12) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS storage_locations (
        id TEXT PRIMARY KEY NOT NULL,
        childId TEXT,
        name TEXT NOT NULL,
        type TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        deletedAt TEXT
      );
    `);
    const childItemColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('child_items');`);
    if (!childItemColumns.some((column) => column.name === 'storageLocationId')) {
      await db.execAsync('ALTER TABLE child_items ADD COLUMN storageLocationId TEXT;');
    }
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_child_items_location ON child_items(storageLocationId, deletedAt);
      CREATE INDEX IF NOT EXISTS idx_storage_locations_child ON storage_locations(childId, deletedAt);
    `);
    await db.execAsync('PRAGMA user_version = 12;');
  }

  if (currentVersion < 13) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS purchase_state (
        id INTEGER PRIMARY KEY NOT NULL,
        isEntitled INTEGER NOT NULL,
        payloadJson TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);
    await db.execAsync('PRAGMA user_version = 13;');
  }

  if (currentVersion < 14) {
    await db.execAsync(`
      ALTER TABLE items ADD COLUMN printNameNorm TEXT;
      CREATE TABLE IF NOT EXISTS print_aliases (
        id TEXT PRIMARY KEY NOT NULL,
        canonical TEXT NOT NULL,
        alias TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        deletedAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_print_aliases_canonical ON print_aliases(canonical, deletedAt);
      CREATE INDEX IF NOT EXISTS idx_print_aliases_alias ON print_aliases(alias, deletedAt);
    `);

    const rows = await db.getAllAsync<{ id: string; printName: string | null }>('SELECT id, printName FROM items WHERE printName IS NOT NULL AND TRIM(printName) <> "";');
    for (const row of rows) {
      const norm = (row.printName ?? '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      await db.runAsync('UPDATE items SET printNameNorm = ? WHERE id = ?;', norm || null, row.id);
    }
    await db.execAsync('PRAGMA user_version = 14;');
  }

  if (currentVersion < 15) {
    await db.execAsync(`
      ALTER TABLE items ADD COLUMN listedAt TEXT;
      ALTER TABLE items ADD COLUMN bundleId TEXT;
      CREATE INDEX IF NOT EXISTS idx_items_bundle ON items(bundleId, deletedAt);
    `);
    await db.execAsync('PRAGMA user_version = 15;');
  }

  if (currentVersion < 16) {
    const settingsColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('settings');`);
    if (!settingsColumns.some((column) => column.name === 'lastUpsellShownAt')) {
      await db.execAsync('ALTER TABLE settings ADD COLUMN lastUpsellShownAt INTEGER;');
    }
    await db.execAsync('PRAGMA user_version = 16;');
  }

  if (currentVersion < 17) {
    const childColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('children');`);
    if (!childColumns.some((column) => column.name === 'currentSizeCode')) {
      await db.execAsync('ALTER TABLE children ADD COLUMN currentSizeCode TEXT;');
    }
    if (!childColumns.some((column) => column.name === 'currentSizeOther')) {
      await db.execAsync('ALTER TABLE children ADD COLUMN currentSizeOther TEXT;');
    }
    if (!childColumns.some((column) => column.name === 'nextSizeCode')) {
      await db.execAsync('ALTER TABLE children ADD COLUMN nextSizeCode TEXT;');
    }
    if (!childColumns.some((column) => column.name === 'nextSizeOther')) {
      await db.execAsync('ALTER TABLE children ADD COLUMN nextSizeOther TEXT;');
    }
    await db.execAsync('PRAGMA user_version = 17;');
  }

  if (currentVersion < 18) {
    const settingsColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('settings');`);
    if (!settingsColumns.some((column) => column.name === 'guidedOnboardingCompleted')) {
      await db.execAsync('ALTER TABLE settings ADD COLUMN guidedOnboardingCompleted INTEGER NOT NULL DEFAULT 0;');
    }
    await db.execAsync('PRAGMA user_version = 18;');
  }

  if (currentVersion < 19) {
    const childColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('children');`);
    if (!childColumns.some((column) => column.name === 'hiddenClosetCategories')) {
      await db.execAsync('ALTER TABLE children ADD COLUMN hiddenClosetCategories TEXT;');
    }
    await db.execAsync(`UPDATE children SET hiddenClosetCategories = COALESCE(hiddenClosetCategories, '[]');`);
    await db.execAsync('PRAGMA user_version = 19;');
  }

  if (currentVersion < 20) {
    const itemColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('items');`);
    if (!itemColumns.some((column) => column.name === 'brandFit')) {
      await db.execAsync('ALTER TABLE items ADD COLUMN brandFit TEXT;');
    }
    if (!itemColumns.some((column) => column.name === 'kidFit')) {
      await db.execAsync('ALTER TABLE items ADD COLUMN kidFit TEXT;');
    }
    await db.execAsync('PRAGMA user_version = 20;');
  }

  if (currentVersion < 21) {
    const childColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('children');`);
    if (!childColumns.some((column) => column.name === 'photoUri')) {
      await db.execAsync('ALTER TABLE children ADD COLUMN photoUri TEXT;');
    }
    await db.execAsync('PRAGMA user_version = 21;');
  }

  if (currentVersion < 22) {
    const settingsColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('settings');`);
    if (!settingsColumns.some((column) => column.name === 'closetCategoryOrder')) {
      await db.execAsync('ALTER TABLE settings ADD COLUMN closetCategoryOrder TEXT;');
    }
    if (!settingsColumns.some((column) => column.name === 'hiddenClosetCategoriesGlobal')) {
      await db.execAsync(`ALTER TABLE settings ADD COLUMN hiddenClosetCategoriesGlobal TEXT;`);
    }
    if (!settingsColumns.some((column) => column.name === 'wishlistCategoryOrder')) {
      await db.execAsync('ALTER TABLE settings ADD COLUMN wishlistCategoryOrder TEXT;');
    }
    if (!settingsColumns.some((column) => column.name === 'hiddenWishlistCategories')) {
      await db.execAsync(`ALTER TABLE settings ADD COLUMN hiddenWishlistCategories TEXT;`);
    }
    if (!settingsColumns.some((column) => column.name === 'kidsPreviewCategories')) {
      await db.execAsync('ALTER TABLE settings ADD COLUMN kidsPreviewCategories TEXT;');
    }
    await db.execAsync(`UPDATE settings SET hiddenClosetCategoriesGlobal = COALESCE(hiddenClosetCategoriesGlobal, '[]');`);
    await db.execAsync(`UPDATE settings SET hiddenWishlistCategories = COALESCE(hiddenWishlistCategories, '[]');`);
    await db.execAsync('PRAGMA user_version = 22;');
    currentVersion = 22;
  }

  if (currentVersion < 23) {
    const settingsColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('settings');`);
    if (!settingsColumns.some((column) => column.name === 'developerModeEnabled')) {
      await db.execAsync('ALTER TABLE settings ADD COLUMN developerModeEnabled INTEGER NOT NULL DEFAULT 0;');
    }
    await db.execAsync('PRAGMA user_version = 23;');
    currentVersion = 23;
  }

  if (currentVersion < 24) {
    const childColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('children');`);
    if (!childColumns.some((column) => column.name === 'usesMixedSizes')) {
      await db.execAsync('ALTER TABLE children ADD COLUMN usesMixedSizes INTEGER NOT NULL DEFAULT 0;');
    }
    await db.execAsync('PRAGMA user_version = 24;');
    currentVersion = 24;
  }

  if (currentVersion < 25) {
    const itemColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('items');`);
    if (!itemColumns.some((column) => column.name === 'fabric')) {
      await db.execAsync('ALTER TABLE items ADD COLUMN fabric TEXT;');
    }
    const settingsColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('settings');`);
    if (!settingsColumns.some((column) => column.name === 'inventoryRealityCheckOwnedThreshold')) {
      await db.execAsync('ALTER TABLE settings ADD COLUMN inventoryRealityCheckOwnedThreshold INTEGER;');
    }
    await db.execAsync('PRAGMA user_version = 25;');
    currentVersion = 25;
  }

  if (currentVersion < 26) {
    const settingsColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('settings');`);
    if (!settingsColumns.some((column) => column.name === 'betaKidLimitBannerDismissed')) {
      await db.execAsync('ALTER TABLE settings ADD COLUMN betaKidLimitBannerDismissed INTEGER NOT NULL DEFAULT 0;');
    }
    await db.execAsync('PRAGMA user_version = 26;');
    currentVersion = 26;
  }

  if (currentVersion < 27) {
    const settingsColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('settings');`);
    if (!settingsColumns.some((column) => column.name === 'closetAddDefaultView')) {
      await db.execAsync(`ALTER TABLE settings ADD COLUMN closetAddDefaultView TEXT NOT NULL DEFAULT 'detailed';`);
    }
    await db.execAsync(`UPDATE settings SET closetAddDefaultView = COALESCE(NULLIF(TRIM(closetAddDefaultView), ''), 'detailed');`);
    await db.execAsync('PRAGMA user_version = 27;');
    currentVersion = 27;
  }

  if (currentVersion < 28) {
    const childColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('children');`);
    const itemColumns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info('items');`);

    const ensureChildColumn = async (name: string, sql: string) => {
      if (!childColumns.some((column) => column.name === name)) {
        await db.execAsync(sql);
      }
    };
    const ensureItemColumn = async (name: string, sql: string) => {
      if (!itemColumns.some((column) => column.name === name)) {
        await db.execAsync(sql);
      }
    };

    await ensureChildColumn('apparelSizeCurrent', 'ALTER TABLE children ADD COLUMN apparelSizeCurrent TEXT;');
    await ensureChildColumn('apparelSizeNext', 'ALTER TABLE children ADD COLUMN apparelSizeNext TEXT;');
    await ensureChildColumn('shoeSizeCurrent', 'ALTER TABLE children ADD COLUMN shoeSizeCurrent TEXT;');
    await ensureChildColumn('shoeSizeNext', 'ALTER TABLE children ADD COLUMN shoeSizeNext TEXT;');
    await ensureChildColumn(`shoeSizeSystem`, `ALTER TABLE children ADD COLUMN shoeSizeSystem TEXT DEFAULT 'US_SHOE';`);

    await ensureItemColumn('sizeType', 'ALTER TABLE items ADD COLUMN sizeType TEXT;');
    await ensureItemColumn('sizeSystem', 'ALTER TABLE items ADD COLUMN sizeSystem TEXT;');
    await ensureItemColumn('sizeScheme', 'ALTER TABLE items ADD COLUMN sizeScheme TEXT;');
    await ensureItemColumn('sizeRaw', 'ALTER TABLE items ADD COLUMN sizeRaw TEXT;');
    await ensureItemColumn(`fitBin`, `ALTER TABLE items ADD COLUMN fitBin TEXT DEFAULT 'unsure';`);
    await ensureItemColumn('fitBinTouched', 'ALTER TABLE items ADD COLUMN fitBinTouched INTEGER NOT NULL DEFAULT 0;');

    await db.execAsync(`UPDATE children SET shoeSizeSystem = COALESCE(NULLIF(TRIM(shoeSizeSystem), ''), 'US_SHOE');`);
    await db.execAsync(`
      UPDATE children
      SET apparelSizeCurrent = COALESCE(NULLIF(TRIM(apparelSizeCurrent), ''), currentSizeCode),
          apparelSizeNext = COALESCE(NULLIF(TRIM(apparelSizeNext), ''), nextSizeCode)
      WHERE 1=1;
    `);

    const legacyItems = await db.getAllAsync<{ id: string; category: string | null; clothingType: string | null; size: string | null }>(
      'SELECT id, category, clothingType, size FROM items;',
    );
    for (const row of legacyItems) {
      const sizeRaw = (row.size ?? '').trim();
      const normalized = normalizeSize(sizeRaw);
      const shoe = isShoeCategory(String(row.category ?? row.clothingType ?? ''));
      const sizeType = shoe ? 'shoe' : 'apparel';
      const sizeSystem = shoe ? 'US_SHOE' : 'APPAREL';
      const sizeScheme = sizeRaw ? inferSizeScheme(sizeRaw) : 'CUSTOM';
      await db.runAsync(
        `UPDATE items
         SET sizeRaw = COALESCE(NULLIF(TRIM(sizeRaw), ''), ?),
             sizeNormalized = COALESCE(NULLIF(TRIM(sizeNormalized), ''), ?),
             sizeType = COALESCE(NULLIF(TRIM(sizeType), ''), ?),
             sizeSystem = COALESCE(NULLIF(TRIM(sizeSystem), ''), ?),
             sizeScheme = COALESCE(NULLIF(TRIM(sizeScheme), ''), ?),
             fitBin = COALESCE(NULLIF(TRIM(fitBin), ''), 'unsure'),
             fitBinTouched = COALESCE(fitBinTouched, 0)
         WHERE id = ?;`,
        sizeRaw || null,
        normalized || null,
        sizeType,
        sizeSystem,
        sizeScheme,
        row.id,
      );
    }

    await db.execAsync(`UPDATE items SET fitBin = COALESCE(NULLIF(TRIM(fitBin), ''), 'unsure');`);
    await db.execAsync(`UPDATE items SET fitBinTouched = COALESCE(fitBinTouched, 0);`);

    await db.execAsync('PRAGMA user_version = 28;');
    currentVersion = 28;
  }

  const finalVersionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const finalVersion = finalVersionRow?.user_version ?? currentVersion;
  await syncSchemaMigrations(db, finalVersion);

  await ensureDefaultSettings(db);
  await archiveLegacySeedData(db);
  await ensureSeedData(db);
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
