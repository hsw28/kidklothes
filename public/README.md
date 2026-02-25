# Layette Out static site (Cloudflare Pages)

This `/public` folder is a plain static site and can be deployed directly to Cloudflare Pages.

## Deploy (Cloudflare Pages)

1. Push this repo to GitHub (if not already).
2. In Cloudflare Dashboard, go to **Workers & Pages** -> **Create application** -> **Pages**.
3. Connect your GitHub repo and select `LayetteOut`.
4. Build settings:
   - Framework preset: `None`
   - Build command: *(leave empty)*
   - Build output directory: `public`
5. Deploy.
6. Add your custom domain `layetteout.com` in the Pages project settings.

## Local preview

Open `public/index.html` directly in a browser, or serve the repo with any static server.
