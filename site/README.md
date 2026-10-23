# Repeater Nation: self-hosted

The whole site (web app + backend + database) in Docker, off Base44.

```
browser ─► app (Deno: API, realtime, uploads, your 112 backend functions, schedules) ─► Postgres
```

Everything lives in two Docker volumes: `dbdata` (Postgres) and `uploads` (user images/files).

## 1. First run

Needs Docker Desktop (Windows/Mac) or Docker Engine (Linux). From this `site/` folder:

```powershell
copy .env.example .env        # then edit .env
```

Fill in at least `POSTGRES_PASSWORD`, `JWT_SECRET` (40+ random characters) and `PUBLIC_URL`
(the address people will type, e.g. `https://repeaternation.com`). Then:

```powershell
docker compose up -d --build
```

Open http://localhost:8080. The first build takes a few minutes.

## 2. Bring over your Base44 data

1. Get a fresh export right before switching (`tools/export-base44.py`, needs your personal Base44 key):
   ```powershell
   $env:BASE44_API_KEY = "your key"      # PowerShell; never paste it into chat or commit it
   python tools\export-base44.py
   ```
2. Put the resulting `base44-export-<date>.zip` in `site/exports/`.
3. Import (safe to repeat; it updates existing records, so a final re-run just brings things current):
   ```powershell
   docker compose run --rm app deno task import /exports/base44-export-<date>.zip
   ```
   Do this while Base44 is still up: the import also downloads uploaded images from Base44's servers.
   Any it can't fetch are listed in `import-media-failures.txt` inside the uploads volume.

**Passwords did not come across** (Base44 doesn't export them). Members sign in with *Forgot password*,
or with Google using the same e-mail, which links to their existing account.
Tell members before you switch.

## 3. E-mail (required for real use)

Set the `SMTP_*` values. Sign-up codes and password resets are e-mailed; without SMTP they are only
printed in `docker compose logs app`, so nobody new could verify an account. Any provider works
(Gmail app password, Mailgun, SES, Brevo...). Check it from an admin account by requesting a password reset.

## 4. Google sign-in

Sign-in is e-mail + password, or Google. Create an OAuth client in the Google Cloud console
(*APIs & Services -> Credentials -> OAuth client ID -> Web application*), add this as an authorized
redirect URI, and put the ID and secret in `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`:

`{PUBLIC_URL}/api/auth/oauth/google/callback`

The old Google login was Base44's own, so this one must be created fresh. Without it the Google button
shows a "not set up yet" message and e-mail sign-in still works.

## 5. Put it on the internet

- **Port forward / VPS:** point your domain's DNS at the machine, forward ports 80 and 443, set
  `SITE_DOMAIN` and `PUBLIC_URL=https://your.domain`, then `docker compose --profile https up -d`.
  Caddy gets and renews the HTTPS certificate automatically.
- **No open ports (CGNAT, etc.):** use a Cloudflare Tunnel pointed at `http://localhost:8080`.

HTTPS matters: sign-in tokens and passwords travel over it.

## 6. Re-point the outside world

| Service | Change |
|---|---|
| Stripe webhook | `{PUBLIC_URL}/api/functions/stripe-webhook` (and `payments-webhook` if used); new signing secret into `STRIPE_WEBHOOK_SECRET` |
| Printful webhook | `{PUBLIC_URL}/api/functions/printful-webhook` |
| Discord data-deletion callback | `{PUBLIC_URL}/api/functions/data-deletion-callback` |
| API-key users (`api-v1`) | old `/api/apps/<id>/functions/api-v1` URLs still work on the new server |
| `sitemap.xml` / SEO | `{PUBLIC_URL}/functions/sitemap-generator` |
| DNS | move `repeaternation.com` to the new host last |

Copy your secrets (Stripe, Printful, LiveKit, Discord ...) from Base44's secrets page into `.env`; the
names in `.env.example` match the old ones. The values were not exported.

## What runs automatically

The 16 workflows run inside the app: the FCC daily update, SOTA sync, Discord event sync, callsign recheck,
badge evaluation, sign-up hooks and so on (see `server/base44/workflows`). Times are UTC. A run missed
while the server is down is not replayed. History: table `job_runs`.
"Publish changelog to Discord" fired when you published on Base44; run it by hand after a deploy:
`POST /api/workflows/Publish%20Changelog%20to%20Discord/run` as an admin.

## Backups (do this)

```powershell
docker compose exec db pg_dump -U repeater repeaternation > backup.sql
docker run --rm -v site_uploads:/data -v ${PWD}:/out alpine tar czf /out/uploads.tgz -C /data .
```

## Notes and limits

- Run **one** app container (live updates and net-control rooms are held in memory).
- Permissions are the same rules as before (`server/base44/entities/*.json`, field `rls`). A missing
  read rule means public; a missing write rule means nobody (except backend functions).
- Not carried over: Base44's MCP/OAuth-consent feature (`OAuthConsent` page) and its built-in AI/integration
  calls other than e-mail and file upload (the code never used the others).
- The desktop radio client in the repo root still talks to Base44; it needs the same client swap.

## Development

```powershell
cd server ; deno task check     # loads every function, entity and workflow
cd web ; npm install ; npm run dev   # proxies /api to localhost:8080
```
