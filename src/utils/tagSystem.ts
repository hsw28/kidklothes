import { CustomTag, Item } from '@/models';
import { normalizeToken, normalizeWhitespace } from '@/utils/normalize';

export const PRESET_TAGS = [
  'Holiday',
  'Birthday',
  'Travel',
  'Special Occasion',
  'Daycare',
  'Outdoor',
  'Hand-me-down',
] as const;

export const SEASON_OPTIONS = ['Spring', 'Summer', 'Fall', 'Winter'] as const;

export type PresetTag = (typeof PRESET_TAGS)[number];
export type StructuredSeason = (typeof SEASON_OPTIONS)[number];

const presetTagKeyMap = Object.fromEntries(PRESET_TAGS.map((tag) => [normalizeToken(tag), tag])) as Record<string, PresetTag>;

const legacyPresetMappings: Record<string, PresetTag> = {
  school: 'Daycare',
  daycare: 'Daycare',
  holiday: 'Holiday',
  christmas: 'Holiday',
  halloween: 'Holiday',
  birthday: 'Birthday',
  party: 'Birthday',
  travel: 'Travel',
  vacation: 'Travel',
  outdoor: 'Outdoor',
  'hand me down': 'Hand-me-down',
  'handmedown': 'Hand-me-down',
  'hand me downs': 'Hand-me-down',
  'handmedowns': 'Hand-me-down',
  'hand me downs outfit': 'Hand-me-down',
  'hand me down outfit': 'Hand-me-down',
  'hand-me-down': 'Hand-me-down',
};

const seasonMappings: Record<string, StructuredSeason> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  autumn: 'Fall',
  winter: 'Winter',
};

export const normalizeTagDisplayName = (value: string) => normalizeWhitespace(value);
export const normalizeTagKey = (value: string) => normalizeToken(value);

export const normalizeCustomTagName = (value: string) => normalizeWhitespace(value);
export const normalizeCustomTagKey = (value: string) => normalizeToken(value);

export const isPresetTag = (value: string): value is PresetTag => Boolean(presetTagKeyMap[normalizeTagKey(value)]);
export const resolvePresetTag = (value: string): PresetTag | undefined => legacyPresetMappings[normalizeTagKey(value)] ?? presetTagKeyMap[normalizeTagKey(value)];

export const resolveStructuredSeason = (value: string): StructuredSeason | undefined => seasonMappings[normalizeTagKey(value)];

export const classifyItemTags = (
  tags: string[],
  customTags: Array<Pick<CustomTag, 'name' | 'normalizedName'>> = [],
) => {
  const presetSet = new Set<PresetTag>();
  const customByKey = new Map<string, string>();
  const mappedLegacyTags: Array<{ from: string; to: PresetTag }> = [];

  tags.forEach((rawTag) => {
    const display = normalizeTagDisplayName(rawTag);
    if (!display) return;
    const preset = resolvePresetTag(display);
    if (preset) {
      if (normalizeTagKey(display) !== normalizeTagKey(preset)) mappedLegacyTags.push({ from: display, to: preset });
      presetSet.add(preset);
      return;
    }
    const key = normalizeTagKey(display);
    if (!key) return;
    const known = customTags.find((entry) => entry.normalizedName === key);
    if (!customByKey.has(key)) customByKey.set(key, known?.name ?? display);
  });

  return {
    presetTags: PRESET_TAGS.filter((tag) => presetSet.has(tag)),
    customTags: Array.from(customByKey.values()).sort((a, b) => a.localeCompare(b)),
    mappedLegacyTags,
  };
};

export const classifyItemSeasons = (seasons: string[]) => {
  const selected = new Set<StructuredSeason>();
  const legacy = new Map<string, string>();

  seasons.forEach((rawSeason) => {
    const display = normalizeWhitespace(rawSeason);
    if (!display) return;
    const structured = resolveStructuredSeason(display);
    if (structured) {
      selected.add(structured);
      return;
    }
    const key = normalizeTagKey(display);
    if (!legacy.has(key)) legacy.set(key, display);
  });

  return {
    selectedSeasons: SEASON_OPTIONS.filter((season) => selected.has(season)),
    legacySeasons: Array.from(legacy.values()).sort((a, b) => a.localeCompare(b)),
  };
};

export const getItemTagSearchTokens = (
  item: Pick<Item, 'tags' | 'seasonTags'>,
  customTags: Array<Pick<CustomTag, 'name' | 'normalizedName'>> = [],
) => {
  const classifiedTags = classifyItemTags(item.tags ?? [], customTags);
  const classifiedSeasons = classifyItemSeasons(item.seasonTags ?? []);
  return [
    ...classifiedTags.presetTags,
    ...classifiedTags.customTags,
    ...classifiedSeasons.selectedSeasons,
    ...classifiedSeasons.legacySeasons,
  ];
};

export const mergeStructuredTagsForSave = (input: {
  presetTags: readonly PresetTag[];
  selectedCustomTags: readonly string[];
  legacyLockedTags?: readonly string[];
}) => {
  const next = [
    ...input.presetTags.map((tag) => normalizeTagDisplayName(tag)),
    ...input.selectedCustomTags.map((tag) => normalizeTagDisplayName(tag)),
    ...(input.legacyLockedTags ?? []).map((tag) => normalizeTagDisplayName(tag)),
  ].filter(Boolean);
  return Array.from(new Set(next));
};

export const mergeStructuredSeasonsForSave = (input: {
  selectedSeasons: readonly StructuredSeason[];
  legacySeasons?: readonly string[];
}) => {
  const next = [
    ...input.selectedSeasons.map((season) => normalizeTagDisplayName(season)),
    ...(input.legacySeasons ?? []).map((season) => normalizeTagDisplayName(season)),
  ].filter(Boolean);
  return Array.from(new Set(next));
};
