declare module 'expo-sqlite' {
  export interface SQLiteDatabase {
    databasePath?: string;
    closeAsync(): Promise<void>;
    execAsync(sql: string): Promise<void>;
    runAsync(sql: string, ...params: Array<string | number | null>): Promise<unknown>;
    getAllAsync<T>(sql: string, ...params: Array<string | number | null>): Promise<T[]>;
    getFirstAsync<T>(sql: string, ...params: Array<string | number | null>): Promise<T | null>;
    serializeAsync(databaseName?: string): Promise<Uint8Array>;
  }

  export const defaultDatabaseDirectory: string | null;
  export function openDatabaseAsync(name: string, options?: object, directory?: string): Promise<SQLiteDatabase>;
  export function deleteDatabaseAsync(name: string, directory?: string): Promise<void>;
  export function backupDatabaseAsync(options: {
    sourceDatabase: SQLiteDatabase;
    sourceDatabaseName?: string;
    destDatabase: SQLiteDatabase;
    destDatabaseName?: string;
  }): Promise<void>;
}
