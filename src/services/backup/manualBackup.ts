import Constants from 'expo-constants';
import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as SQLite from 'expo-sqlite';
import { BackupExportResult, BackupManifest, BackupRestorePreview } from '@/models';
import { repository } from '@/db/repository';
import { getCurrentSchemaVersion, getDb, getLatestSchemaVersion, initDatabase, resetDatabaseConnection } from '@/db/sqlite';
import { findPersistedImageByFilename, getManagedMediaDirectoryUris, isAppOwnedImageUri } from '@/utils/imageCache';
import { createStoredZip, extractStoredZipToDirectory, readFileBytes } from '@/utils/zip';

const BACKUP_ROOT_DIRNAME = 'manual-backups';
const BACKUP_DATABASE_FILENAME = 'database.sqlite';
const BACKUP_IMAGES_DIRNAME = 'images';
const BACKUP_MANIFEST_FILENAME = 'manifest.json';
const ROLLBACK_LIVE_IMAGES_DIRNAME = 'images-live';
const STAGED_IMAGES_DIRNAME = 'images-staged';

const appVersion = Constants.expoConfig?.version ?? 'dev';

const getWorkingRootUri = (): string => {
  const base = LegacyFileSystem.cacheDirectory ?? LegacyFileSystem.documentDirectory;
  if (!base) {
    throw new Error('No writable directory is available on this device.');
  }
  return `${base}${BACKUP_ROOT_DIRNAME}/`;
};

const joinUri = (baseUri: string, name: string): string => `${baseUri.replace(/\/+$/, '')}/${name.replace(/^\/+/, '')}`;

const ensureCleanDirectory = async (uri: string) => {
  await LegacyFileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  await LegacyFileSystem.makeDirectoryAsync(uri, { intermediates: true });
};

const createWorkingDirectoryUri = async (prefix: string): Promise<string> => {
  const root = getWorkingRootUri();
  await LegacyFileSystem.makeDirectoryAsync(root, { intermediates: true });
  const uri = `${root}${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}/`;
  await ensureCleanDirectory(uri);
  return uri;
};

const collectFileEntries = async (rootUri: string, relativePrefix = ''): Promise<Array<{ path: string; uri: string }>> => {
  const names = await LegacyFileSystem.readDirectoryAsync(rootUri).catch(() => []);
  const entries: Array<{ path: string; uri: string }> = [];

  for (const name of names) {
    const uri = joinUri(rootUri, name);
    const info = await LegacyFileSystem.getInfoAsync(uri);
    const relativePath = relativePrefix ? `${relativePrefix}/${name}` : name;
    if (info.isDirectory) {
      entries.push(...(await collectFileEntries(`${uri.replace(/\/+$/, '')}/`, relativePath)));
    } else {
      entries.push({ path: relativePath, uri });
    }
  }

  return entries;
};

const formatBackupTimestamp = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
};

const getFriendlyBackupFilename = (date: Date) => `layetteout-backup-${formatBackupTimestamp(date)}.zip`;

const getManagedMediaDirectoryName = (uri: string): string => uri.replace(/\/+$/, '').split('/').pop() ?? 'images';
const getManagedMediaRootKey = (uri: string): 'document' | 'cache' => (
  uri.startsWith(LegacyFileSystem.cacheDirectory ?? '__never__') ? 'cache' : 'document'
);
const getManagedMediaBackupSubpath = (uri: string): string => `${getManagedMediaRootKey(uri)}/${getManagedMediaDirectoryName(uri)}`;

const collectManagedMediaEntries = async (): Promise<Array<{ path: string; uri: string }>> => {
  const directories = getManagedMediaDirectoryUris();
  const entries = await Promise.all(
    directories.map(async (directoryUri) => {
      const info = await LegacyFileSystem.getInfoAsync(directoryUri).catch(() => ({ exists: false, isDirectory: false }));
      if (!info.exists || !info.isDirectory) return [] as Array<{ path: string; uri: string }>;
      return collectFileEntries(directoryUri, `${BACKUP_IMAGES_DIRNAME}/${getManagedMediaBackupSubpath(directoryUri)}`);
    }),
  );
  return entries.flat();
};

const countManagedMediaFiles = async (rootUri: string): Promise<number> => {
  const entries = await collectFileEntries(rootUri);
  return entries.length;
};

