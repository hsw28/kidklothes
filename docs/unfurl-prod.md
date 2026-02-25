# Unfurl Production Setup (Render + Cloudflare)

## Service requirements (already implemented)
The unfurl service in `./server` is a standalone Node web service and should:
- listen on `process.env.PORT`
- bind to `0.0.0.0`
- expose:
  - `GET /health` -> `200` JSON `{ ok: true, ts: <iso> }`
  - `POST /unfurl` -> JSON metadata for `{ url: string }`

## Render deployment (Web Service)
1. Push this repo to GitHub.
2. In Render, click **New +** -> **Web Service**.
3. Connect the GitHub repo.
4. Configure the service:
   - **Name**: `layetteout-unfurl` (or similar)
   - **Root Directory**: `server`
   - **Environment**: `Node`
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm run start`
5. Add environment variable:
   - `NODE_ENV=production`
6. Deploy.

Render will assign a hostname in this format:
- `https://<service-name>.onrender.com`

Example:
- `https://layetteout-unfurl.onrender.com`

## Cloudflare DNS (layetteout.com zone)
After Render deploys successfully, add a DNS record in Cloudflare:

- **Type**: `CNAME`
- **Name**: `unfurl`
- **Target**: `<service-name>.onrender.com`
- **Proxy status**: `DNS only` (gray cloud) initially
- **TTL**: `Auto`

This will route:
- `https://unfurl.layetteout.com` -> Render service

## TLS (Required for iOS)
- Ensure `https://unfurl.layetteout.com` serves a valid TLS certificate.
- iOS App Transport Security requires HTTPS for production requests.
- Leave Cloudflare as **DNS only** initially for easier debugging. You can proxy later if desired.

## Post-deploy checks

### Health check
```bash
curl -Iv https://unfurl.layetteout.com/health
```

Expected:
- `HTTP/2 200` (or `HTTP/1.1 200`)
- JSON response body containing `ok: true`

### Unfurl endpoint check
```bash
curl -X POST https://unfurl.layetteout.com/unfurl \
  -H "Content-Type: application/json" \
  -d '{"url":"https://katequinn.com/products/short-puff-sleeve-ballet-dress-spicy-moth-scatter-organic-cotton-jersey-w528"}'
```

Expected response includes:
- `title`
- `image` or `images[0]`
