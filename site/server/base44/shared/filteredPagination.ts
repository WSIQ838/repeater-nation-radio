// Cursor-based pagination helper that loads all matching records for an entity
// using a filter query, unlike listAll (which loads every record regardless of
// service). Use this for dedup checks that only need one radio service.
//
// Usage:
//   const gmrs = await listAllByFilter(base44.asServiceRole.entities.Repeater, { radio_service: 'GMRS' }, { fields: ['callsign', 'frequency'] });
export async function listAllByFilter(entity: any, query: any, opts?: { sort?: string; limit?: number; fields?: string[]; maxRecords?: number }): Promise<any[]> {
  const sort = opts?.sort || '-created_date';
  const limit = opts?.limit || 500;
  const maxRecords = opts?.maxRecords || 30000;
  const fields = opts?.fields;
  const out: any[] = [];
  let cursor: string | undefined = undefined;
  for (let i = 0; i < maxRecords; i += limit) {
    const pageOpts: any = { sort, limit };
    if (cursor) pageOpts.cursor = cursor;
    if (fields) pageOpts.fields = fields;
    const page = await entity.filter(query, pageOpts);
    const items = page?.items || page || [];
    if (!items.length) break;
    out.push(...items);
    if (page?.has_more === false || !page?.next_cursor) break;
    cursor = page.next_cursor;
    if (items.length < limit) break;
  }
  return out;
}