const createManifest = (schemaVersion: number, exportedAt: Date, itemCount: number, imageCount: number): BackupManifest => ({
  appVersion,
  schemaVersion,
  exportedAt: exportedAt.toISOString(),
  itemCount,
  imageCount,
});

const assertRequiredRestoreContents = async (workingDirectoryUri: string): Promise<BackupManifest> => {
  const manifestUri = joinUri(workingDirectoryUri, BACKUP_MANIFEST_FILENAME);
  const databaseUri = joinUri(workingDirectoryUri, BACKUP_DATABASE_FILENAME);
  const imagesUri = joinUri(workingDirectoryUri, BACKUP_IMAGES_DIRNAME);

  const [manifestInfo, databaseInfo, imagesInfo] = await Promise.all([
    LegacyFileSystem.getInfoAsync(manifestUri),
    LegacyFileSystem.getInfoAsync(databaseUri),
    LegacyFileSystem.getInfoAsync(imagesUri),
  ]);

  if (!manifestInfo.exists || !databaseInfo.exists || !imagesInfo.exists || !imagesInfo.isDirectory) {
    throw new Error('Backup zip is missing one or more required files.');
  }

  const rawManifest = await new File(manifestUri).text();
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(rawManifest) as BackupManifest;
  } catch {
    throw new Error('Backup manifest could not be read.');
  }

  if (
    !manifest.exportedAt
    || !manifest.appVersion
    || !Number.isFinite(manifest.schemaVersion)
    || !Number.isFinite(manifest.itemCount)
    || !Number.isFinite(manifest.imageCount)
  ) {
    throw new Error('Backup manifest is missing required metadata.');
  }

  if (manifest.schemaVersion > getLatestSchemaVersion()) {
    throw new Error(`This backup uses schema v${manifest.schemaVersion}, which is newer than this app can restore.`);
  }

  return manifest;
};

const openDatabaseAtUri = async (databaseUri: string) => {
  const normalized = databaseUri.replace(/^file:\/\//, '');
  const pieces = normalized.split('/');
  const fileName = pieces.pop();
  if (!fileName) {
    throw new Error('Backup database path is invalid.');
  }
  const directory = `file://${pieces.join('/')}/`;
  return SQLite.openDatabaseAsync(fileName, undefined, directory);
};

const rebindManagedUri = async (value?: string | null): Promise<string | null> => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  if (!isAppOwnedImageUri(trimmed)) return trimmed;
  const rebound = await findPersistedImageByFilename(trimmed);
  return rebound ?? trimmed;
};

const rebindManagedUriList = async (raw: string | null): Promise<string | null> => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return raw;
    const rebound = await Promise.all(parsed.map((entry) => rebindManagedUri(entry)));
    return JSON.stringify(rebound.filter((entry): entry is string => Boolean(entry)));
  } catch {
    return raw;
  }
};

const rebindRestoredManagedMediaUris = async (db: Awaited<ReturnType<typeof getDb>>) => {
  const itemRows = await db.getAllAsync<{ id: string; imageUrl: string | null; imageUrls: string | null; cachedImageUri: string | null; bstSelectedPhotoUri: string | null }>(
    'SELECT id, imageUrl, imageUrls, cachedImageUri, bstSelectedPhotoUri FROM items;',
  );
  for (const row of itemRows) {
    await db.runAsync(
      'UPDATE items SET imageUrl = ?, imageUrls = ?, cachedImageUri = ?, bstSelectedPhotoUri = ? WHERE id = ?;',
      await rebindManagedUri(row.imageUrl),
      await rebindManagedUriList(row.imageUrls),
      await rebindManagedUri(row.cachedImageUri),
      await rebindManagedUri(row.bstSelectedPhotoUri),
      row.id,
    );
  }

  const childRows = await db.getAllAsync<{ id: string; photoUri: string | null }>('SELECT id, photoUri FROM children;');
  for (const row of childRows) {
    await db.runAsync('UPDATE children SET photoUri = ? WHERE id = ?;', await rebindManagedUri(row.photoUri), row.id);
  }

  const outfitRows = await db.getAllAsync<{ id: string; previewUri: string | null }>('SELECT id, previewUri FROM outfits;');
  for (const row of outfitRows) {
    await db.runAsync('UPDATE outfits SET previewUri = ? WHERE id = ?;', await rebindManagedUri(row.previewUri), row.id);
  }

  const draftRows = await db.getAllAsync<{ id: string; customHeaderImageUri: string | null }>('SELECT id, customHeaderImageUri FROM sale_drafts;');
  for (const row of draftRows) {
    await db.runAsync('UPDATE sale_drafts SET customHeaderImageUri = ? WHERE id = ?;', await rebindManagedUri(row.customHeaderImageUri), row.id);
  }

  const draftItemRows = await db.getAllAsync<{ id: string; selectedPhotoUri: string | null }>('SELECT id, selectedPhotoUri FROM sale_draft_items;');
  for (const row of draftItemRows) {
    await db.runAsync('UPDATE sale_draft_items SET selectedPhotoUri = ? WHERE id = ?;', await rebindManagedUri(row.selectedPhotoUri), row.id);
  }
};

