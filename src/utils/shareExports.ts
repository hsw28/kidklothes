import { Child, Item } from '@/models';

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const buildWishlistText = (childName: string, items: Item[], monetizationEnabled = false): string => {
  const lines = items.map((item, idx) => {
    const link = item.outboundUrl || item.url ? `\n   ${item.outboundUrl || item.url}` : '\n   (no link saved)';
    const tags = item.tags.length ? ` [${item.tags.join(', ')}]` : '';
    return `${idx + 1}. ${item.title} - size ${item.size || 'N/A'}${tags}${link}`;
  });
  const disclosure = monetizationEnabled ? '\n\nDisclosure: Some links may be affiliate links.' : '';
  return [`${childName} wishlist`, '', ...lines].join('\n') + disclosure;
};

export const buildGrandparentWishlistText = (child: Child, items: Item[], monetizationEnabled = false): string => {
  const lines = items.map((item) => {
    const url = item.outboundUrl || item.url || '(no link saved)';
    const notes = item.notes ? `\nNotes: ${item.notes}` : '';
    return `- ${item.title}\nSize: ${item.size || 'N/A'}\nBrand: ${item.brand || 'N/A'}\nLink: ${url}${notes}`;
  });
  const disclosure = monetizationEnabled ? '\n\nDisclosure: Some links may be affiliate links.' : '';
  return [`${child.name}'s Wishlist`, 'Easy shopping format:', '', ...lines].join('\n\n') + disclosure;
};

export const buildWishlistHtml = (child: Child, items: Item[], monetizationEnabled = false): string => {
  const cards = items
    .map((item) => {
      const image = item.cachedImageUri || item.imageUrls[0] || item.imageUrl;
      const imageHtml = image
        ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.title)}" style="width:100%;height:180px;object-fit:cover;border-radius:8px;" />`
        : `<div style="width:100%;height:180px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#6b7280;">No image</div>`;
      const outbound = item.outboundUrl || item.url;
      const linkHtml = outbound ? `<a href="${escapeHtml(outbound)}" style="color:#2563eb;">Open product page</a>` : '<span>No link saved</span>';
      return `
        <article style="border:1px solid #e5e7eb;border-radius:12px;padding:12px;background:#fff;">
          ${imageHtml}
          <h3 style="margin:10px 0 6px;font-size:18px;">${escapeHtml(item.title)}</h3>
          <p style="margin:0 0 8px;color:#4b5563;">${escapeHtml(item.brand || 'Brand N/A')}</p>
          <p style="margin:0 0 8px;"><strong>Size:</strong> ${escapeHtml(item.size || 'N/A')}</p>
          <p style="margin:0 0 8px;"><strong>Type:</strong> ${escapeHtml(item.clothingType)}</p>
          ${item.notes ? `<p style="margin:0 0 8px;color:#374151;">${escapeHtml(item.notes)}</p>` : ''}
          ${linkHtml}
        </article>
      `;
    })
    .join('\n');

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(child.name)} wishlist</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 16px; background: #fafafa; color: #111827;">
    <h1>${escapeHtml(child.name)}'s Wishlist</h1>
    <p style="color:#4b5563;">Shared from Layette Out</p>
    ${monetizationEnabled ? `<p style="color:#6b7280;font-size:13px;">Disclosure: Some links may be affiliate links.</p>` : ''}
    <section style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;">
      ${cards}
    </section>
  </body>
</html>
  `.trim();
};
