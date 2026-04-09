import React, { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '@/components/Card';
import { FormInput } from '@/components/FormInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RemoteImage } from '@/components/RemoteImage';
import { Screen } from '@/components/Screen';
import { useData } from '@/db/DataContext';
import { useReviewPrompt } from '@/hooks/useReviewPrompt';
import { useUndoToast } from '@/hooks/useUndoToast';
import { ItemsStackParamList } from '@/navigation/types';
import { closetCategoryForItem } from '@/utils/closetViewInsights';
import { getCategoryLabel, isCustomCategoryId } from '@/utils/categories';
import { resolveOutboundLink } from '@/utils/outbound';
import { formatConditionLabel, formatItemCategoryLabel } from '@/utils/itemLabels';
import { getItemDisplayFallbackUri, getItemDisplayImageUri } from '@/utils/itemMedia';

type Props = NativeStackScreenProps<ItemsStackParamList, 'ItemDetail'>;

export const ItemDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const {
    items,
    children,
    childItems,
    customCategories,
    settings,
    trackOutboundClick,
    markItemsWorn,
    updateItem,
    deleteItem,
    restoreItems,
    listStorageLocations,
    assignChildItemToLocation,
  } = useData();
  const { recordMeaningfulActionAndMaybePrompt } = useReviewPrompt();
  const { showToast } = useUndoToast();
  const brandFitLabel = (value?: string) => {
    if (value === 'tts') return 'True to size';
    if (value === 'small') return 'Runs small';
    if (value === 'big') return 'Runs big';
    return undefined;
  };
  const kidFitLabel = (value?: string) => {
    if (value === 'fits') return 'Fits now';
    if (value === 'big') return 'A bit big';
    if (value === 'small') return 'A bit small';
    if (value === 'unknown') return 'Not tried yet';
    return undefined;
  };

  const item = items.find((entry) => entry.id === route.params.itemId);
  const itemLinks = childItems.filter((entry) => entry.itemId === route.params.itemId);
  const linkedChildId = itemLinks[0]?.childId || item?.childIds[0];
  const linkedChildName = linkedChildId ? children.find((child) => child.id === linkedChildId)?.name : undefined;
  const linkedChildNames = children.filter((child) => item?.childIds.includes(child.id)).map((child) => child.name);
  const [targetResaleInput, setTargetResaleInput] = useState(item?.targetResalePrice?.toString() ?? '');

  useEffect(() => {
    setTargetResaleInput(item?.targetResalePrice?.toString() ?? '');
  }, [item?.id, item?.targetResalePrice]);

  if (!item) {
    return (
      <Screen>
        <Text style={styles.label}>Item not found.</Text>
      </Screen>
    );
  }

  const resolvedOutbound = resolveOutboundLink(item.url ?? '', {
    canonicalUrl: item.canonicalUrl ?? item.url,
    monetize: settings.monetizationEnabled,
  });
  const itemImageUri = getItemDisplayImageUri(item);
  const itemImageFallbackUri = getItemDisplayFallbackUri(item);
  const itemClosetCategory = closetCategoryForItem(item);
  const itemCategoryKey = isCustomCategoryId(item.category) ? item.category : itemClosetCategory;
  const categoryLabel = getCategoryLabel(itemCategoryKey, customCategories);
  const canOpenCategory = Boolean(linkedChildId);
  const styleName = (item.styleName || '').trim();
  const printName = (item.printName || '').trim();
  const fabric = (item.fabric || '').trim();
  const detailTags = Array.from(
    new Set(
      [...(item.tags ?? []), ...(item.seasonTags ?? [])]
        .map((tag) => (tag || '').trim())
        .filter(Boolean),
    ),
  );

  const markPurchasedAndAddToCloset = async () => {
    await updateItem(item.id, { status: 'owned' });

    for (const link of itemLinks) {
      await updateItem(item.id, {
        childId: link.childId,
        statusForChild: 'owned',
      });

      if (!link.storageLocationId) {
        const locations = await listStorageLocations(link.childId);
        const currentCloset = locations.find((location) => location.name.trim().toLowerCase() === 'current closet');
        if (currentCloset) {
          await assignChildItemToLocation(link.id, currentCloset.id);
        }
      }
    }

    showToast({
      label: 'Moved to Closet',
      durationMs: 4500,
      doUndo: async () => {
        await updateItem(item.id, { status: 'wishlist' });
        for (const link of itemLinks) {
          await updateItem(item.id, { childId: link.childId, statusForChild: 'wishlist' });
        }
      },
    });
    await recordMeaningfulActionAndMaybePrompt('wishlist_item_purchased', 'item_detail_mark_purchased');
  };

  return (
    <Screen>
      <Card>
        <RemoteImage uri={itemImageUri} fallbackUri={itemImageFallbackUri} style={styles.heroImage} fallbackLabel={item.title} />
        <Text style={styles.name}>{item.title}</Text>
        <Text style={styles.label}>Kid: {linkedChildNames.length ? linkedChildNames.join(', ') : (linkedChildName || 'Unassigned')}</Text>
        {item.quantity > 1 ? <Text style={styles.label}>Quantity: {item.quantity}x</Text> : null}
        <Text style={styles.label}>Category: {formatItemCategoryLabel(item)}</Text>
        <Text style={styles.label}>Size: {item.size || 'N/A'}</Text>
        <Text style={styles.label}>Status: {item.status}</Text>
        {item.brand ? <Text style={styles.label}>Brand: {item.brand}</Text> : null}
        {styleName ? <Text style={styles.label}>Style: {styleName}</Text> : null}
        {printName ? <Text style={styles.label}>Print: {printName}</Text> : null}
        {fabric ? <Text style={styles.label}>Fabric: {fabric}</Text> : null}
        {item.sourceDomain ? <Text style={styles.label}>Source: {item.sourceDomain}</Text> : null}
        {item.clickCount > 0 ? <Text style={styles.label}>Outbound clicks: {item.clickCount}</Text> : null}
        {brandFitLabel(item.brandFit) ? <Text style={styles.label}>Runs: {brandFitLabel(item.brandFit)}</Text> : null}
        {kidFitLabel(item.kidFit) ? <Text style={styles.label}>Fit on Kid: {kidFitLabel(item.kidFit)}</Text> : null}
        {item.brandSizeNote ? <Text style={styles.label}>Fit note: {item.brandSizeNote}</Text> : null}
        {item.status !== 'wishlist' ? <Text style={styles.label}>Worn count: {item.wornCount}</Text> : null}
        {item.condition ? <Text style={styles.label}>Condition: {formatConditionLabel(item.condition)}</Text> : null}
        {item.purchasePrice !== undefined ? <Text style={styles.label}>Purchase price: ${item.purchasePrice.toFixed(2)}</Text> : null}
        {item.status === 'for-sale' ? (
          <>
            <Text style={styles.sectionTitle}>Resale</Text>
            <FormInput
              label="Target resale price"
              value={targetResaleInput}
              onChangeText={setTargetResaleInput}
              placeholder="e.g. 18.00"
              keyboardType="decimal-pad"
            />
            <PrimaryButton
              label="Save resale target"
              variant="secondary"
              onPress={async () => {
                const parsed = Number(targetResaleInput.trim());
                await updateItem(item.id, { targetResalePrice: Number.isFinite(parsed) ? parsed : undefined });
                await recordMeaningfulActionAndMaybePrompt('resale_target_saved', 'item_detail_resale_target');
              }}
            />
          </>
        ) : null}
        {item.status === 'sold' ? (
          <>
            <Text style={styles.sectionTitle}>Sold Details</Text>
            <Text style={styles.label}>Sold price: {item.soldPrice !== undefined ? `$${item.soldPrice.toFixed(2)}` : 'N/A'}</Text>
            <Text style={styles.label}>Sold date: {item.soldDate ?? 'N/A'}</Text>
          </>
        ) : null}
        {detailTags.length > 0 ? <Text style={styles.label}>Tags: {detailTags.join(', ')}</Text> : null}
        {item.notes ? <Text style={styles.label}>Notes: {item.notes}</Text> : null}
      </Card>

      {item.url ? (
        <PrimaryButton
          label="View on site"
          onPress={async () => {
            await trackOutboundClick(item.id, resolvedOutbound.outboundUrl);
            await Linking.openURL(resolvedOutbound.outboundUrl);
          }}
          variant="secondary"
        />
      ) : null}
      <PrimaryButton
        label="Back to Closet"
        variant="secondary"
        onPress={() => {
          (navigation.getParent() as any)?.navigate('Closet', { screen: 'ClosetHome' });
        }}
      />
      {canOpenCategory ? (
        <PrimaryButton
          label={`Back to ${categoryLabel}`}
          variant="secondary"
          onPress={() => {
            (navigation.getParent() as any)?.navigate('Closet', {
              screen: 'CategorySnapshot',
              params: {
                childId: linkedChildId,
                category: itemCategoryKey,
                sizeMode: 'both',
              },
            });
          }}
        />
      ) : null}
      {item.status !== 'wishlist' ? (
        <PrimaryButton
          label="Mark Worn"
          variant="secondary"
          onPress={async () => {
            await markItemsWorn([item.id]);
            await recordMeaningfulActionAndMaybePrompt('item_marked_worn', 'item_detail_mark_worn');
          }}
        />
      ) : null}
      {item.status === 'wishlist' ? (
        <PrimaryButton
          label="Mark Purchased & Add to Closet"
          variant="secondary"
          onPress={async () => {
            await markPurchasedAndAddToCloset();
          }}
        />
      ) : null}
      <PrimaryButton
        label="Duplicate Item"
        variant="secondary"
        onPress={() => navigation.navigate('AddItem', { duplicateFromItemId: item.id })}
      />
      <PrimaryButton label="Edit Item" onPress={() => navigation.navigate('AddItem', { itemId: item.id })} />
      <PrimaryButton
        label="Delete Item"
        variant="danger"
        onPress={async () => {
          Alert.alert('Delete Item?', 'This will remove the item from your lists. You can undo right after deleting.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete Item',
              style: 'destructive',
              onPress: async () => {
                await deleteItem(item.id);
                showToast({
                  label: 'Deleted Item',
                  doUndo: async () => {
                    await restoreItems([item.id]);
                  },
                });
                navigation.goBack();
              },
            },
          ]);
        }}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  heroImage: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    marginBottom: 12,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  label: {
    color: '#4b5563',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
  },
});
