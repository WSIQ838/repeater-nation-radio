// Resource catalog for the public v1 API (base44/functions/api-v1). Each
// entry maps a public `resource` key to an entity, a filter deciding which
// rows are public, and a field-stripper deciding which fields of a public
// row are safe to return. Every resource also has Base44's own
// created_by_id/created_by (raw User references present on every entity)
// stripped, beyond whatever's listed per-resource below.

const BASE_STRIP = ['created_by_id', 'created_by'];

function stripFields(record: any, fields: string[]): any {
  const out: any = { ...record };
  for (const f of [...BASE_STRIP, ...fields]) delete out[f];
  return out;
}

function allowlistFields(record: any, fields: string[]): any {
  const out: any = {};
  for (const f of fields) if (f in record) out[f] = record[f];
  return out;
}

const NET_CONTROL_ALLOWLIST = [
  'id', 'name', 'description', 'net_type', 'radio_service', 'band', 'frequency',
  'mode', 'channel', 'repeater_name', 'tone', 'scheduled_date', 'start_time',
  'end_time', 'location', 'latitude', 'longitude', 'recurring', 'status',
  'operator_name', 'operator_callsign', 'club_name', 'total_checkins',
  'started_at', 'ended_at', 'duration_minutes',
];

function round2(n: any): number | undefined {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : undefined;
}

export interface ResourceConfig {
  entity: string;
  defaultSort: string;
  publicFilter: (record: any) => boolean;
  toPublic: (record: any) => any;
}

export const RESOURCE_CONFIG: Record<string, ResourceConfig> = {
  'repeaters': {
    entity: 'Repeater',
    defaultSort: '-rating',
    publicFilter: (r) => r?.hidden !== true,
    toPublic: (r) => {
      const out = stripFields(r, ['owner_user_id', 'notes']);
      if (r?.access === 'Closed') { delete out.tone; delete out.input_tone; }
      return out;
    },
  },
  'pota-parks': {
    entity: 'PotaPark',
    defaultSort: '-updated_date',
    publicFilter: (r) => r?.verification_status === 'approved',
    toPublic: (r) => stripFields(r, ['review_notes']),
  },
  'pota-activations': {
    entity: 'PotaActivation',
    defaultSort: '-created_date',
    publicFilter: (r) => r?.is_public === true,
    toPublic: (r) => stripFields(r, ['club_owner_id', 'co_host_ids']),
  },
  'clubs': {
    entity: 'Club',
    defaultSort: 'name',
    publicFilter: () => true,
    toPublic: (r) => stripFields(r, ['stripe_account_id']),
  },
  'club-pages': {
    entity: 'ClubPage',
    defaultSort: '-updated_date',
    publicFilter: () => true,
    toPublic: (r) => stripFields(r, ['club_owner_id']),
  },
  'events': {
    entity: 'Event',
    defaultSort: 'date',
    publicFilter: () => true,
    toPublic: (r) => stripFields(r, ['club_owner_id']),
  },
  'event-types': {
    entity: 'EventType',
    defaultSort: 'name',
    publicFilter: () => true,
    toPublic: (r) => stripFields(r, []),
  },
  'categories': {
    entity: 'Category',
    defaultSort: 'name',
    publicFilter: () => true,
    toPublic: (r) => stripFields(r, []),
  },
  'tags': {
    entity: 'Tag',
    defaultSort: 'name',
    publicFilter: () => true,
    toPublic: (r) => stripFields(r, []),
  },
  'badges': {
    entity: 'Badge',
    defaultSort: 'name',
    publicFilter: (r) => r?.is_secret !== true,
    toPublic: (r) => stripFields(r, []),
  },
  'net-control-sessions': {
    entity: 'NetControlSession',
    defaultSort: '-scheduled_date',
    publicFilter: (r) => r?.is_public === true,
    toPublic: (r) => {
      const out = allowlistFields(r, NET_CONTROL_ALLOWLIST);
      // Rounded to ~1km rather than dropped entirely, so "find a net near
      // me" stays useful without exposing an exact operating position.
      if (out.latitude != null) out.latitude = round2(out.latitude);
      if (out.longitude != null) out.longitude = round2(out.longitude);
      return out;
    },
  },
  'marketplace-listings': {
    entity: 'MarketplaceListing',
    defaultSort: '-created_date',
    publicFilter: () => true,
    toPublic: (r) => stripFields(r, ['seller_user_id']),
  },
};

export const RESOURCE_KEYS = Object.keys(RESOURCE_CONFIG);
