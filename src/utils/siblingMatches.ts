import { Child, Item } from '@/models';
import { getItemDisplayImageUri } from '@/utils/itemMedia';
import { normalizePrintName } from '@/utils/printName';
import { normalizeStyleName } from '@/utils/styleName';

export type SiblingMatchGroupItem = {
  childId: string;
  childName: string;
  size: string;
  itemId: string;
  image?: string;
};

export type SiblingMatchMissingChild = {
  childId: string;
  childName: string;
};

export type SiblingMatchGroup = {
  groupId: string;
  label: string;
  items: SiblingMatchGroupItem[];
  childrenPresent: string[];
  missingChildren: SiblingMatchMissingChild[];
  representativeItemId: string;
  representativeImage?: string;
  completeness: number;
  totalChildren: number;
  kind: 'print' | 'style';
  matchType: 'full_match' | 'partial_match';
};

const normalize = (value?: string | null) => (value ?? '').trim();
const normalizeGroupBrand = (value?: string | null) => normalize(value).toLowerCase().replace(/\s+/g, ' ');

const getGroupingKey = (item: Item): { key?: string; label?: string; kind?: 'print' | 'style' } => {
  const brandKey = normalizeGroupBrand(item.brand);
  const brandLabel = normalize(item.brand);
  const printKey = normalize(item.printNameNorm) || normalizePrintName(item.printName ?? '');
  if (printKey) {
    return {
      key: `print:${printKey}:${brandKey || 'unbranded'}`,
      label: [normalize(item.printName) || normalize(item.styleName) || normalize(item.title) || 'Matching print', brandLabel]
        .filter(Boolean)
        .join(' · '),
      kind: 'print',
    };
  }

  const styleLabel = normalize(item.styleName) || normalize(item.title);
  const styleKey = normalizeStyleName(styleLabel);
  if (styleKey) {
    return {
      key: `style:${styleKey}:${brandKey || 'unbranded'}`,
      label: [styleLabel, brandLabel].filter(Boolean).join(' · '),
      kind: 'style',
    };
  }

  return {};
};

export const groupItemsByStyle = (items: Item[], children: Child[]): SiblingMatchGroup[] => {
  const visibleChildren = children.filter((child) => !child.deletedAt);
  if (visibleChildren.length < 2) return [];

  const childrenById = new Map(visibleChildren.map((child) => [child.id, child]));
  const grouped = new Map<string, {
    key: string;
    label: string;
    kind: 'print' | 'style';
    items: SiblingMatchGroupItem[];
    childrenPresent: Set<string>;
    representativeItemId: string;
    representativeImage?: string;
  }>();

  items
    .filter((item) => item.status === 'owned' && !item.deletedAt)
    .forEach((item) => {
      const grouping = getGroupingKey(item);
      if (!grouping.key || !grouping.label || !grouping.kind) return;

      const childIds = Array.from(new Set((item.childIds ?? []).filter((childId) => childrenById.has(childId))));
      if (!childIds.length) return;

      const existing = grouped.get(grouping.key) ?? {
        key: grouping.key,
        label: grouping.label,
        kind: grouping.kind,
        items: [],
        childrenPresent: new Set<string>(),
        representativeItemId: item.id,
        representativeImage: getItemDisplayImageUri(item),
      };

      childIds.forEach((childId) => {
        const child = childrenById.get(childId);
        if (!child) return;
        existing.childrenPresent.add(childId);
        existing.items.push({
          childId,
          childName: child.name,
          size: normalize(item.size) || 'N/A',
          itemId: item.id,
          image: getItemDisplayImageUri(item),
        });
      });

      grouped.set(grouping.key, existing);
    });

  return Array.from(grouped.values())
    .filter((group) => group.childrenPresent.size >= 2)
    .map((group) => {
      const missingChildren = visibleChildren
        .filter((child) => !group.childrenPresent.has(child.id))
        .map((child) => ({ childId: child.id, childName: child.name }));
      const itemsForDisplay = group.items.slice().sort((a, b) => a.childName.localeCompare(b.childName) || a.size.localeCompare(b.size));
      const matchType: SiblingMatchGroup['matchType'] = missingChildren.length > 0 ? 'partial_match' : 'full_match';
      return {
        groupId: group.key,
        label: group.label,
        items: itemsForDisplay,
        childrenPresent: Array.from(group.childrenPresent),
        missingChildren,
        representativeItemId: group.representativeItemId,
        representativeImage: group.representativeImage || itemsForDisplay[0]?.image,
        completeness: group.childrenPresent.size / visibleChildren.length,
        totalChildren: visibleChildren.length,
        kind: group.kind,
        matchType,
      };
    })
    .sort((a, b) =>
      b.childrenPresent.length - a.childrenPresent.length
      || a.missingChildren.length - b.missingChildren.length
      || b.items.length - a.items.length
      || a.label.localeCompare(b.label));
};

export const splitSiblingMatchGroups = (groups: SiblingMatchGroup[]) => ({
  complete: groups.filter((group) => group.matchType === 'full_match'),
  missing: groups.filter((group) => group.matchType === 'partial_match'),
});

export const getSiblingMatchVisibleState = (
  groups: SiblingMatchGroup[],
  hasProAccess: boolean,
  freeLimit = 3,
) => ({
  visibleGroups: hasProAccess ? groups : [],
  lockedGroups: hasProAccess ? [] : groups.slice(0, freeLimit),
  freeLimit,
});