const copyImagesDirectory = async (fromUri: string, toUri: string) => {
  await LegacyFileSystem.deleteAsync(toUri, { idempotent: true }).catch(() => undefined);
  await LegacyFileSystem.makeDirectoryAsync(toUri, { intermediates: true });
  const entries = await LegacyFileSystem.readDirectoryAsync(fromUri).catch(() => []);
  for (const entry of entries) {
    await LegacyFileSystem.copyAsync({
      from: joinUri(fromUri, entry),
      to: joinUri(toUri, entry),
    });
  }
};

const ensureParentDirectoryForUri = async (uri: string) => {
  const trimmed = uri.replace(/\/+$/, '');
  const parent = trimmed.slice(0, trimmed.lastIndexOf('/'));
  if (!parent) return;
  await LegacyFileSystem.makeDirectoryAsync(`${parent}/`, { intermediates: true }).catch(() => undefined);
};

const stageManagedMediaDirectories = async (extractedImagesRootUri: string, stagedImagesRootUri: string) => {
  await LegacyFileSystem.deleteAsync(stagedImagesRootUri, { idempotent: true }).catch(() => undefined);
  await LegacyFileSystem.makeDirectoryAsync(stagedImagesRootUri, { intermediates: true });
  for (const liveDirectoryUri of getManagedMediaDirectoryUris()) {
    const backupSubpath = getManagedMediaBackupSubpath(liveDirectoryUri);
    const extractedDirectoryUri = joinUri(extractedImagesRootUri, backupSubpath);
    const stagedDirectoryUri = joinUri(stagedImagesRootUri, backupSubpath);
    const extractedInfo = await LegacyFileSystem.getInfoAsync(extractedDirectoryUri).catch(() => ({ exists: false, isDirectory: false }));
    if (extractedInfo.exists && extractedInfo.isDirectory) {
      await copyImagesDirectory(extractedDirectoryUri, stagedDirectoryUri);
    } else {
      await LegacyFileSystem.deleteAsync(stagedDirectoryUri, { idempotent: true }).catch(() => undefined);
      await LegacyFileSystem.makeDirectoryAsync(stagedDirectoryUri, { intermediates: true });
    }
  }
};

const copyManagedMediaDirectoriesToRoot = async (destinationRootUri: string) => {
  await LegacyFileSystem.deleteAsync(destinationRootUri, { idempotent: true }).catch(() => undefined);
  await LegacyFileSystem.makeDirectoryAsync(destinationRootUri, { intermediates: true });
  for (const liveDirectoryUri of getManagedMediaDirectoryUris()) {
    const destinationDirectoryUri = joinUri(destinationRootUri, getManagedMediaBackupSubpath(liveDirectoryUri));
    const liveInfo = await LegacyFileSystem.getInfoAsync(liveDirectoryUri).catch(() => ({ exists: false, isDirectory: false }));
    if (liveInfo.exists && liveInfo.isDirectory) {
      await copyImagesDirectory(liveDirectoryUri, destinationDirectoryUri);
    } else {
      await LegacyFileSystem.makeDirectoryAsync(destinationDirectoryUri, { intermediates: true });
    }
  }
};

