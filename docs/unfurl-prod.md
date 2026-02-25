# Unfurl Production Setup

## Cloudflare DNS
- Name: `unfurl`
- Type: `CNAME` (or `A` if using a static IP)
- Target: `<hosting provider hostname or IP>`
- Proxy: `DNS only` (for initial debugging)

## TLS (Required for iOS)
- Serve the unfurl service over HTTPS with a valid certificate.
- iOS App Transport Security requires a valid TLS endpoint for production requests.

## Post-deploy checks

### Health check
```bash
curl -Iv https://unfurl.layetteout.com/health
```

### Unfurl endpoint check
```bash
curl -X POST https://unfurl.layetteout.com/unfurl \
  -H "Content-Type: application/json" \
  -d '{"url":"https://katequinn.com/products/short-puff-sleeve-ballet-dress-spicy-moth-scatter-organic-cotton-jersey-w528"}'
```

Expected response includes a product `title` and an `image` (or `images[0]`).
