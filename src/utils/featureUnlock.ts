import { AppSettings, Child, ChildItem, Item } from '@/models';

export const isAdvancedUnlocked = (settings: AppSettings, children: Child[], childItems: ChildItem[], items: Item[]) => {
  if (settings.advancedFeaturesUnlocked) return true;
  if (items.length >= 20) return true;
  const byChild = new Map<string, number>();
  childItems.forEach((link) => byChild.set(link.childId, (byChild.get(link.childId) ?? 0) + 1));
  return children.some((child) => (byChild.get(child.id) ?? 0) >= 12);
};
