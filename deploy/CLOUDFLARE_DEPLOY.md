# Deploying the Sphere Duel client to Cloudflare Pages

## Option A — connect your git repo (recommended, auto-deploys on push)

1. Push `sphere-duel-web/` to a GitHub/GitLab repo (it can be its own repo,
   or a subfolder of one that also has `sphere-duel/`).
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → pick the repo.
3. Build settings:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `sphere-duel-web` (only needed if it's a
     subfolder of a bigger repo — leave blank if it's the repo root)
4. **Environment variables** (Settings → Environment variables, for both
   Production and Preview):
   ```
   VITE_SERVER_URL = wss://duel.yourdomain.com
   ```
   (the domain you set up in `VPS_DEPLOY.md` — must be `wss://`, not
   `ws://`, since the site itself is served over HTTPS)
5. **Save and Deploy**. Cloudflare builds and gives you a
   `*.pages.dev` URL immediately.

## Option B — deploy from your machine, no git needed

```bash
cd sphere-duel-web
npm install
echo "VITE_SERVER_URL=wss://duel.yourdomain.com" > .env.production
npm run build

npm install -g wrangler
wrangler login
wrangler pages deploy dist --project-name=sphere-duel
```

This uploads the built `dist/` folder directly. To update later, rerun
the last two commands (`npm run build` then `wrangler pages deploy`).

## Custom domain (optional)

Pages project → **Custom domains** → **Set up a custom domain**, e.g.
`play.yourdomain.com`. Cloudflare handles the DNS + TLS for you if the
domain's already on Cloudflare.

## Verify

Open the deployed URL, enter a Unicity ID, and check the browser
console (F12) for WebSocket errors. If you see something like
`WebSocket connection to 'wss://duel.yourdomain.com/' failed`, double
check:
- the VPS's nginx + certbot setup from `VPS_DEPLOY.md` is actually live
  (`wscat -c wss://duel.yourdomain.com` from your own machine)
- `VITE_SERVER_URL` was set **before** the build ran — Vite bakes env
  vars in at build time, so changing it requires a rebuild/redeploy, not
  just a page refresh
