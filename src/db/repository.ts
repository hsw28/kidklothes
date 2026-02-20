import { Child, ID, Item, Outfit } from '@/models';
import { makeId } from '@/utils/id';
import { getDb, initDatabase } from './sqlite';

export interface NewChildInput {
  name: string;
  notes?: string;
}

export interface NewItemInput {
  childId: ID;
  url?: string;
  brand?: string;
  title: string;
  imageUrl?: string;
  clothingType: Item['clothingType'];
  size: string;
  status: Item['status'];
  tags?: string[];
  notes?: string;
}

export interface NewOutfitInput {
  childId: ID;
  name: string;
  itemIds: ID[];
  notes?: string;
  previewUri?: string;
}

interface StoreState {
  children: Child[];
  items: Item[];
  outfits: Outfit[];
}

type ChildRow = {
  id: string;
  name: string;
  notes: string | null;
  createdAt: number;
};

type ItemRow = {
  id: string;
  childId: string;
  url: string | null;
  brand: string | null;
  title: string | null;
  imageUrl: string | null;
  clothingType: string;
  size: string;
  status: string | null;
  tags: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
};

type OutfitRow = {
  id: string;
  childId: string;
  name: string;
  itemIds: string;
  notes: string | null;
  previewUri: string | null;
  createdAt: number;
};

const parseTags = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
};

const parseItemIds = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
};

const mapChild = (row: ChildRow): Child => ({
  id: row.id,
  name: row.name,
  notes: row.notes ?? undefined,
  createdAt: row.createdAt,
});

