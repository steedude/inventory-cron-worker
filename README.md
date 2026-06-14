# inventory-cron-worker

Cloudflare Cron Worker for triggering the inventory app low-stock check endpoint.

## Architecture

```txt
Cloudflare Cron Worker
  -> POST /api/inventory/low-stock-check
  -> Nuxt server API
  -> Supabase service role query
```

The Worker only triggers the scheduled job. Supabase access and future notification logic should stay in the Nuxt API.

## Schedule

The worker runs daily at `04:00` UTC, configured in `wrangler.jsonc`.

This is `12:00` in Taiwan time because Cloudflare Cron Triggers use UTC.

```txt
0 4 * * *
```

## Required secrets

Set these Worker variables in Cloudflare:

```powershell
npx wrangler secret put INVENTORY_APP_URL
npx wrangler secret put INVENTORY_CRON_SECRET
```

`INVENTORY_APP_URL` should be the base URL of the inventory app, for example `https://inventory.example.com`.

The Nuxt/Vercel project must also have:

```txt
INVENTORY_CRON_SECRET
SUPABASE_SERVICE_ROLE_KEY
```

`INVENTORY_CRON_SECRET` must be the same value in both Cloudflare Workers and the Nuxt/Vercel project.

## Scripts

```powershell
npm run dev
npm run typecheck
npm run deploy
```

## Cloudflare Git deployment

1. Push this repo to GitHub as `inventory-cron-worker`.
2. Open Cloudflare Dashboard.
3. Go to `Workers & Pages`.
4. Choose `Create application`.
5. Choose `Import a repository`.
6. Select the GitHub repo.
7. Use this deploy command:

```txt
npx wrangler deploy
```

8. Add these Worker variables:

```txt
INVENTORY_APP_URL=https://inventory-omega-bay.vercel.app
INVENTORY_CRON_SECRET=<same-secret-as-nuxt>
```

## Manual trigger

You can manually trigger the same low-stock check with:

```powershell
curl -X POST https://<worker-url>/run -H "Authorization: Bearer <INVENTORY_CRON_SECRET>"
```