const swapManagedMediaDirectories = async (sourceRootUri: string, rollbackRootUri: string) => {
  await LegacyFileSystem.deleteAsync(rollbackRootUri, { idempotent: true }).catch(() => undefined);
  await LegacyFileSystem.makeDirectoryAsync(rollbackRootUri, { intermediates: true });

  const rollbackMoves: Array<{ liveUri: string; rollbackUri: string }> = [];
  const forwardMoves: Array<{ stagedUri: string; liveUri: string }> = [];

  try {
    for (const liveDirectoryUri of getManagedMediaDirectoryUris()) {
      const backupSubpath = getManagedMediaBackupSubpath(liveDirectoryUri);
      const rollbackDirectoryUri = joinUri(rollbackRootUri, backupSubpath);
      const stagedDirectoryUri = joinUri(sourceRootUri, backupSubpath);
      const liveInfo = await LegacyFileSystem.getInfoAsync(liveDirectoryUri).catch(() => ({ exists: false, isDirectory: false }));
      const stagedInfo = await LegacyFileSystem.getInfoAsync(stagedDirectoryUri).catch(() => ({ exists: false, isDirectory: false }));

      await ensureParentDirectoryForUri(rollbackDirectoryUri);
      await LegacyFileSystem.deleteAsync(rollbackDirectoryUri, { idempotent: true }).catch(() => undefined);
      if (liveInfo.exists) {
        await LegacyFileSystem.moveAsync({ from: liveDirectoryUri, to: rollbackDirectoryUri });
        rollbackMoves.push({ liveUri: liveDirectoryUri, rollbackUri: rollbackDirectoryUri });
      }

      if (stagedInfo.exists) {
        await LegacyFileSystem.moveAsync({ from: stagedDirectoryUri, to: liveDirectoryUri });
      } else {
        await LegacyFileSystem.makeDirectoryAsync(liveDirectoryUri, { intermediates: true });
      }
      forwardMoves.push({ stagedUri: stagedDirectoryUri, liveUri: liveDirectoryUri });
    }
  } catch (error) {
    for (const move of forwardMoves.reverse()) {
      const liveInfo = await LegacyFileSystem.getInfoAsync(move.liveUri).catch(() => ({ exists: false }));
      if (liveInfo.exists) {
        await LegacyFileSystem.deleteAsync(move.liveUri, { idempotent: true }).catch(() => undefined);
      }
    }
    for (const move of rollbackMoves.reverse()) {
      const rollbackInfo = await LegacyFileSystem.getInfoAsync(move.rollbackUri).catch(() => ({ exists: false }));
      if (rollbackInfo.exists) {
        await LegacyFileSystem.moveAsync({ from: move.rollbackUri, to: move.liveUri }).catch(() => undefined);
      }
    }
    throw error;
  }
};

const createRollbackCopy = async (rollbackDirectoryUri: string) => {
  const rollbackDatabaseUri = joinUri(rollbackDirectoryUri, BACKUP_DATABASE_FILENAME);
  const rollbackImagesUri = joinUri(rollbackDirectoryUri, ROLLBACK_LIVE_IMAGES_DIRNAME);
  const liveDb = await getDb();
  const rollbackDb = await openDatabaseAtUri(rollbackDatabaseUri);
  try {
    await SQLite.backupDatabaseAsync({
      sourceDatabase: liveDb,
      destDatabase: rollbackDb,
    });
  } finally {
    await rollbackDb.closeAsync().catch(() => undefined);
  }

  await copyManagedMediaDirectoriesToRoot(rollbackImagesUri);
};

export const exportBackupArchive = async (): Promise<BackupExportResult> => {
  await initDatabase();
  const now = new Date();
  const [db, schemaVersion, data, imageEntries] = await Promise.all([
    getDb(),
    getCurrentSchemaVersion(),
    repository.getAll(),
    collectManagedMediaEntries(),
  ]);
  const manifest = createManifest(schemaVersion, now, data.items.length, imageEntries.length);
  const databaseBytes = await db.serializeAsync();

  const zipEntries = [
    {
      path: BACKUP_DATABASE_FILENAME,
      data: databaseBytes,
    },
    {
      path: `${BACKUP_IMAGES_DIRNAME}/`,
      isDirectory: true,
    },
    {
      path: BACKUP_MANIFEST_FILENAME,
      data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    },
    ...await Promise.all(imageEntries.map(async (entry) => ({
      path: entry.path,
      data: await readFileBytes(entry.uri),
    }))),
  ];

  const zipBytes = createStoredZip(zipEntries);
  const outputDirectoryUri = await createWorkingDirectoryUri('export');
  const archiveUri = joinUri(outputDirectoryUri, getFriendlyBackupFilename(now));
  const archiveFile = new File(archiveUri);
  archiveFile.create({ intermediates: true, overwrite: true });
  archiveFile.write(zipBytes);

  await repository.updateSettings({ lastBackupAt: now.getTime() });

  return {
    archiveUri,
    manifest,
  };
};

