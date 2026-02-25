# Unfurl Production Setup (Cloudflare Worker)

## Deploy the Worker
1. Install dependencies:
   ```bash
   cd unfurl-worker
   npm i
   ```
2. Login to Cloudflare:
   ```bash
   npx wrangler login
   ```
3. Deploy:
   ```bash
   npm run deploy
   ```

## Bind the custom domain
In Cloudflare Dashboard:
1. Go to **Workers & Pages**
2. Open **layetteout-unfurl**
3. Open **Triggers**
4. Under **Custom Domains**, add:
   - `unfurl.layetteout.com`

Cloudflare will manage the routing and certificate for the Worker custom domain.

## Verify
### Health check
```bash
curl -Iv https://unfurl.layetteout.com/health
```

### Unfurl endpoint check
```bash
curl -X POST https://unfurl.layetteout.com/unfurl -H "Content-Type: application/json" -d '{"url":"https://katequinn.com/products/short-puff-sleeve-ballet-dress-spicy-moth-scatter-organic-cotton-jersey-w528"}'
```

Expected response includes:
- `title`
- `image` or `images[0]`
