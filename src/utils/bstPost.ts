export const MAX_ITEMS_TO_COPY = 25;

type BstPostItem = {
  styleName?: string | null;
  printName?: string | null;
  title?: string | null;
};

type BuildBstPostCaptionInput = {
  titleLine: string;
  filters?: Array<{ key: string; value: string }>;
  items: BstPostItem[];
  includeAppCredit?: boolean;
};

const clean = (value?: string | null) => (value ?? '').trim();

const buildItemLine = (item: BstPostItem): string => {
  const style = clean(item.styleName);
  const printOrTitle = clean(item.printName) || clean(item.title);
  if (style && printOrTitle) return `• ${style} – ${printOrTitle}`;
  if (printOrTitle) return `• ${printOrTitle}`;
  if (style) return `• ${style}`;
  return '• (Untitled item)';
};

export const buildBstPostCaption = ({
  titleLine,
  filters = [],
  items,
  includeAppCredit = false,
}: BuildBstPostCaptionInput): string => {
  const lines: string[] = [titleLine.trim()];
  const filterLine = filters
    .filter((entry) => clean(entry.value))
    .map((entry) => `${entry.key}=${entry.value}`)
    .join(' • ');
  if (filterLine) lines.push(`Filters: ${filterLine}`);

  if (items.length === 0) {
    lines.push('No items match these filters.');
  } else {
    const visible = items.slice(0, MAX_ITEMS_TO_COPY);
    visible.forEach((item) => lines.push(buildItemLine(item)));
    const hidden = items.length - visible.length;
    if (hidden > 0) lines.push(`• +${hidden} more`);
  }

  lines.push('', 'Notes: smoke-free home • happy to bundle • ISO list welcome');
  if (includeAppCredit) lines.push('', '(Tracked with Layette Out)');

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};
