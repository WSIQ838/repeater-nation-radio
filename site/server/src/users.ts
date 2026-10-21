import { sql } from './db.ts';
import * as entities from './entities.ts';
import { serialize } from './entities.ts';

const SERVICE = { user: null, service: true } as const;

export async function findUserByEmail(email: string) {
  const e = email.trim().toLowerCase();
  const [row] = await sql`SELECT id, data, created_date, updated_date, created_by, created_by_id FROM records
    WHERE entity = 'User' AND lower(data->>'email') = ${e} LIMIT 1`;
  return row ? serialize(row) : null;
}

export async function findUserById(id: string) {
  const [row] = await sql`SELECT id, data, created_date, updated_date, created_by, created_by_id FROM records WHERE entity = 'User' AND id = ${id}`;
  return row ? serialize(row) : null;
}

export async function createUser(fields: { email: string; full_name?: string; role?: string; [k: string]: any }) {
  const email = fields.email.trim().toLowerCase();
  return await entities.create('User', SERVICE, {
    role: 'user',
    is_verified: false,
    account_status: 'active',
    ...fields,
    email,
    full_name: fields.full_name || email.split('@')[0],
  });
}

export async function patchUser(id: string, patch: Record<string, any>) {
  return await entities.update('User', SERVICE, id, patch);
}
