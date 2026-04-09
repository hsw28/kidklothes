import { getSizeChipTransitionOnTap, normalizeSizeLabel, shouldRenderSizeAsStandardChip, uniqueSortedSizeEntries } from './sizeOrder';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

export const runSizeOrderLightweightTests = () => {
  const ordered = uniqueSortedSizeEntries(['3T', '18-24M', '2T']).map((entry) => entry.normalized);
  assert(JSON.stringify(ordered) === JSON.stringify(['18-24', '2T', '3T']), 'size ordering should be 18-24 before 2T before 3T');

  const deduped = uniqueSortedSizeEntries(['2t', '2T', ' 2T ']).map((entry) => entry.normalized);
  assert(JSON.stringify(deduped) === JSON.stringify(['2T']), 'size labels should dedupe after normalization');

  const nextState = getSizeChipTransitionOnTap({ tapped: '2T', currentSize: '18-24M', nextSize: '2t' });
  assert(nextState.mode === 'next' && nextState.selectedSizeChip === '2T', 'tapping next size should switch to next');

  const allState = getSizeChipTransitionOnTap({ tapped: '3T', currentSize: '18-24M', nextSize: '2T' });
  assert(allState.mode === 'both' && allState.selectedSizeChip === '3T', 'tapping non-active size should stay in all');

  assert(normalizeSizeLabel('18–24 months') === '18-24', 'dash/month normalization should work');
  assert(shouldRenderSizeAsStandardChip('XS / 0-6M') === true, 'compact combo sizes can stay as chips');
  assert(shouldRenderSizeAsStandardChip('MARKED AS A 3 BUT MORE A 3.5, MAYBE EVEN A 4') === false, 'note-like sizes should move to custom notes');
  assert(shouldRenderSizeAsStandardChip('NONE') === false, 'NONE should not render as a standard size chip');
};
