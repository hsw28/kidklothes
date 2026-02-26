import { buildEmptyCategoryLabel } from './closetEmptyLabel';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

export const runClosetEmptyLabelLightweightTests = () => {
  assert(
    buildEmptyCategoryLabel({ categoryName: 'Shoes', brandFilter: 'All', sizeScope: 'All', selectedSizes: [], query: '' }) === 'No shoes yet',
    'a) base label should ignore empty filters',
  );

  assert(
    buildEmptyCategoryLabel({ categoryName: 'Shoes', brandFilter: 'Kate Quinn', sizeScope: 'All', selectedSizes: [], query: '' }) === 'No kate quinn shoes yet',
    'b) single brand should be included',
  );

  assert(
    buildEmptyCategoryLabel({ categoryName: 'Shoes', brandFilter: 'All', sizeScope: 'All', selectedSizes: ['18–24M'], query: '' }) === 'No shoes yet in 18–24M',
    'c) single explicit size should append size clause',
  );

  assert(
    buildEmptyCategoryLabel({ categoryName: 'Shoes', brandFilter: 'Kate Quinn', sizeScope: 'Next', selectedSizes: [], query: '' }) === 'No kate quinn shoes yet for next',
    'd) next scope should append scope clause when no explicit size',
  );

  assert(
    buildEmptyCategoryLabel({ categoryName: 'Shoes', brandFilter: 'All', sizeScope: 'All', selectedSizes: [], query: 'panda' }) === 'No shoes yet matching “panda”',
    'e) query should append matching clause',
  );

  assert(
    buildEmptyCategoryLabel({ categoryName: 'Shoes', brandFilter: 'Kate Quinn', sizeScope: 'Next', selectedSizes: [], query: 'panda pajamas print' }) === 'No kate quinn shoes yet for next',
    'f) truncation should drop query clause before size clause',
  );
};

