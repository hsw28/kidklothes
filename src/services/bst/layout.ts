export const getCollageColumnCount = (itemCount: number): number => {
  if (itemCount <= 4) return 2;
  if (itemCount <= 9) return 3;
  return 4;
};

export const chunkForCollageRows = <T,>(items: T[], columns: number): T[][] => {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns));
  }
  return rows;
};
