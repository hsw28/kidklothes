# Layette Out Unfurl Worker

Cloudflare Worker implementation of the unfurl service used by the mobile app.

## Install
```bash
cd unfurl-worker
npm i
```

## Local dev
```bash
npm run dev
```

## Deploy
```bash
npm run deploy
```

## Bind custom domain (Cloudflare Dashboard)
1. Go to **Workers & Pages**
2. Open **layetteout-unfurl**
3. Open **Triggers**
4. Under **Custom Domains**, add:
   - `unfurl.layetteout.com`

Then verify:
```bash
curl -Iv https://unfurl.layetteout.com/health
curl -X POST https://unfurl.layetteout.com/unfurl -H "Content-Type: application/json" -d '{"url":"https://katequinn.com/products/short-puff-sleeve-ballet-dress-spicy-moth-scatter-organic-cotton-jersey-w528"}'
```
