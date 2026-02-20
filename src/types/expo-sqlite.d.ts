declare module 'expo-sqlite' {
  export interface SQLiteDatabase {
    execAsync(sql: string): Promise<void>;
    runAsync(sql: string, ...params: Array<string | number | null>): Promise<unknown>;
    getAllAsync<T>(sql: string, ...params: Array<string | number | null>): Promise<T[]>;
    getFirstAsync<T>(sql: string, ...params: Array<string | number | null>): Promise<T | null>;
  }

  export function openDatabaseAsync(name: string): Promise<SQLiteDatabase>;
}
