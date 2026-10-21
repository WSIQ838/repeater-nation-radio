import postgres from 'postgres';
import { config } from './config.ts';

export const sql = postgres(config.databaseUrl, {
  max: 20,
  onnotice: () => {},
  // jsonb/json come back already parsed; numeric -> number would lose nothing we use.
  types: { bigint: { to: 20, from: [20], serialize: (x: any) => String(x), parse: (x: string) => Number(x) } },
});

export async function migrate() {
  await sql`CREATE TABLE IF NOT EXISTS records (
    entity       text        NOT NULL,
    id           text        NOT NULL,
    data         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_date timestamptz NOT NULL DEFAULT now(),
    updated_date timestamptz NOT NULL DEFAULT now(),
    created_by   text,
    created_by_id text,
    PRIMARY KEY (entity, id)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS records_entity_created ON records (entity, created_date DESC, id)`;
  await sql`CREATE INDEX IF NOT EXISTS records_entity_updated ON records (entity, updated_date DESC, id)`;
  await sql`CREATE INDEX IF NOT EXISTS records_entity_owner ON records (entity, created_by_id)`;
  await sql`CREATE INDEX IF NOT EXISTS records_user_email ON records ((lower(data->>'email'))) WHERE entity = 'User'`;
  await sql`CREATE INDEX IF NOT EXISTS records_data_gin ON records USING gin (data jsonb_path_ops)`;

  // Login credentials live apart from the User record so they never leak through entity reads.
  await sql`CREATE TABLE IF NOT EXISTS credentials (
    user_id        text PRIMARY KEY,
    email          text NOT NULL UNIQUE,
    password_hash  text,
    email_verified boolean NOT NULL DEFAULT false,
    otp_hash       text,
    otp_expires    timestamptz,
    otp_attempts   int NOT NULL DEFAULT 0,
    reset_hash     text,
    reset_expires  timestamptz,
    token_version  int NOT NULL DEFAULT 0,
    created_date   timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS oauth_identities (
    provider text NOT NULL,
    subject  text NOT NULL,
    user_id  text NOT NULL,
    created_date timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS files (
    id text PRIMARY KEY,
    name text NOT NULL,
    path text NOT NULL,
    content_type text,
    size bigint,
    owner_id text,
    created_date timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS actor_storage (
    actor text NOT NULL, room text NOT NULL, key text NOT NULL, value jsonb,
    PRIMARY KEY (actor, room, key)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS job_runs (
    id bigserial PRIMARY KEY,
    workflow text NOT NULL,
    trigger_type text,
    status text NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    error text
  )`;
  await sql`CREATE INDEX IF NOT EXISTS job_runs_workflow ON job_runs (workflow, started_at DESC)`;
}
