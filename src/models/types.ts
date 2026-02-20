export type ID = string;

export type ClothingType =
  | 'sleeper'
  | 'romper'
  | 'top'
  | 'bottom'
  | 'dress'
  | 'outerwear'
  | 'shoes'
  | 'accessory';

export type ItemStatus = 'wishlist' | 'owned';

export interface Child {
  id: ID;
  name: string;
  notes?: string;
  createdAt: number;
}

export interface Item {
  id: ID;
  childId: ID;
  url?: string;
  brand?: string;
  title: string;
  imageUrl?: string;
  clothingType: ClothingType;
  size: string;
  status: ItemStatus;
  tags: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Outfit {
  id: ID;
  childId: ID;
  name: string;
  itemIds: ID[];
  notes?: string;
  previewUri?: string;
  createdAt: number;
}