const mapItem = (row: ItemRow): Item => ({
  id: row.id,
  childId: row.childId,
  url: row.url ?? undefined,
  brand: row.brand ?? undefined,
  title: row.title ?? '',
  imageUrl: row.imageUrl ?? undefined,
  clothingType: row.clothingType as Item['clothingType'],
  size: row.size,
  status: (row.status ?? 'wishlist') as Item['status'],
  tags: parseTags(row.tags),
  notes: row.notes ?? undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const mapOutfit = (row: OutfitRow): Outfit => ({
  id: row.id,
  childId: row.childId,
  name: row.name,
  itemIds: parseItemIds(row.itemIds),
  notes: row.notes ?? undefined,
  previewUri: row.previewUri ?? undefined,
  createdAt: row.createdAt,
});

export const repository = {
  async init() {
    await initDatabase();
  },

  async getAll(): Promise<StoreState> {
    await initDatabase();
    const db = await getDb();

    const [childrenRows, itemRows, outfitRows] = await Promise.all([
      db.getAllAsync<ChildRow>('SELECT id, name, notes, createdAt FROM children ORDER BY createdAt DESC;'),
      db.getAllAsync<ItemRow>('SELECT * FROM items ORDER BY updatedAt DESC;'),
      db.getAllAsync<OutfitRow>('SELECT * FROM outfits ORDER BY createdAt DESC;'),
    ]);

    return {
      children: childrenRows.map(mapChild),
      items: itemRows.map(mapItem),
      outfits: outfitRows.map(mapOutfit),
    };
  },

  async getChildren(): Promise<Child[]> {
    await initDatabase();
    const db = await getDb();
    const rows = await db.getAllAsync<ChildRow>('SELECT id, name, notes, createdAt FROM children ORDER BY createdAt DESC;');
    return rows.map(mapChild);
  },

  async getChildById(id: ID): Promise<Child | undefined> {
    await initDatabase();
    const db = await getDb();
    const row = await db.getFirstAsync<ChildRow>('SELECT id, name, notes, createdAt FROM children WHERE id = ?;', id);
    return row ? mapChild(row) : undefined;
  },

  async addChild(input: NewChildInput): Promise<Child> {
    await initDatabase();
    const db = await getDb();
    const child: Child = {
      id: makeId(),
      name: input.name.trim(),
      notes: input.notes?.trim() || undefined,
      createdAt: Date.now(),
    };

    await db.runAsync(
      'INSERT INTO children (id, name, notes, createdAt) VALUES (?, ?, ?, ?);',
      child.id,
      child.name,
      child.notes ?? null,
      child.createdAt,
    );

    return child;
  },

  async updateChild(id: ID, patch: Partial<NewChildInput>): Promise<Child | undefined> {
    const existing = await repository.getChildById(id);
    if (!existing) return undefined;

    await initDatabase();
    const db = await getDb();
    const updated: Child = {
      ...existing,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      notes: patch.notes !== undefined ? patch.notes.trim() || undefined : existing.notes,
    };

    await db.runAsync(
      'UPDATE children SET name = ?, notes = ? WHERE id = ?;',
      updated.name,
      updated.notes ?? null,
      id,
    );

    return updated;
  },

  async deleteChild(id: ID): Promise<void> {
    await initDatabase();
    const db = await getDb();
    await db.runAsync('DELETE FROM children WHERE id = ?;', id);
  },

  async getItems(): Promise<Item[]> {
    await initDatabase();
    const db = await getDb();
    const rows = await db.getAllAsync<ItemRow>('SELECT * FROM items ORDER BY updatedAt DESC;');
    return rows.map(mapItem);
  },

  async getItemById(id: ID): Promise<Item | undefined> {
    await initDatabase();
    const db = await getDb();
    const row = await db.getFirstAsync<ItemRow>('SELECT * FROM items WHERE id = ?;', id);
    return row ? mapItem(row) : undefined;
  },

  async addItem(input: NewItemInput): Promise<Item> {
    await initDatabase();
    const db = await getDb();
    const now = Date.now();
    const item: Item = {
      id: makeId(),
      childId: input.childId,
      url: input.url?.trim() || undefined,
      brand: input.brand?.trim() || undefined,
      title: input.title.trim(),
      imageUrl: input.imageUrl?.trim() || undefined,
      clothingType: input.clothingType,
      size: input.size.trim(),
      status: input.status,
      tags: input.tags ?? [],
      notes: input.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    await db.runAsync(
      `INSERT INTO items (
        id, childId, url, brand, title, imageUrl, clothingType, size, status, tags, notes, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      item.id,
      item.childId,
      item.url ?? null,
      item.brand ?? null,
      item.title,
      item.imageUrl ?? null,
      item.clothingType,
      item.size,
      item.status,
      JSON.stringify(item.tags),
      item.notes ?? null,
      item.createdAt,
      item.updatedAt,
    );

    return item;
  },

  async updateItem(id: ID, patch: Partial<NewItemInput>): Promise<Item | undefined> {
    const existing = await repository.getItemById(id);
    if (!existing) return undefined;

    await initDatabase();
    const db = await getDb();
    const updated: Item = {
      ...existing,
      childId: patch.childId ?? existing.childId,
      url: patch.url !== undefined ? patch.url.trim() || undefined : existing.url,
      brand: patch.brand !== undefined ? patch.brand.trim() || undefined : existing.brand,
      title: patch.title !== undefined ? patch.title.trim() : existing.title,
      imageUrl: patch.imageUrl !== undefined ? patch.imageUrl.trim() || undefined : existing.imageUrl,
      clothingType: patch.clothingType ?? existing.clothingType,
      size: patch.size !== undefined ? patch.size.trim() : existing.size,
      status: patch.status ?? existing.status,
      tags: patch.tags ?? existing.tags,
      notes: patch.notes !== undefined ? patch.notes.trim() || undefined : existing.notes,
      updatedAt: Date.now(),
    };

    await db.runAsync(
      `UPDATE items SET
        childId = ?,
        url = ?,
        brand = ?,
        title = ?,
        imageUrl = ?,
        clothingType = ?,
        size = ?,
        status = ?,
        tags = ?,
        notes = ?,
        updatedAt = ?
      WHERE id = ?;`,
      updated.childId,
      updated.url ?? null,
      updated.brand ?? null,
      updated.title,
      updated.imageUrl ?? null,
      updated.clothingType,
      updated.size,
      updated.status,
      JSON.stringify(updated.tags),
      updated.notes ?? null,
      updated.updatedAt,
      id,
    );

    return updated;
  },

  async deleteItem(id: ID): Promise<void> {
    await initDatabase();
    const db = await getDb();

    await db.runAsync('DELETE FROM items WHERE id = ?;', id);

    const outfitRows = await db.getAllAsync<OutfitRow>('SELECT * FROM outfits;');
    await Promise.all(
      outfitRows.map(async (row) => {
        const nextItemIds = parseItemIds(row.itemIds).filter((entry) => entry !== id);
        if (nextItemIds.length === parseItemIds(row.itemIds).length) return;
        await db.runAsync('UPDATE outfits SET itemIds = ? WHERE id = ?;', JSON.stringify(nextItemIds), row.id);
      }),
    );
  },

  async getOutfits(): Promise<Outfit[]> {
    await initDatabase();
    const db = await getDb();
    const rows = await db.getAllAsync<OutfitRow>('SELECT * FROM outfits ORDER BY createdAt DESC;');
    return rows.map(mapOutfit);
  },

  async getOutfitById(id: ID): Promise<Outfit | undefined> {
    await initDatabase();
    const db = await getDb();
    const row = await db.getFirstAsync<OutfitRow>('SELECT * FROM outfits WHERE id = ?;', id);
    return row ? mapOutfit(row) : undefined;
  },

  async addOutfit(input: NewOutfitInput): Promise<Outfit> {
    await initDatabase();
    const db = await getDb();
    const outfit: Outfit = {
      id: makeId(),
      childId: input.childId,
      name: input.name.trim(),
      itemIds: input.itemIds,
      notes: input.notes?.trim() || undefined,
      previewUri: input.previewUri?.trim() || undefined,
      createdAt: Date.now(),
    };

    await db.runAsync(
      'INSERT INTO outfits (id, childId, name, itemIds, notes, previewUri, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?);',
      outfit.id,
      outfit.childId,
      outfit.name,
      JSON.stringify(outfit.itemIds),
      outfit.notes ?? null,
      outfit.previewUri ?? null,
      outfit.createdAt,
    );

    return outfit;
  },

  async updateOutfit(id: ID, patch: Partial<NewOutfitInput>): Promise<Outfit | undefined> {
    const existing = await repository.getOutfitById(id);
    if (!existing) return undefined;

    await initDatabase();
    const db = await getDb();
    const updated: Outfit = {
      ...existing,
      childId: patch.childId ?? existing.childId,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      itemIds: patch.itemIds ?? existing.itemIds,
      notes: patch.notes !== undefined ? patch.notes.trim() || undefined : existing.notes,
      previewUri: patch.previewUri !== undefined ? patch.previewUri.trim() || undefined : existing.previewUri,
    };

    await db.runAsync(
      `UPDATE outfits SET
        childId = ?,
        name = ?,
        itemIds = ?,
        notes = ?,
        previewUri = ?
      WHERE id = ?;`,
      updated.childId,
      updated.name,
      JSON.stringify(updated.itemIds),
      updated.notes ?? null,
      updated.previewUri ?? null,
      id,
    );

    return updated;
  },

  async deleteOutfit(id: ID): Promise<void> {
    await initDatabase();
    const db = await getDb();
    await db.runAsync('DELETE FROM outfits WHERE id = ?;', id);
  },
};
