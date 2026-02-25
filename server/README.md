# layetteout unfurl service

Minimal Node + Express TypeScript service for URL unfurling.

## Endpoint

`POST /unfurl`

Request body:

```json
{ "url": "https://example.com/product" }
```

Response body:

```json
{
  "title": "Example Product",
  "imageUrl": "https://example.com/image.jpg",
  "siteName": "Example",
  "canonicalUrl": "https://example.com/product"
}
```

## Safety behavior

- Allows only `http` and `https` URLs
- Request timeout: 6 seconds
- Max HTML size: 1 MB
- Custom User-Agent header
- In-memory LRU cache with 24h TTL

## Run

From `/Users/Hannah/Programming/layetteout/server`:

```bash
npm install
npm run dev
```

Build + run:

```bash
npm run build
npm run start
```

Default port is `4000` (override with `PORT`).
