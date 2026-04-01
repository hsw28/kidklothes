import { BstCollageGridSize } from '@/models';

export const resolveCollagePageSize = (gridSize: BstCollageGridSize, itemCount: number): number => {
  if (gridSize !== 'Auto') return Number(gridSize);
  if (itemCount <= 2) return 2;
  if (itemCount <= 4) return 4;
  if (itemCount <= 6) return 6;
  return 8;
};

export const paginateForCollage = <T,>(items: T[], gridSize: BstCollageGridSize): T[][] => {
  const pageSize = resolveCollagePageSize(gridSize, items.length);
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += pageSize) {
    pages.push(items.slice(index, index + pageSize));
  }
  return pages;
};

export const getCollageColumnCount = (pageSize: number): number => {
  return 2;
};

export const chunkForCollageRows = <T,>(items: T[], columns: number): T[][] => {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns));
  }
  return rows;
};
