import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, PanResponderInstance, Pressable, Text, View } from 'react-native';
import { useAppTheme } from '@/theme';
import { ClosetCategory, closetLabel } from '@/utils/categories';

type Props = {
  title: string;
  ordered: ClosetCategory[];
  hidden: Set<ClosetCategory>;
  onReorder: (next: ClosetCategory[]) => Promise<void> | void;
  onToggleHidden: (category: ClosetCategory) => Promise<void> | void;
};

const DRAG_ROW_SLOT = 48;

const moveInList = (list: ClosetCategory[], from: number, to: number): ClosetCategory[] => {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

export const DraggableCategoryPrefsEditor: React.FC<Props> = ({ title, ordered, hidden, onReorder, onToggleHidden }) => {
  const theme = useAppTheme();
  const [localOrder, setLocalOrder] = useState<ClosetCategory[]>(ordered);
  const [draggingCategory, setDraggingCategory] = useState<ClosetCategory | null>(null);
  const localOrderRef = useRef<ClosetCategory[]>(ordered);
  const dragStateRef = useRef<{ category: ClosetCategory; startIndex: number } | null>(null);
  const panRespondersRef = useRef<Record<string, PanResponderInstance>>({});

  useEffect(() => {
    setLocalOrder(ordered);
    localOrderRef.current = ordered;
  }, [ordered]);

  const getResponder = (category: ClosetCategory) => {
    if (panRespondersRef.current[category]) return panRespondersRef.current[category];
    panRespondersRef.current[category] = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 3,
      onPanResponderGrant: () => {
        const currentIndex = localOrderRef.current.indexOf(category);
        dragStateRef.current = { category, startIndex: currentIndex };
        setDraggingCategory(category);
      },
      onPanResponderMove: (_, gestureState) => {
        const state = dragStateRef.current;
        if (!state || state.category !== category) return;
        const current = localOrderRef.current;
        const currentIndex = current.indexOf(category);
        if (currentIndex < 0) return;
        const targetIndex = Math.max(0, Math.min(current.length - 1, state.startIndex + Math.round(gestureState.dy / DRAG_ROW_SLOT)));
        if (targetIndex === currentIndex) return;
        const next = moveInList(current, currentIndex, targetIndex);
        localOrderRef.current = next;
        setLocalOrder(next);
      },
      onPanResponderRelease: () => {
        const next = [...localOrderRef.current];
        dragStateRef.current = null;
        setDraggingCategory(null);
        void onReorder(next);
      },
      onPanResponderTerminate: () => {
        const next = [...localOrderRef.current];
        dragStateRef.current = null;
        setDraggingCategory(null);
        void onReorder(next);
      },
    });
    return panRespondersRef.current[category];
  };

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontWeight: '700', color: theme.colors.textPrimary, fontFamily: theme.fonts.serif, fontSize: 18 }}>{title}</Text>
      <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
        Drag the handle to reorder. Use Hide/Show to hide or unhide categories.
      </Text>
      {localOrder.map((category) => {
        const isHidden = hidden.has(category);
        const isDragging = draggingCategory === category;
        return (
          <View
            key={`${title}-${category}`}
            style={{
              minHeight: DRAG_ROW_SLOT,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              opacity: isDragging ? 0.85 : 1,
              backgroundColor: isDragging ? theme.colors.surfaceMuted : theme.colors.surface,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ flex: 1, color: isHidden ? theme.colors.textMuted : theme.colors.textPrimary }}>
              {closetLabel[category]}{isHidden ? ' (hidden)' : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Pressable onPress={() => void onToggleHidden(category)} hitSlop={8}>
                <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>{isHidden ? 'Show' : 'Hide'}</Text>
              </Pressable>
              <View
                {...getResponder(category).panHandlers}
                style={{
                  minWidth: 28,
                  minHeight: 28,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.surfaceMuted,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>≡</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
};
