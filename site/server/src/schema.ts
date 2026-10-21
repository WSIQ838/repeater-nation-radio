import { dirname, fromFileUrl, join } from '@std/path';

const here = dirname(fromFileUrl(import.meta.url));
export const base44Dir = join(here, '..', 'base44');

export interface EntitySchema {
  name: string;
  properties: Record<string, any>;
  required?: string[];
  rls?: Record<string, any>;
}

const schemas = new Map<string, EntitySchema>();

export function loadSchemas() {
  for (const f of Deno.readDirSync(join(base44Dir, 'entities'))) {
    if (!f.name.endsWith('.json')) continue;
    const s = JSON.parse(Deno.readTextFileSync(join(base44Dir, 'entities', f.name))) as EntitySchema;
    schemas.set(s.name, s);
  }
}

export function getSchema(name: string): EntitySchema | undefined {
  return schemas.get(name);
}
export function entityNames(): string[] {
  return [...schemas.keys()];
}

// Schema defaults are filled in on create, like the hosted platform did.
export function applyDefaults(name: string, data: Record<string, any>): Record<string, any> {
  const s = schemas.get(name);
  if (!s) return data;
  const out = { ...data };
  for (const [k, p] of Object.entries(s.properties || {})) {
    if (out[k] === undefined && p && 'default' in p) out[k] = structuredClone(p.default);
  }
  return out;
}
