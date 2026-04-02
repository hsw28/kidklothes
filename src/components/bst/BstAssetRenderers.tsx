import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { ResolvedSaleDraftItem, formatMoney } from '@/services/bst/draft';
import { chunkForCollageRows, getCollageColumnCount } from '@/services/bst/layout';

export type CollageViewProps = {
  title?: string;
  pageIndex?: number;
  pageCount?: number;
  items: ResolvedSaleDraftItem[];
  pageSize: number;
  onAssetLoadEnd?: () => void;
  width?: number;
  brandingMode?: 'free' | 'pro';
  previewMode?: 'export' | 'free-preview';
};

export type ItemCardViewProps = {
  draftTitle: string;
  entry: ResolvedSaleDraftItem;
  onAssetLoadEnd?: () => void;
  width?: number;
  brandingMode?: 'free' | 'pro';
  previewMode?: 'export' | 'free-preview';
};

const BrandWatermark: React.FC<{
  scale: number;
  variant?: 'collage' | 'card';
}> = ({ scale }) => {
  const textSize = 16.4 * scale;
  const verticalPadding = 7.2 * scale;
  const horizontalPadding = 14.2 * scale;
  const radius = 7.2 * scale;

  const styles = StyleSheet.create({
    text: {
      fontSize: textSize,
      lineHeight: textSize * 1.1,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.96)',
      backgroundColor: 'rgba(0,0,0,0.48)',
      paddingHorizontal: horizontalPadding,
      paddingVertical: verticalPadding,
      borderRadius: radius,
      overflow: 'hidden',
      textAlign: 'right',
      opacity: 0.9,
      letterSpacing: 0.42 * scale,
    },
  });

  return <Text numberOfLines={1} style={styles.text}>Layette Out</Text>;
};

const PreviewProtectionOverlay: React.FC<{
  scale: number;
  variant?: 'collage' | 'card';
}> = ({ scale, variant = 'card' }) => {
  const labelSize = (variant === 'collage' ? 13 : 14.5) * scale;
  const watermarkSize = (variant === 'collage' ? 31 : 34) * scale;
  const styles = StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(17,24,39,0.08)',
    },
    labelWrap: {
      position: 'absolute',
      top: 16 * scale,
      left: 18 * scale,
      right: 18 * scale,
      alignItems: 'center',
    },
    label: {
      fontSize: labelSize,
      lineHeight: labelSize * 1.15,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.96)',
      backgroundColor: 'rgba(0,0,0,0.4)',
      paddingHorizontal: 10 * scale,
      paddingVertical: 5 * scale,
      borderRadius: 8 * scale,
      overflow: 'hidden',
      letterSpacing: 0.2 * scale,
    },
    watermarkWrap: {
      position: 'absolute',
      left: '12%',
      right: '12%',
      top: '42%',
      alignItems: 'center',
    },
    watermark: {
      fontSize: watermarkSize,
      lineHeight: watermarkSize * 1.06,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.98)',
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 18 * scale,
      paddingVertical: 10 * scale,
      borderRadius: 10 * scale,
      overflow: 'hidden',
      letterSpacing: 0.5 * scale,
      opacity: 0.96,
    },
  });

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <View style={styles.labelWrap}>
        <Text style={styles.label}>Preview — export clean version</Text>
      </View>
      <View style={styles.watermarkWrap}>
        <Text style={styles.watermark}>Layette Out</Text>
      </View>
    </View>
  );
};

const formatCollagePrice = (value?: number): string | undefined => {
  if (value === undefined || value === null || !Number.isFinite(value)) return undefined;
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
};

