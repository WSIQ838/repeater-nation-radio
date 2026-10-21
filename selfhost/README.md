# Repeater Nation self-hosting

Moving Repeater Nation off Base44. Source of truth for the plan: this file.

## Decisions
- Database: PostgreSQL. Table and column names keep Base44's exact names (quoted), so the
  data adapter maps `entities.Event.filter(...)` straight to `"Event"`.
- Constraints (NOT NULL, enums) are not enforced; legacy rows don't always satisfy them.
- Row-level-security rules are exported to `db/rls.json` and must be enforced by the
  application layer (the adapter), not by SQL policies.
- Accounts (`User`) are handled by the auth system, not an entity table. Passwords can't
  be exported; users set new ones.

## Status
- [x] 1. Schema: `db/gen_schema.py` -> `db/schema.sql` (93 tables)
- [x] 2. Data loader: `db/load_data.py`. Tested on the 2026-10-20 export:
      160,063 rows, 0 count mismatches, all values fit.
- [ ] 3. Data adapter replacing `@base44/sdk` entity calls (+ RLS from `rls.json`)
- [ ] 4. Auth (723 users, password reset flow, social connects)
- [ ] 5. Realtime (17 subscriptions, NetControlRoom actor)
- [ ] 6. Port 131 backend functions + 15 workflows
- [ ] 7. Payments (Stripe, Wix, Printful webhooks), LiveKit, file storage, domain

## Run with Docker
```
cp .env.example .env        # set POSTGRES_PASSWORD and EXPORT_DATA_DIR
docker compose up -d        # Postgres 16; creates the 93 tables on first start
docker compose --profile load run --rm loader     # loads the exported JSON
docker compose exec postgres psql -U rn rn -c 'select count(*) from "Repeater"'
```
Data lives in the `pgdata` volume. To start over: `docker compose down -v`.
Postgres listens on localhost only. (Compose file is validated but was written in a
session without a running Docker daemon; first real run is untested.)

## Rebuild the database from an export (without Docker)
```
python3 db/gen_schema.py "<export>/Repeater Nation/data/_entity_schemas.json" db/schema.sql db/rls.json
createdb rn && psql rn -v ON_ERROR_STOP=1 -f db/schema.sql
pip install "psycopg[binary]"
python3 db/load_data.py "<export>/Repeater Nation/data" "postgresql:///rn"
```
Timestamps come back from Postgres as `+00:00`; the adapter must serialize them as
ISO `...Z` to match what the frontend expects from Base44.
