# Manual Backup / Restore QA

## Included in backup

- SQLite database
- App-managed media directories:
  - `layetteout-images/`
  - `outfit-previews/`
  - `bst-exports/`
  - legacy `layetteout-photos/` when present

## Explicit exclusions

- iOS/Android system cache locations outside the app-managed directories
- Temporary share-extension app-group values such as `pendingSharePayload`
- Derived app-group counters such as `childCount`
- Photos saved out to the user’s system photo library
- Third-party remote image URLs themselves; only the app-owned local copies are included
- Arbitrary local file URIs that were never copied into an app-managed directory

## Success path

1. Create or update a few items with photos.
2. Create an outfit so `outfit-previews/` is populated.
3. Generate BST assets so `bst-exports/` is populated.
4. Export a backup from Settings.
5. Confirm the share sheet opens and the filename matches `layetteout-backup-YYYY-MM-DD-HHmm.zip`.
6. Save the zip to Files.
7. Delete or edit some local data in the app.
8. Restore from the saved backup.
9. Confirm the restore preview shows export date, app version, schema version, item count, and image count.
10. Complete restore and verify the success toast appears.
11. Verify items, photos, outfit previews, and BST exports are present again.
12. Force-close and relaunch the app.
13. Confirm the app launches cleanly and the same images still resolve.

## Corrupted zip

1. Duplicate a valid backup zip.
2. Corrupt it by truncating bytes or editing contents externally.
3. Attempt restore.
4. Confirm restore fails with an error toast.
5. Confirm existing app data and images are unchanged.

## Missing manifest

1. Open a valid backup zip externally and remove `manifest.json`.
2. Attempt restore.
3. Confirm restore fails before any data is replaced.
4. Confirm existing app data and images are unchanged.

## Missing database

1. Open a valid backup zip externally and remove `database.sqlite`.
2. Attempt restore.
3. Confirm restore fails before any data is replaced.
4. Confirm existing app data and images are unchanged.

## Schema mismatch

1. Open a valid backup zip externally.
2. Edit `manifest.json` so `schemaVersion` no longer matches the contained database, or set it above the app’s supported schema.
3. Attempt restore.
4. Confirm restore fails with a schema-related error.
5. Confirm existing app data and images are unchanged.

## Image restoration

1. Start from a backup with known item photos, outfit previews, and BST exports.
2. Restore the backup.
3. Visit item detail, lists, outfit screens, and BST preview surfaces.
4. Confirm all restored app-owned images render.

## Rollback after forced failure

1. Add a temporary dev-only throw inside the restore path after the database backup completes but before the media swap finishes.
2. Start restore with a valid backup.
3. Confirm restore fails.
4. Verify pre-restore items and app-owned media are still present.
5. Force-close and relaunch the app.
6. Confirm the app still opens with the pre-restore state intact.

## Force-close during restore

- Expected limitation: if the app is force-closed or the process is killed during restore, the app may reopen in either the old state or the new state depending on the exact interruption point. The feature is designed to recover cleanly during normal in-app failures, but force-close in the middle of restore is not guaranteed to be fully atomic.
