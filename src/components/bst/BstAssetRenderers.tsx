import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { formatBstNoteLabel, isNewBstCondition, ResolvedSaleDraftItem, formatMoney, splitBstTitle } from '@/services/bst/draft';
import { chunkForCollageRows, getCollageColumnCount } from '@/services/bst/layout';
import { useAppTheme } from '@/theme';

export type CollageViewProps = {
  title?: string;
  pageIndex?: number;
  pageCount?: number;
  items: ResolvedSaleDraftItem[];
  pageSize: number;
  onAssetLoadEnd?: () => void;
  width?: number;
  brandingMode?: 'free' | 'pro';
};

export type ItemCardViewProps = {
  draftTitle: string;
  entry: ResolvedSaleDraftItem;
  onAssetLoadEnd?: () => void;
  width?: number;
  brandingMode?: 'free' | 'pro';
};

const badgeSize = 28;

export const CollageView: React.FC<CollageViewProps> = ({ title, pageIndex = 0, pageCount = 1, items, pageSize, onAssetLoadEnd, width = 1080, brandingMode = 'free' }) => {
  const theme = useAppTheme();
  const columns = getCollageColumnCount(pageSize);
  const rows = chunkForCollageRows(items, columns);
  const scale = width / 1080;
  const shellPaddingX = 24 * scale;
  const shellPaddingTop = 20 * scale;
  const shellPaddingBottom = 18 * scale;
  const gap = 14 * scale;
  const contentWidth = width - shellPaddingX * 2;
  const tileWidth = (contentWidth - gap * (columns - 1)) / columns;
  const accentColor = '#E2B8A2';
  const styles = StyleSheet.create({
    shell: {
      width,
      backgroundColor: '#FFFFFF',
      paddingHorizontal: shellPaddingX,
      paddingTop: shellPaddingTop,
      paddingBottom: shellPaddingBottom,
      gap: 16 * scale,
      borderRadius: 28 * scale,
    },
    header: {
      gap: 2 * scale,
      minHeight: title ? 48 * scale : 20 * scale,
    },
    eyebrow: {
      fontSize: 14 * scale,
      fontWeight: '700',
      color: '#7A736B',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    title: {
      fontSize: 24 * scale,
      fontWeight: '700',
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.serif,
      lineHeight: 30 * scale,
    },
    subhead: {
      fontSize: 14 * scale,
      color: theme.colors.textSecondary,
    },
    grid: {
      gap,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap,
    },
    tile: {
      width: tileWidth,
      borderRadius: 18 * scale,
      overflow: 'hidden',
      backgroundColor: '#FBF9F6',
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 10 * scale,
      gap: 8 * scale,
    },
    imageWrap: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: 16 * scale,
      overflow: 'hidden',
      backgroundColor: '#F6F0EA',
      position: 'relative',
    },
    image: {
      width: '100%',
      height: '100%',
    },
    placeholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16 * scale,
      backgroundColor: '#F6F0EA',
    },
    placeholderText: {
      fontSize: 18 * scale,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    badge: {
      position: 'absolute',
      top: 8 * scale,
      left: 8 * scale,
      minWidth: 34 * scale,
      height: 34 * scale,
      paddingHorizontal: 10 * scale,
      borderRadius: 17 * scale,
      backgroundColor: 'rgba(35, 28, 24, 0.92)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      color: '#fff',
      fontWeight: '900',
      fontSize: 16 * scale,
    },
    tileMeta: {
      gap: 4 * scale,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8 * scale,
      flexWrap: 'wrap',
    },
    price: {
      fontSize: 22 * scale,
      fontWeight: '900',
      color: '#1F1814',
      backgroundColor: accentColor,
      borderRadius: 12 * scale,
      paddingHorizontal: 10 * scale,
      paddingVertical: 5 * scale,
      overflow: 'hidden',
    },
    condition: {
      fontSize: 17 * scale,
      fontWeight: '800',
      color: '#413832',
    },
    brandSize: {
      fontSize: 18 * scale,
      lineHeight: 24 * scale,
      fontWeight: '700',
      color: '#4B433D',
    },
    footer: {
      paddingTop: 6 * scale,
    },
    footerText: {
      fontSize: 16 * scale,
      lineHeight: 22 * scale,
      fontWeight: '700',
      color: '#5A5149',
      textAlign: 'center',
    },
  });

  return (
    <View style={styles.shell} collapsable={false}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>BST collage</Text>
        {title ? <Text numberOfLines={1} style={styles.title}>{title}</Text> : null}
        {pageCount > 1 ? <Text style={styles.subhead}>Page {pageIndex + 1} of {pageCount}</Text> : null}
      </View>
      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.row}>
            {row.map((entry) => (
              <View key={entry.draftItem.id} style={styles.tile}>
                <View style={styles.imageWrap}>
                  {entry.resolvedPhotoUri ? (
                    <Image source={{ uri: entry.resolvedPhotoUri }} style={styles.image} resizeMode="cover" onLoadEnd={onAssetLoadEnd} onError={onAssetLoadEnd} />
                  ) : (
                    <View style={styles.placeholder}>
                      <Text numberOfLines={3} style={styles.placeholderText}>{entry.inventoryItem.title}</Text>
                    </View>
                  )}
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>#{entry.draftItem.itemNumber}</Text>
                  </View>
                </View>
                <View style={styles.tileMeta}>
                  <View style={styles.priceRow}>
                    {entry.draftItem.price ? <Text style={styles.price}>{formatMoney(entry.draftItem.price)}</Text> : null}
                    {entry.draftItem.condition ? <Text style={styles.condition}>{entry.draftItem.condition}</Text> : null}
                  </View>
                  <Text numberOfLines={1} style={styles.brandSize}>
                    {[entry.inventoryItem.brand, entry.inventoryItem.size].filter(Boolean).join(' • ') || 'BST listing'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>Tracked & formatted with Layette Out</Text>
      </View>
    </View>
  );
};

export const ItemCardView: React.FC<ItemCardViewProps> = ({ draftTitle, entry, onAssetLoadEnd, width = 1080, brandingMode = 'free' }) => {
  const theme = useAppTheme();
  const suppressCareNotes = isNewBstCondition(entry.draftItem.condition);
  const scale = width / 1080;
  const accentColor = '#E7C8B8';
  const accentColorStrong = '#C9967D';
  const titleParts = splitBstTitle(entry.inventoryItem.title);
  const priceLabel = formatMoney(entry.draftItem.price);
  const titleLine = titleParts.primary || entry.inventoryItem.title;
  const brandLabel = entry.inventoryItem.brand?.trim();
  const sizeLabel = entry.inventoryItem.size?.trim();
  const detailCandidates = [
    entry.inventoryItem.printName,
    entry.inventoryItem.styleName,
    entry.inventoryItem.fabric,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const detailLine = Array.from(
    new Map(detailCandidates.map((value) => [value.toLowerCase(), value])).values(),
  ).join(' • ') || undefined;
  const styles = StyleSheet.create({
    shell: {
      width,
      backgroundColor: '#FFFFFF',
      borderRadius: 28 * scale,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: '#2A211C',
      shadowOpacity: 0.08,
      shadowRadius: 18 * scale,
      shadowOffset: { width: 0, height: 10 * scale },
      elevation: 3,
    },
    photoWrap: {
      width: '100%',
      aspectRatio: 1.16,
      backgroundColor: '#F8F4EF',
      padding: 9 * scale,
    },
    photo: {
      width: '100%',
      height: '100%',
      borderRadius: 24 * scale,
      shadowColor: '#201A16',
      shadowOpacity: 0.08,
      shadowRadius: 16 * scale,
      shadowOffset: { width: 0, height: 8 * scale },
      elevation: 2,
    },
    photoPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20 * scale,
      borderRadius: 24 * scale,
      backgroundColor: '#FBF8F4',
    },
    photoPlaceholderText: {
      fontSize: 28 * scale,
      textAlign: 'center',
      color: theme.colors.textSecondary,
    },
    body: {
      paddingHorizontal: 28 * scale,
      paddingTop: 18 * scale,
      paddingBottom: 18 * scale,
      gap: 12 * scale,
      minHeight: 500 * scale,
    },
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: accentColorStrong,
      borderRadius: 999,
      paddingHorizontal: 14 * scale,
      paddingVertical: 6 * scale,
      marginTop: -1 * scale,
      shadowColor: '#6E4F41',
      shadowOpacity: 0.12,
      shadowRadius: 6 * scale,
      shadowOffset: { width: 0, height: 2 * scale },
      elevation: 1,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6 * scale,
    },
    badgeText: {
      color: '#241C17',
      fontWeight: '900',
      fontSize: 25 * scale,
    },
    badgeMeta: {
      fontSize: 17 * scale,
      lineHeight: 21 * scale,
      color: '#453A34',
      fontWeight: '900',
      opacity: 0.88,
      letterSpacing: 0.15,
      backgroundColor: '#F3E7DC',
      paddingHorizontal: 10 * scale,
      paddingVertical: 5 * scale,
      borderRadius: 999,
      overflow: 'hidden',
    },
    titleBlock: {
      gap: 4 * scale,
    },
    title: {
      fontSize: 50 * scale,
      lineHeight: 51 * scale,
      fontWeight: '900',
      color: '#15100D',
      fontFamily: theme.fonts.serif,
    },
    secondaryTitle: {
      fontSize: 24 * scale,
      color: '#6F655B',
      lineHeight: 28 * scale,
    },
    metadataLine: {
      fontSize: 35 * scale,
      lineHeight: 39 * scale,
      color: '#342D28',
      fontWeight: '700',
      minHeight: 39 * scale,
    },
    metadataBrand: {
      color: '#302822',
      fontWeight: '800',
    },
    metadataSize: {
      color: '#554B44',
      fontWeight: '600',
    },
    pricingBlock: {
      gap: 2 * scale,
      paddingTop: 0,
    },
    priceConditionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      gap: 5 * scale,
      rowGap: 4 * scale,
    },
    condition: {
      fontSize: 31 * scale,
      lineHeight: 34 * scale,
      color: '#372F2A',
      fontWeight: '800',
      minHeight: 34 * scale,
      backgroundColor: '#F0DFD2',
      paddingHorizontal: 11 * scale,
      paddingVertical: 4 * scale,
      borderRadius: 14 * scale,
      overflow: 'hidden',
    },
    price: {
      alignSelf: 'flex-start',
      fontSize: 62 * scale,
      lineHeight: 66 * scale,
      fontWeight: '900',
      color: '#211A16',
      minHeight: 66 * scale,
      backgroundColor: '#E2B8A2',
      paddingHorizontal: 19 * scale,
      paddingVertical: 8 * scale,
      borderRadius: 18 * scale,
      borderWidth: 1,
      borderColor: 'rgba(121, 84, 63, 0.14)',
      shadowColor: '#7A5A49',
      shadowOpacity: 0.14,
      shadowRadius: 10 * scale,
      shadowOffset: { width: 0, height: 4 * scale },
      elevation: 1,
      overflow: 'hidden',
    },
    priceMissing: {
      fontSize: 21 * scale,
      lineHeight: 28 * scale,
      color: theme.colors.textSecondary,
      minHeight: 28 * scale,
    },
    notesBlock: {
      gap: 10 * scale,
      paddingTop: 1 * scale,
    },
    note: {
      fontSize: 24 * scale,
      color: '#575149',
      lineHeight: 34 * scale,
      minHeight: 34 * scale,
    },
    footer: {
      marginTop: 'auto',
      paddingTop: 8 * scale,
    },
    footerText: {
      fontSize: 23 * scale,
      lineHeight: 31 * scale,
      color: '#4C433C',
      flex: 1,
      fontWeight: brandingMode === 'pro' ? '600' : '700',
      opacity: 1,
    },
  });

  const notes = [
    suppressCareNotes ? undefined : formatBstNoteLabel(entry.resolvedDryingMethod),
    suppressCareNotes ? undefined : formatBstNoteLabel(entry.resolvedWashNote),
    entry.resolvedHomeNotes,
    formatBstNoteLabel(entry.draftItem.conditionNotes),
    entry.draftItem.flawTags.length ? `Flaws: ${entry.draftItem.flawTags.join(', ')}` : undefined,
    formatBstNoteLabel(entry.draftItem.flawNotes),
  ].filter(Boolean) as string[];

  return (
    <View style={styles.shell} collapsable={false}>
      <View style={styles.photoWrap}>
        {entry.resolvedPhotoUri ? (
          <Image source={{ uri: entry.resolvedPhotoUri }} style={styles.photo} resizeMode="cover" onLoadEnd={onAssetLoadEnd} onError={onAssetLoadEnd} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoPlaceholderText}>{entry.inventoryItem.title}</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>#{entry.draftItem.itemNumber}</Text>
          </View>
          <Text style={styles.badgeMeta}>ready to post</Text>
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{titleLine}</Text>
          {brandLabel || sizeLabel ? (
            <Text numberOfLines={1} style={styles.metadataLine}>
              {brandLabel ? <Text style={styles.metadataBrand}>{brandLabel}</Text> : null}
              {brandLabel && sizeLabel ? ' • ' : null}
              {sizeLabel ? <Text style={styles.metadataSize}>{sizeLabel}</Text> : null}
            </Text>
          ) : null}
          {detailLine ? <Text numberOfLines={2} style={styles.secondaryTitle}>{detailLine}</Text> : null}
        </View>
        <View style={styles.pricingBlock}>
          <View style={styles.priceConditionRow}>
            {priceLabel ? <Text style={styles.price}>{priceLabel}</Text> : <Text style={styles.priceMissing}>Price not set</Text>}
            {entry.draftItem.condition ? <Text style={styles.condition}>{entry.draftItem.condition}</Text> : null}
          </View>
        </View>
        <View style={styles.notesBlock}>
          {notes.slice(0, 5).map((note, index) => (
            <Text key={`${entry.draftItem.id}-note-${index}`} numberOfLines={2} style={styles.note}>{note}</Text>
          ))}
        </View>
        <View style={styles.footer}>
          <Text numberOfLines={2} style={styles.footerText}>Tracked & listed with Layette Out app</Text>
        </View>
      </View>
    </View>
  );
};

export const BstCollageRenderer = CollageView;
export const BstItemCardRenderer = ItemCardView;