export const CollageView: React.FC<CollageViewProps> = ({ items, onAssetLoadEnd, width = 1080, previewMode = 'export' }) => {
  const columns = getCollageColumnCount(items.length);
  const rows = chunkForCollageRows(items, columns);
  const rowCount = Math.max(1, rows.length);
  const canvasWidth = width;
  const canvasHeight = Math.round(width * 1.25);
  const outerPadding = Math.round((8 / 1080) * width);
  const gap = Math.round((5 / 1080) * width);
  const contentWidth = canvasWidth - outerPadding * 2;
  const contentHeight = canvasHeight - outerPadding * 2;
  const cellSize = Math.floor(
    Math.min(
      (contentWidth - gap * (columns - 1)) / columns,
      (contentHeight - gap * (rowCount - 1)) / rowCount,
    ),
  );
  const gridWidth = cellSize * columns + gap * (columns - 1);
  const gridHeight = cellSize * rowCount + gap * (rowCount - 1);
  const numberFontSize = Math.round((19 / 1080) * width);
  const priceFontSize = Math.round((21 / 1080) * width);
  const overlayInset = Math.round((6 / 1080) * width);
  const styles = StyleSheet.create({
    shell: {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: '#F7F4F1',
      paddingHorizontal: outerPadding,
      paddingTop: Math.max(2, outerPadding - Math.round((4 / 1080) * width)),
      paddingBottom: outerPadding,
    },
    grid: {
      width: gridWidth,
      height: gridHeight,
      gap: gap,
      alignSelf: 'center',
    },
    row: {
      flexDirection: 'row',
      gap: gap,
    },
    tile: {
      width: cellSize,
      height: cellSize,
      borderRadius: Math.round((7 / 1080) * width),
      overflow: 'hidden',
      backgroundColor: '#FAF8F6',
    },
    imageWrap: {
      width: '100%',
      height: '100%',
      position: 'relative',
      transform: [{ scale: 1.03 }],
    },
    image: {
      width: '100%',
      height: '100%',
    },
    placeholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: Math.max(10, cellSize * 0.08),
      backgroundColor: '#FAF8F6',
    },
    placeholderText: {
      fontSize: Math.max(12, cellSize * 0.09),
      color: '#746C65',
      textAlign: 'center',
    },
    badgeText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: numberFontSize,
      position: 'absolute',
      top: overlayInset,
      left: overlayInset,
      opacity: 1,
      textShadowColor: 'rgba(0,0,0,0.74)',
      textShadowRadius: 3,
      textShadowOffset: { width: 0, height: 1 },
    },
    pricePill: {
      position: 'absolute',
      left: overlayInset,
      bottom: overlayInset,
      borderRadius: Math.round((6 / 1080) * width),
      backgroundColor: 'rgba(0,0,0,0.4)',
      paddingHorizontal: Math.round((6 / 1080) * width),
      paddingVertical: Math.max(2, Math.round((3 / 1080) * width)),
      shadowColor: '#000000',
      shadowOpacity: 0.14,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 2 },
    },
    price: {
      fontSize: priceFontSize,
      fontWeight: '700',
      color: '#FFFFFF',
      textShadowColor: 'rgba(0,0,0,0.78)',
      textShadowRadius: 3,
      textShadowOffset: { width: 0, height: 1 },
    },
    footer: {
      position: 'absolute',
      right: Math.round((14 / 1080) * width),
      bottom: Math.round((14 / 1080) * width),
      alignItems: 'flex-end',
    },
  });

  return (
    <View style={styles.shell} collapsable={false}>
      <View style={[styles.grid, { marginTop: Math.max(0, Math.floor((contentHeight - gridHeight) / 2)) + Math.round((10 / 1080) * width) }]}>
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
                  <Text style={styles.badgeText}>#{entry.draftItem.itemNumber}</Text>
                  {formatCollagePrice(entry.draftItem.price) ? (
                    <View style={styles.pricePill}>
                      <Text style={styles.price}>{formatCollagePrice(entry.draftItem.price)}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={styles.footer}>
        <BrandWatermark scale={width / 1080} />
      </View>
      {previewMode === 'free-preview' ? <PreviewProtectionOverlay scale={width / 1080} variant="collage" /> : null}
    </View>
  );
};

export const ItemCardView: React.FC<ItemCardViewProps> = ({ draftTitle, entry, onAssetLoadEnd, width = 1080, brandingMode = 'free', previewMode = 'export' }) => {
  const scale = width / 1080;
  const priceLabel = formatMoney(entry.draftItem.price);
  const brandLabel = entry.inventoryItem.brand?.trim();
  const titleLine = entry.inventoryItem.title?.trim() || 'Untitled item';
  const sizeLabel = entry.inventoryItem.size?.trim();
  const conditionLabel = entry.draftItem.condition?.trim();
  const styles = StyleSheet.create({
    shell: {
      width,
      aspectRatio: 4 / 5,
      backgroundColor: '#F7F4F1',
      borderRadius: 12 * scale,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.04)',
      shadowColor: '#000000',
      shadowOpacity: 0.06,
      shadowRadius: 10 * scale,
      shadowOffset: { width: 0, height: 3 * scale },
      elevation: 1,
    },
    photoWrap: {
      width: '100%',
      height: '68%',
      backgroundColor: '#FAF8F6',
      paddingHorizontal: 6 * scale,
      paddingTop: 2 * scale,
      paddingBottom: 2 * scale,
      alignItems: 'center',
      justifyContent: 'center',
    },
    photo: {
      width: '100%',
      height: '100%',
      opacity: 0.99,
      transform: [{ scale: 1.05 }],
    },
    photoPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20 * scale,
      backgroundColor: '#FAF8F6',
    },
    photoPlaceholderText: {
      fontSize: 22 * scale,
      textAlign: 'center',
      color: '#746C65',
    },
    body: {
      flex: 1,
      paddingHorizontal: 16 * scale,
      paddingTop: -2 * scale,
      paddingBottom: 1 * scale,
      backgroundColor: '#F7F4F1',
      justifyContent: 'flex-start',
    },
    divider: {
      height: 1,
      backgroundColor: 'rgba(0,0,0,0.06)',
      marginBottom: 2 * scale,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8 * scale,
      marginBottom: 1 * scale,
    },
    badge: {
      fontSize: 28 * scale,
      lineHeight: 30 * scale,
      color: 'rgba(31,26,22,0.88)',
      fontWeight: '600',
    },
    price: {
      fontSize: 46.5 * scale,
      lineHeight: 47.5 * scale,
      fontWeight: '800',
      color: '#130F0C',
      letterSpacing: -0.7 * scale,
      transform: [{ translateY: 10 * scale }],
    },
    priceMissing: {
      fontSize: 34 * scale,
      lineHeight: 36 * scale,
      fontWeight: '700',
      color: '#7B746D',
      letterSpacing: -0.42 * scale,
    },
    brand: {
      fontSize: 37 * scale,
      lineHeight: 39 * scale,
      fontWeight: '700',
      color: '#181411',
      letterSpacing: 0.26 * scale,
      marginBottom: 0 * scale,
    },
    metadataLine: {
      fontSize: 28.5 * scale,
      lineHeight: 30.5 * scale,
      fontWeight: '600',
      color: '#564E47',
      marginBottom: 0 * scale,
    },
    title: {
      fontSize: 23.5 * scale,
      lineHeight: 25.5 * scale,
      fontWeight: '600',
      color: '#6F675F',
      flex: 1,
      paddingRight: 12 * scale,
    },
    bottomRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      marginTop: 1 * scale,
    },
    footer: {
      alignItems: 'flex-end',
      marginLeft: 8 * scale,
      transform: [{ translateY: 2 * scale }],
    },
  });

  return (
    <View style={styles.shell} collapsable={false}>
      <View style={styles.photoWrap}>
        {entry.resolvedPhotoUri ? (
          <Image source={{ uri: entry.resolvedPhotoUri }} style={styles.photo} resizeMode="contain" onLoadEnd={onAssetLoadEnd} onError={onAssetLoadEnd} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoPlaceholderText}>{entry.inventoryItem.title}</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <View style={styles.divider} />
        <View style={styles.topRow}>
          <Text style={styles.badge}>#{entry.draftItem.itemNumber}</Text>
          {priceLabel ? <Text style={styles.price}>{priceLabel}</Text> : <Text style={styles.priceMissing}>Price not set</Text>}
        </View>
        {brandLabel ? <Text numberOfLines={1} style={styles.brand}>{brandLabel}</Text> : null}
        {[sizeLabel, conditionLabel].filter(Boolean).length ? (
          <Text numberOfLines={1} style={styles.metadataLine}>{[sizeLabel, conditionLabel].filter(Boolean).join(' • ')}</Text>
        ) : null}
        <View style={styles.bottomRow}>
          <Text numberOfLines={1} style={styles.title}>{titleLine}</Text>
          <View style={styles.footer}>
            <BrandWatermark scale={scale} />
          </View>
        </View>
      </View>
      {previewMode === 'free-preview' ? <PreviewProtectionOverlay scale={scale} variant="card" /> : null}
    </View>
  );
};

export const BstCollageRenderer = CollageView;
export const BstItemCardRenderer = ItemCardView;