export const shareBackupArchive = async (archiveUri: string) => {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(archiveUri, {
    mimeType: 'application/zip',
    dialogTitle: 'Export Layette Out Backup',
  });
};

export const prepareBackupRestore = async (archiveUri: string): Promise<BackupRestorePreview> => {
  const workingDirectoryUri = await createWorkingDirectoryUri('restore');
  const zipBytes = await readFileBytes(archiveUri);
  await extractStoredZipToDirectory(zipBytes, workingDirectoryUri);
  const manifest = await assertRequiredRestoreContents(workingDirectoryUri);
  const extractedImageCount = await countManagedMediaFiles(joinUri(workingDirectoryUri, BACKUP_IMAGES_DIRNAME));
  if (extractedImageCount !== manifest.imageCount) {
    throw new Error('Backup image count does not match the manifest.');
  }
  return {
    manifest,
    workingDirectoryUri,
  };
};

export const cleanupPreparedBackupRestore = async (preview?: BackupRestorePreview) => {
  if (!preview?.workingDirectoryUri) return;
  await LegacyFileSystem.deleteAsync(preview.workingDirectoryUri, { idempotent: true }).catch(() => undefined);
};

export const restorePreparedBackup = async (preview: BackupRestorePreview): Promise<BackupManifest> => {
  await initDatabase();

  const manifest = await assertRequiredRestoreContents(preview.workingDirectoryUri);
  const extractedDatabaseUri = joinUri(preview.workingDirectoryUri, BACKUP_DATABASE_FILENAME);
  const extractedImagesUri = joinUri(preview.workingDirectoryUri, BACKUP_IMAGES_DIRNAME);
  const rollbackDirectoryUri = await createWorkingDirectoryUri('rollback');
  const stagedImagesRootUri = joinUri(preview.workingDirectoryUri, STAGED_IMAGES_DIRNAME);
  let rollbackReady = false;

  try {
    const extractedDb = await openDatabaseAtUri(extractedDatabaseUri);
    try {
      const versionRow = await extractedDb.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      const backupSchemaVersion = versionRow?.user_version ?? 0;
      const itemCountRow = await extractedDb.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM items WHERE deletedAt IS NULL;');
      if (backupSchemaVersion !== manifest.schemaVersion) {
        throw new Error('Backup manifest does not match the database schema version.');
      }
      if ((itemCountRow?.count ?? 0) !== manifest.itemCount) {
        throw new Error('Backup item count does not match the manifest.');
      }
      await createRollbackCopy(rollbackDirectoryUri);
      rollbackReady = true;
      await stageManagedMediaDirectories(extractedImagesUri, stagedImagesRootUri);

      const liveDb = await getDb();
      await SQLite.backupDatabaseAsync({
        sourceDatabase: extractedDb,
        destDatabase: liveDb,
      });
      await swapManagedMediaDirectories(stagedImagesRootUri, joinUri(rollbackDirectoryUri, ROLLBACK_LIVE_IMAGES_DIRNAME));
      await rebindRestoredManagedMediaUris(liveDb);
    } finally {
      await extractedDb.closeAsync().catch(() => undefined);
    }

    await resetDatabaseConnection();
    await initDatabase();
    return manifest;
  } catch (error) {
    if (rollbackReady) {
      try {
        const rollbackDatabaseUri = joinUri(rollbackDirectoryUri, BACKUP_DATABASE_FILENAME);
        const rollbackImagesUri = joinUri(rollbackDirectoryUri, ROLLBACK_LIVE_IMAGES_DIRNAME);
        await resetDatabaseConnection();
        const liveDb = await getDb();
        const rollbackDb = await openDatabaseAtUri(rollbackDatabaseUri);
        try {
          await SQLite.backupDatabaseAsync({
            sourceDatabase: rollbackDb,
            destDatabase: liveDb,
          });
        } finally {
          await rollbackDb.closeAsync().catch(() => undefined);
        }

        await swapManagedMediaDirectories(rollbackImagesUri, joinUri(rollbackDirectoryUri, 'rollback-second-chance'));
      } catch {
        // Best-effort rollback after restore failure.
      }
    }
    await resetDatabaseConnection();
    await initDatabase().catch(() => undefined);
    throw error;
  } finally {
    await LegacyFileSystem.deleteAsync(stagedImagesRootUri, { idempotent: true }).catch(() => undefined);
    await LegacyFileSystem.deleteAsync(rollbackDirectoryUri, { idempotent: true }).catch(() => undefined);
  }
};
