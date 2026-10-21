import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, ArrowRight, UserPlus } from 'lucide-react';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import PublicNavTabs from '@/components/PublicNavTabs';

// Matches exactly how the Base44 SDK itself builds a function-invoke URL
// (see @base44/sdk's functions module: POST /apps/<appId>/functions/<name>
// against a same-origin "" serverUrl + "/api" base) -- computed at render
// time so the docs always show the real, working URL for wherever this
// app is actually deployed, custom domain included.
const API_BASE_URL = typeof window !== 'undefined'
  ? `${window.location.origin}/api/apps/${appParams.appId}/functions/api-v1`
  : '/api/apps/<app-id>/functions/api-v1';

// Every resource below is documented from the actual server-side contract
// in base44/shared/apiV1Resources.ts -- field lists reflect exactly what
// toPublic() returns (stripped/allowlisted fields removed), sort order
// reflects the hardcoded defaultSort, and caveats reflect the real
// publicFilter logic. Every record also carries Base44's standard `id`,
// `created_date`, and `updated_date` fields; `created_by_id`/`created_by`
// are always stripped from every resource.
const RESOURCES = [
  {
    key: 'repeaters',
    label: 'Repeaters',
    description: 'The GMRS/HAM repeater directory.',
    sort: 'Highest rated first (rating, descending). Fixed — not configurable.',
    caveats: [
      'Repeaters marked hidden by an admin are excluded entirely.',
      'When access is "Closed", tone and input_tone are omitted from the response (the owner controls who sees those).',
    ],
    fields: [
      ['id', 'string', 'Unique record ID.'],
      ['name', 'string', 'Repeater name.'],
      ['callsign', 'string', 'Callsign of the licensed repeater.'],
      ['frequency', 'number', 'Output frequency in MHz.'],
      ['offset', 'number', 'Transmit offset in MHz.'],
      ['tone', 'string', 'Output (TX) CTCSS Hz or DCS code prefixed with D. Omitted for Closed repeaters.'],
      ['input_tone', 'string', 'Input (RX) tone. Omitted for Closed repeaters.'],
      ['mode', '"Analog" | "Digital" | "Mixed"', ''],
      ['access', '"Public" | "Closed"', ''],
      ['coverage_radius', 'number', 'Approximate coverage radius, miles.'],
      ['lat', 'number', ''],
      ['lng', 'number', ''],
      ['elevation', 'number', 'Site elevation, feet.'],
      ['owner', 'string', 'Callsign of the repeater operator.'],
      ['linked_system', 'string', 'Linked system name, if part of one.'],
      ['status', '"Online" | "Offline" | "Maintenance"', ''],
      ['verification', '"Verified" | "Pending" | "Needs Review" | "Rejected"', ''],
      ['hidden', 'boolean', 'Always false — hidden repeaters never appear in this list.'],
      ['rating', 'number', 'Community rating, 0–5.'],
      ['photo_url', 'string', ''],
      ['tag_ids', 'string[]', 'IDs of records from the tags resource.'],
      ['category_id', 'string', 'ID of a record from the categories resource.'],
      ['radio_service', '"GMRS" | "HAM"', ''],
    ],
    example: {
      id: '66f1a2b3c4d5e6f7a8b9c0d1', name: 'Mount Wilson GMRS Repeater', callsign: 'WRXX123',
      frequency: 462.675, offset: 5, tone: '141.3', input_tone: '141.3', mode: 'Analog', access: 'Public',
      coverage_radius: 45, lat: 34.2257, lng: -118.0632, elevation: 1740, owner: 'WRXX123', linked_system: '',
      status: 'Online', verification: 'Verified', hidden: false, rating: 4.7,
      photo_url: 'https://storage.googleapis.com/.../repeater-photo.jpg', tag_ids: ['6702ab...', '6703cd...'],
      category_id: '6704ef...', radio_service: 'GMRS',
      created_date: '2025-03-11T18:22:04.000Z', updated_date: '2026-01-04T09:15:31.000Z',
    },
  },
  {
    key: 'pota-parks',
    label: 'POTA parks',
    description: 'Parks On The Air park references — official POTA database entries plus admin-approved community submissions.',
    sort: 'Most recently updated first (updated_date, descending). Fixed.',
    caveats: ['Only parks with verification_status "approved" are returned — pending/rejected/under-review community submissions are excluded.'],
    fields: [
      ['id', 'string', ''],
      ['name', 'string', 'Official park name.'],
      ['park_number', 'string', 'Official POTA reference, e.g. US-4157.'],
      ['park_type', 'string', 'e.g. "State Park", "National Forest", "Wildlife Area" — see the source for the full enum.'],
      ['location', 'string', 'General location description.'],
      ['city', 'string', ''],
      ['state', 'string', ''],
      ['county', 'string', ''],
      ['address', 'string', ''],
      ['lat', 'number', ''],
      ['lng', 'number', ''],
      ['description', 'string', ''],
      ['website', 'string', 'Official park website.'],
      ['pota_url', 'string', 'e.g. https://pota.app/#/park/US-4157'],
      ['supporting_info', 'string', 'Extra info from a community submission.'],
      ['photo_urls', 'string[]', ''],
      ['search_keywords', 'string', 'Concatenated searchable text.'],
      ['source', '"official" | "community"', ''],
      ['verification_status', '"approved"', 'Always "approved" — everything else is filtered out before you see it.'],
      ['pota_status', '"active" | "inactive"', 'Whether the park is still active in the official POTA program.'],
      ['submitted_by_name', 'string', 'Set only for community submissions.'],
      ['submitted_at', 'string (ISO date-time)', ''],
      ['last_synced_date', 'string (ISO date-time)', 'Last time this park was touched by a sync from the official POTA database.'],
      ['activation_count', 'number', 'Cached lifetime activation count.'],
      ['last_activation_date', 'string (ISO date-time)', ''],
      ['favorites_count', 'number', ''],
    ],
    example: {
      id: '65a1...', name: 'Griffith Park', park_number: 'US-1622', park_type: 'Recreation Area',
      location: 'Los Angeles, CA', city: 'Los Angeles', state: 'CA', county: 'Los Angeles',
      address: '4730 Crystal Springs Dr, Los Angeles, CA 90027', lat: 34.1365, lng: -118.2942,
      description: 'Large urban park with several activation-friendly trailheads.',
      website: 'https://www.laparks.org/griffithpark', pota_url: 'https://pota.app/#/park/US-1622',
      supporting_info: '', photo_urls: [], search_keywords: 'griffith park los angeles ca us-1622',
      source: 'official', verification_status: 'approved', pota_status: 'active', submitted_by_name: '',
      submitted_at: null, last_synced_date: '2026-09-01T06:00:00.000Z', activation_count: 128,
      last_activation_date: '2026-09-20T15:04:00.000Z', favorites_count: 37,
      created_date: '2024-06-02T00:00:00.000Z', updated_date: '2026-09-01T06:00:00.000Z',
    },
  },
  {
    key: 'pota-activations',
    label: 'POTA activations',
    description: 'Scheduled, active, and completed park activations.',
    sort: 'Most recently created first (created_date, descending). Fixed.',
    caveats: ['Only activations the operator marked public are returned. Private (invite-only) activations never appear here, at any pageSize.'],
    fields: [
      ['id', 'string', ''],
      ['event_id', 'string', 'Linked record from the events resource, when published.'],
      ['park_id', 'string', 'Linked record from the pota-parks resource.'],
      ['park_name', 'string', 'Snapshot of the park name at scheduling time.'],
      ['park_number', 'string', ''],
      ['park_location', 'string', ''],
      ['lat', 'number', ''],
      ['lng', 'number', ''],
      ['scheduled_date', 'string (ISO date-time)', ''],
      ['end_date', 'string (ISO date-time)', 'Optional planned end time.'],
      ['radio_service', '"GMRS" | "HAM"', ''],
      ['band', 'string', 'HAM band, when radio_service is HAM.'],
      ['frequency', 'number', 'Current operating frequency, MHz.'],
      ['activation_log', 'string', 'JSON-encoded array of in-activation events (frequency changes, etc).'],
      ['channel', 'string', 'GMRS channel number/label.'],
      ['mode', '"Simplex" | "Repeater"', ''],
      ['repeater_id', 'string', 'Linked record from the repeaters resource, when mode is Repeater.'],
      ['notes', 'string', ''],
      ['status', '"Upcoming" | "Active" | "Completed" | "Cancelled"', ''],
      ['club_id', 'string', 'Blank for a personal (non-club) activation.'],
      ['club_name', 'string', ''],
      ['operator_name', 'string', ''],
      ['operator_callsign', 'string', ''],
      ['co_host_names', 'string[]', 'Display names of co-hosting operators (their user IDs are not exposed).'],
      ['is_public', 'boolean', 'Always true.'],
      ['contacts_count', 'number', 'Total logged contacts.'],
      ['roster_members', 'string', 'JSON-encoded array of planned operators.'],
      ['started_at', 'string (ISO date-time)', ''],
      ['ended_at', 'string (ISO date-time)', ''],
    ],
    example: {
      id: '66b2...', event_id: '', park_id: '65a1...', park_name: 'Griffith Park', park_number: 'US-1622',
      park_location: 'Los Angeles, CA', lat: 34.1365, lng: -118.2942, scheduled_date: '2026-10-04T15:00:00.000Z',
      end_date: '2026-10-04T20:00:00.000Z', radio_service: 'GMRS', band: '', frequency: 462.675,
      activation_log: '[]', channel: '20', mode: 'Simplex', repeater_id: '', notes: 'Two operators, morning start.',
      status: 'Upcoming', club_id: '', club_name: '', operator_name: 'Alex Rivera', operator_callsign: 'WRXX123',
      co_host_names: ['Jordan T.'], is_public: true, contacts_count: 0, roster_members: '[]',
      started_at: null, ended_at: null, created_date: '2026-09-15T12:00:00.000Z', updated_date: '2026-09-15T12:00:00.000Z',
    },
  },
  {
    key: 'clubs',
    label: 'Clubs',
    description: 'GMRS/HAM clubs registered on the platform.',
    sort: 'Alphabetical by name. Fixed.',
    caveats: [],
    fields: [
      ['id', 'string', ''],
      ['name', 'string', ''],
      ['callsign', 'string', 'Club callsign, if any.'],
      ['creator_callsign', 'string', ''],
      ['description', 'string', ''],
      ['fee_period', '"One-time" | "Monthly" | "Annual"', ''],
      ['membership_fee', 'number', ''],
      ['gamification_enabled', 'boolean', 'Whether net check-in streaks/achievements are tracked.'],
      ['leaderboard_enabled', 'boolean', ''],
      ['net_schedule', '"none" | "weekly" | "monthly"', ''],
      ['lat', 'number', ''],
      ['lng', 'number', ''],
      ['location', 'string', ''],
      ['members_count', 'number', ''],
      ['officers', 'string', ''],
      ['photo_url', 'string', ''],
      ['qualifying_checkin_types', 'string', 'JSON-encoded array, e.g. ["standard","late","guest","mobile"].'],
      ['radio_services', '("GMRS" | "HAM")[]', ''],
      ['stripe_charges_enabled', 'boolean', 'Whether the club can accept paid membership via Stripe.'],
    ],
    example: {
      id: '64c3...', name: 'Angeles Crest GMRS Club', callsign: 'WRAB123', creator_callsign: 'WRAB123',
      description: 'Weekly net covering the San Gabriel Mountains repeater network.', fee_period: 'Annual',
      membership_fee: 20, gamification_enabled: true, leaderboard_enabled: true, net_schedule: 'weekly',
      lat: 34.24, lng: -118.06, location: 'Los Angeles, CA', members_count: 214, officers: 'WRAB123, WRAC456',
      photo_url: '', qualifying_checkin_types: '["standard","late","guest","mobile"]', radio_services: ['GMRS'],
      stripe_charges_enabled: true, created_date: '2023-11-02T00:00:00.000Z', updated_date: '2026-08-30T00:00:00.000Z',
    },
  },
  {
    key: 'club-pages',
    label: 'Club pages',
    description: 'Info/rules/announcement/FAQ pages published by clubs.',
    sort: 'Most recently updated first (updated_date, descending). Fixed.',
    caveats: [],
    fields: [
      ['id', 'string', ''],
      ['club_id', 'string', 'Linked record from the clubs resource.'],
      ['title', 'string', ''],
      ['body', 'string', 'Markdown body.'],
      ['page_type', '"Info" | "Rules" | "Announcement" | "FAQ" | "Resources" | "Discussion"', ''],
      ['author_callsign', 'string', ''],
      ['author_name', 'string', ''],
      ['image_urls', 'string[]', ''],
    ],
    example: {
      id: '64d4...', club_id: '64c3...', title: 'Weekly Net Guidelines', body: '## Net format\n\n1. Check-ins by callsign\n2. Traffic\n3. Announcements',
      page_type: 'Rules', author_callsign: 'WRAB123', author_name: 'Alex Rivera', image_urls: [],
      created_date: '2024-01-10T00:00:00.000Z', updated_date: '2026-06-01T00:00:00.000Z',
    },
  },
  {
    key: 'events',
    label: 'Events',
    description: 'Community events, nets, and gatherings shown on the public calendar.',
    sort: 'By event date, ascending (soonest first). Fixed.',
    caveats: [],
    fields: [
      ['id', 'string', ''],
      ['title', 'string', ''],
      ['description', 'string', ''],
      ['type', 'string', 'Event type name — matches a name in the event-types resource.'],
      ['image_url', 'string', ''],
      ['date', 'string (ISO date-time)', ''],
      ['location', 'string', ''],
      ['lat', 'number', ''],
      ['lng', 'number', ''],
      ['organizer', 'string', ''],
      ['club_id', 'string', 'Blank for a community-wide (non-club) event.'],
      ['source_type', 'string', 'e.g. "pota_activation" or "net_control" when auto-created from another feature.'],
      ['source_id', 'string', 'ID of the originating POTA activation or Net Control session.'],
    ],
    example: {
      id: '65e5...', title: 'Fall Foliage POTA Activation', description: 'Joint club activation at Griffith Park.',
      type: 'Activation', image_url: '', date: '2026-10-04T15:00:00.000Z', location: 'Griffith Park, Los Angeles, CA',
      lat: 34.1365, lng: -118.2942, organizer: 'Angeles Crest GMRS Club', club_id: '64c3...',
      source_type: 'pota_activation', source_id: '66b2...',
      created_date: '2026-09-15T12:00:00.000Z', updated_date: '2026-09-15T12:00:00.000Z',
    },
  },
  {
    key: 'event-types',
    label: 'Event types',
    description: 'The catalog of event type labels/colors used by the events resource.',
    sort: 'Alphabetical by name. Fixed.',
    caveats: ['Disabled types remain visible here (they can still appear on existing events) but cannot be assigned to new ones in the app.'],
    fields: [
      ['id', 'string', ''],
      ['name', 'string', ''],
      ['color', 'string', 'Tailwind class pair used for the badge/card color.'],
      ['enabled', 'boolean', ''],
      ['display_order', 'number', ''],
    ],
    example: { id: '6600a...', name: 'Activation', color: 'bg-amber-100 text-amber-700', enabled: true, display_order: 2, created_date: '2023-05-01T00:00:00.000Z', updated_date: '2023-05-01T00:00:00.000Z' },
  },
  {
    key: 'categories',
    label: 'Categories',
    description: 'The category catalog used across repeaters and other directory content.',
    sort: 'Alphabetical by name. Fixed.',
    caveats: [],
    fields: [
      ['id', 'string', ''],
      ['name', 'string', 'Normalized lowercase name.'],
      ['display_name', 'string', 'Original-cased name.'],
      ['description', 'string', ''],
      ['icon', 'string', 'lucide-react icon name.'],
      ['color', 'string', 'Hex accent color.'],
      ['enabled', 'boolean', ''],
      ['display_order', 'number', ''],
    ],
    example: { id: '6704ef...', name: 'emergency', display_name: 'Emergency', description: 'Emergency and public-service repeaters.', icon: 'siren', color: '#ef4444', enabled: true, display_order: 1, created_date: '2023-05-01T00:00:00.000Z', updated_date: '2023-05-01T00:00:00.000Z' },
  },
  {
    key: 'tags',
    label: 'Tags',
    description: 'The tag catalog used across repeaters and other directory content.',
    sort: 'Alphabetical by name. Fixed.',
    caveats: [],
    fields: [
      ['id', 'string', ''],
      ['name', 'string', 'Normalized lowercase name.'],
      ['display_name', 'string', 'Original-cased name.'],
      ['color', 'string', 'Hex accent color.'],
      ['enabled', 'boolean', ''],
      ['description', 'string', ''],
    ],
    example: { id: '6702ab...', name: 'linked', display_name: 'Linked', color: '#f59e0b', enabled: true, description: 'Part of a linked repeater system.', created_date: '2023-05-01T00:00:00.000Z', updated_date: '2023-05-01T00:00:00.000Z' },
  },
  {
    key: 'badges',
    label: 'Badges',
    description: 'The achievement badge catalog members can earn.',
    sort: 'Alphabetical by name. Fixed.',
    caveats: ['Badges with is_secret: true are excluded entirely until a member has earned them, at which point they still are not exposed by this public resource (this endpoint only lists the catalog, never who has earned what).'],
    fields: [
      ['id', 'string', ''],
      ['name', 'string', ''],
      ['description', 'string', ''],
      ['icon', 'string', 'Emoji text or lucide-react icon name, depending on icon_type.'],
      ['icon_type', '"emoji" | "icon" | "image"', ''],
      ['image_url', 'string', 'Used when icon_type is "image".'],
      ['category', '"Activity" | "Contribution" | "Achievement" | "Social" | "Special" | "License"', ''],
      ['rarity', '"Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Mythic"', ''],
      ['color', 'string', 'Hex accent color.'],
      ['display_order', 'number', ''],
      ['enabled', 'boolean', ''],
      ['is_secret', 'boolean', 'Always false — secret badges are filtered out.'],
      ['requirement_type', 'string', 'The metric used to auto-evaluate this badge (long enum — see the app for the full list).'],
      ['requirement_amount', 'number', ''],
      ['requirement_period', '"all_time" | "daily" | "weekly" | "monthly" | "yearly"', ''],
      ['requirement_label', 'string', 'Human-readable description of how it’s earned.'],
      ['award_method', '"automatic" | "manual" | "both"', ''],
    ],
    example: {
      id: '6701cd...', name: 'Trail Blazer', description: 'Activate 10 different POTA parks.', icon: '🥾',
      icon_type: 'emoji', image_url: '', category: 'Activity', rarity: 'Rare', color: '#f59e0b', display_order: 12,
      enabled: true, is_secret: false, requirement_type: 'unique_repeaters', requirement_amount: 10,
      requirement_period: 'all_time', requirement_label: 'Activate 10 different POTA parks.', award_method: 'automatic',
      created_date: '2023-05-01T00:00:00.000Z', updated_date: '2023-05-01T00:00:00.000Z',
    },
  },
  {
    key: 'net-control-sessions',
    label: 'Net control sessions',
    description: 'Scheduled and past organized nets.',
    sort: 'By scheduled date, descending (most recent/upcoming first). Fixed.',
    caveats: [
      'Only sessions marked public are returned — private nets never appear here, at any pageSize.',
      'This resource uses an allowlist rather than a blocklist, so it returns fewer fields than the underlying record has — operational fields like scripts, roster details, and host user IDs are never exposed.',
      'latitude/longitude are rounded to 2 decimal places (~1km precision) rather than the exact operating position.',
    ],
    fields: [
      ['id', 'string', ''],
      ['name', 'string', ''],
      ['description', 'string', ''],
      ['net_type', '"Regular" | "Weekly" | "Community" | "Training" | "Special Event" | "Emergency" | "Other"', ''],
      ['radio_service', '"GMRS" | "HAM"', ''],
      ['band', 'string', ''],
      ['frequency', 'number', 'MHz.'],
      ['mode', '"Simplex" | "Repeater"', ''],
      ['channel', 'string', ''],
      ['repeater_name', 'string', ''],
      ['tone', 'string', ''],
      ['scheduled_date', 'string (ISO date-time)', ''],
      ['start_time', 'string', ''],
      ['end_time', 'string', ''],
      ['location', 'string', ''],
      ['latitude', 'number', 'Rounded to ~1km precision.'],
      ['longitude', 'number', 'Rounded to ~1km precision.'],
      ['recurring', '"none" | "daily" | "weekly" | "monthly"', ''],
      ['status', '"scheduled" | "active" | "ended" | "cancelled"', ''],
      ['operator_name', 'string', ''],
      ['operator_callsign', 'string', ''],
      ['club_name', 'string', ''],
      ['total_checkins', 'number', ''],
      ['started_at', 'string (ISO date-time)', ''],
      ['ended_at', 'string (ISO date-time)', ''],
      ['duration_minutes', 'number', ''],
    ],
    example: {
      id: '6612ab...', name: 'Tuesday Night GMRS Net', description: 'Weekly community check-in net.',
      net_type: 'Weekly', radio_service: 'GMRS', band: '', frequency: 462.675, mode: 'Repeater', channel: '20',
      repeater_name: 'Mount Wilson GMRS Repeater', tone: '141.3', scheduled_date: '2026-10-07T02:00:00.000Z',
      start_time: '19:00', end_time: '20:00', location: 'Los Angeles, CA', latitude: 34.23, longitude: -118.06,
      recurring: 'weekly', status: 'scheduled', operator_name: 'Alex Rivera', operator_callsign: 'WRXX123',
      club_name: 'Angeles Crest GMRS Club', total_checkins: 0, started_at: null, ended_at: null, duration_minutes: 0,
    },
  },
  {
    key: 'marketplace-listings',
    label: 'Marketplace listings',
    description: 'Buy/sell/trade listings for radio gear.',
    sort: 'Most recently created first (created_date, descending). Fixed.',
    caveats: [],
    fields: [
      ['id', 'string', ''],
      ['title', 'string', ''],
      ['description', 'string', ''],
      ['listing_type', '"For Sale" | "Wanted" | "Trade" | "Free"', ''],
      ['category', '"Radios" | "Antennas" | "Repeaters" | "Accessories" | "Parts" | "Cables" | "Power" | "Other"', ''],
      ['condition', '"New" | "Like New" | "Good" | "Used" | "For Parts"', ''],
      ['price', 'number', ''],
      ['location', 'string', ''],
      ['image_urls', 'string[]', ''],
      ['seller_name', 'string', ''],
      ['seller_callsign', 'string', ''],
      ['status', '"Active" | "Sold" | "Closed"', ''],
      ['report_count', 'number', 'Number of user reports against this listing.'],
      ['description_note', 'string', 'Optional admin-added note shown alongside the listing.'],
    ],
    example: {
      id: '6650cd...', title: 'Motorola CP200d GMRS HT, like new', description: 'Barely used, includes charger and belt clip.',
      listing_type: 'For Sale', category: 'Radios', condition: 'Like New', price: 150, location: 'Denver, CO',
      image_urls: ['https://storage.googleapis.com/.../listing1.jpg'], seller_name: 'Jordan T.', seller_callsign: 'WRAC456',
      status: 'Active', report_count: 0, description_note: '',
      created_date: '2026-09-20T14:00:00.000Z', updated_date: '2026-09-20T14:00:00.000Z',
    },
  },
];

function CodeBlock({ children }) {
  return (
    <pre className="rounded-lg border border-border bg-muted/40 p-4 overflow-x-auto text-xs sm:text-sm font-mono leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function InlineCode({ children }) {
  return <code className="px-1 py-0.5 rounded bg-muted text-xs">{children}</code>;
}

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="font-heading font-semibold text-xl">{title}</h2>
      {children}
    </section>
  );
}

function FieldsTable({ fields }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead className="bg-muted/60">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {fields.map(([name, type, note]) => (
            <tr key={name}>
              <td className="px-3 py-2 font-mono whitespace-nowrap align-top">{name}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap align-top">{type}</td>
              <td className="px-3 py-2 text-muted-foreground align-top">{note}</td>
            </tr>
          ))}
          <tr>
            <td className="px-3 py-2 font-mono whitespace-nowrap align-top">created_date</td>
            <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap align-top">string (ISO date-time)</td>
            <td className="px-3 py-2 text-muted-foreground align-top">When the record was created.</td>
          </tr>
          <tr>
            <td className="px-3 py-2 font-mono whitespace-nowrap align-top">updated_date</td>
            <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap align-top">string (ISO date-time)</td>
            <td className="px-3 py-2 text-muted-foreground align-top">When the record was last modified.</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const NAV_LINKS = [
  { id: 'quickstart', label: 'Quickstart' },
  { id: 'auth', label: 'Authentication' },
  { id: 'pagination', label: 'Pagination' },
  { id: 'filtering', label: 'Filtering & sorting' },
  { id: 'rate-limits', label: 'Rate limits' },
  { id: 'errors', label: 'Errors' },
  { id: 'versioning', label: 'Versioning' },
  { id: 'resources', label: 'Resources' },
];

export default function ApiDocs() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => { base44.auth.isAuthenticated().then(setAuthed).catch(() => {}); }, []);
  const handleLogout = async () => { await base44.auth.logout(); };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-16 px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo className="w-9 h-9" />
            <span className="font-heading font-bold text-lg">Repeater Nation</span>
          </Link>
          <PublicNavTabs />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {authed ? (
              <Button variant="ghost" size="sm" onClick={handleLogout}><LogOut className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Log out</span></Button>
            ) : (
              <Link to="/login"><Button variant="ghost" size="sm"><LogIn className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Sign in</span></Button></Link>
            )}
            {!authed ? (
              <Link to="/register"><Button size="sm" className="px-2.5 sm:px-4"><span className="hidden sm:inline">Get Started</span><UserPlus className="w-4 h-4 sm:hidden" /></Button></Link>
            ) : (
              <Link to="/dashboard"><Button size="sm" className="px-2.5 sm:px-4"><span className="hidden sm:inline">Dashboard</span> <ArrowRight className="w-4 h-4 sm:ml-1.5" /></Button></Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 py-12 grid lg:grid-cols-[220px_1fr] gap-10 items-start">
        <nav className="hidden lg:block sticky top-24 space-y-4 text-sm">
          <div>
            <div className="font-heading font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">On this page</div>
            <ul className="space-y-1.5">
              {NAV_LINKS.map((n) => (
                <li key={n.id}><a href={`#${n.id}`} className="text-muted-foreground hover:text-foreground transition-colors">{n.label}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-heading font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Resources</div>
            <ul className="space-y-1.5">
              {RESOURCES.map((r) => (
                <li key={r.key}><a href={`#res-${r.key}`} className="text-muted-foreground hover:text-foreground transition-colors">{r.label}</a></li>
              ))}
            </ul>
          </div>
        </nav>

        <main className="space-y-14 min-w-0">
          <div>
            <h1 className="font-heading font-bold text-3xl mb-2">API Documentation</h1>
            <p className="text-muted-foreground max-w-2xl">
              A read-only REST API over Repeater Nation's public data — repeaters, POTA parks and activations, clubs,
              events, and more. <strong>v1 — subject to change.</strong>{' '}
              {authed ? (
                <>Generate a key from your <Link to="/settings" className="underline hover:text-foreground">Settings</Link> under API Access.</>
              ) : (
                <><Link to="/login" className="underline hover:text-foreground">Sign in</Link> (or <Link to="/register" className="underline hover:text-foreground">create an account</Link>) to get a key — access requires a verified operator account and agreeing to the Developer API Terms.</>
              )}
            </p>
          </div>

          <Section id="quickstart" title="Quickstart">
            <p className="text-sm text-muted-foreground">
              Every request is: pick a resource, send your key, read paginated JSON back. Here's a full round trip
              against the repeaters resource.
            </p>
            <CodeBlock>{`curl -H "Authorization: Bearer rn_live_your_key_here" \\
  "${API_BASE_URL}?resource=repeaters&pageSize=2"`}</CodeBlock>
            <p className="text-sm text-muted-foreground">Response:</p>
            <CodeBlock>{`{
  "data": [
    ${JSON.stringify(RESOURCES[0].example, null, 2).split('\n').join('\n    ')},
    { "...": "second record" }
  ],
  "count": 2,
  "skip": 0,
  "pageSize": 2,
  "total": 8471
}`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              GET requests read parameters from the query string (as above). POST requests read the same parameters
              from a JSON body instead — useful if a parameter would be awkward to URL-encode:
            </p>
            <CodeBlock>{`curl -X POST "${API_BASE_URL}" \\
  -H "Authorization: Bearer rn_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"resource": "repeaters", "skip": 0, "pageSize": 50}'`}</CodeBlock>
          </Section>

          <Section id="auth" title="Authentication">
            <p className="text-sm text-muted-foreground">
              Every request needs an API key, sent as a Bearer token (or the <InlineCode>x-api-key</InlineCode> header
              as a fallback, for clients that can't easily set a custom Authorization scheme):
            </p>
            <CodeBlock>{`curl -H "Authorization: Bearer rn_live_..." \\
  "${API_BASE_URL}?resource=repeaters"

# or, equivalently:
curl -H "x-api-key: rn_live_..." \\
  "${API_BASE_URL}?resource=repeaters"`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              Keys look like <InlineCode>rn_live_</InlineCode> followed by 64 hex characters. Generate one from your
              profile's API Access panel — you'll need a verified operator account and to agree to the Developer API
              Terms once. The raw key is shown <strong>exactly once</strong>, at creation — only its hash is stored
              server-side, so if you lose it, revoke it and create a new one; there's no way to retrieve it again.
            </p>
            <p className="text-sm text-muted-foreground">
              A missing, malformed, unknown, or revoked key returns <InlineCode>401</InlineCode>. Revoking a key
              (from your profile, or by an admin) takes effect on its very next request — there's no caching or grace
              period. You can have up to 5 active keys at a time; all keys currently carry a single scope,{' '}
              <InlineCode>read:public</InlineCode>.
            </p>
          </Section>

          <Section id="pagination" title="Pagination">
            <p className="text-sm text-muted-foreground">
              Every resource takes <InlineCode>skip</InlineCode> and <InlineCode>pageSize</InlineCode> query params
              (or JSON body fields on POST). <InlineCode>pageSize</InlineCode> is capped at 200 and defaults to 50.
              Responses always include the full shape:
            </p>
            <CodeBlock>{`{
  "data": [ /* array of records, length <= pageSize */ ],
  "count": 50,      // records actually returned in this page (== data.length)
  "skip": 0,        // the skip value you sent (or the default, 0)
  "pageSize": 50,   // the pageSize actually applied, after clamping to [1, 200]
  "total": 1234     // total records available across all pages, for this resource + your access
}`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              To page through everything: start at <InlineCode>skip=0</InlineCode>, keep adding{' '}
              <InlineCode>pageSize</InlineCode> to <InlineCode>skip</InlineCode>, and stop once{' '}
              <InlineCode>skip {'>='} total</InlineCode> (which returns an empty <InlineCode>data</InlineCode> array,
              not an error). <InlineCode>total</InlineCode> can shift between requests as records are added — it's a
              snapshot at request time, not a locked cursor.
            </p>
          </Section>

          <Section id="filtering" title="Filtering & sorting">
            <p className="text-sm text-muted-foreground">
              <strong>v1 has no query-side filtering or custom sorting.</strong> Each resource is returned in one
              fixed sort order (documented per resource below) and you page through the whole public set with{' '}
              <InlineCode>skip</InlineCode>/<InlineCode>pageSize</InlineCode> — there's no{' '}
              <InlineCode>filter</InlineCode>, <InlineCode>q</InlineCode>, <InlineCode>sort</InlineCode>, or field-
              selection parameter. If you need e.g. "repeaters near me" or "events after a date," pull the pages you
              need and filter/sort client-side. This is a real v1 limitation, not an oversight — query-side filtering
              is on the list for a future version.
            </p>
          </Section>

          <Section id="rate-limits" title="Rate limits">
            <p className="text-sm text-muted-foreground">
              Standard keys: 60 requests/minute. Elevated keys (granted by an admin on request, for higher-volume
              integrations): 300/minute. Limits are per-key, on a fixed 60-second window (not a rolling average) — a
              burst that empties your budget mid-window recovers fully at the next window boundary. Every response
              carries rate-limit headers, success or error:
            </p>
            <CodeBlock>{`X-RateLimit-Limit: 60
X-RateLimit-Remaining: 57
X-RateLimit-Reset: 1717000000   # unix seconds when the current window resets`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              Exceeding the limit returns <InlineCode>429</InlineCode> with a <InlineCode>Retry-After</InlineCode>{' '}
              header (seconds until the window resets). Separately, repeated invalid-key attempts from the same IP
              address are throttled before they even reach key lookup — if you're testing key validity, use a key you
              know is correct rather than brute-forcing.
            </p>
          </Section>

          <Section id="errors" title="Errors">
            <p className="text-sm text-muted-foreground">All errors return JSON with an <InlineCode>error</InlineCode> field, and an appropriate HTTP status:</p>
            <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-muted/60"><tr className="text-left"><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Meaning</th></tr></thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="px-3 py-2 font-mono align-top">400</td><td className="px-3 py-2 text-muted-foreground">Unknown <InlineCode>resource</InlineCode>, or a malformed parameter. The error message for an unknown resource lists every valid resource key.</td></tr>
                  <tr><td className="px-3 py-2 font-mono align-top">401</td><td className="px-3 py-2 text-muted-foreground">Missing, malformed, unknown, or revoked API key.</td></tr>
                  <tr><td className="px-3 py-2 font-mono align-top">429</td><td className="px-3 py-2 text-muted-foreground">Rate limit exceeded (or, before key lookup, too many failed attempts from your IP).</td></tr>
                  <tr><td className="px-3 py-2 font-mono align-top">500</td><td className="px-3 py-2 text-muted-foreground">Something went wrong on our end. Safe to retry with backoff.</td></tr>
                </tbody>
              </table>
            </div>
            <CodeBlock>{`{ "error": "Unknown resource \\"repeter\\". Available: repeaters, pota-parks, pota-activations, ..." }`}</CodeBlock>
          </Section>

          <Section id="versioning" title="Versioning">
            <p className="text-sm text-muted-foreground">
              This is v1 and it's new — endpoint shapes, field lists, and error messages may change without a version
              bump while the API is young. Once it stabilizes, breaking changes will move to a new version path
              rather than changing v1 out from under existing integrations. If you're building something that
              matters, reach out via <Link to="/contact" className="underline hover:text-foreground">Contact</Link>{' '}
              and we'll give you a heads-up before anything changes.
            </p>
          </Section>

          <Section id="resources" title="Resources">
            <p className="text-sm text-muted-foreground">
              Every resource is fetched the same way — set <InlineCode>resource</InlineCode> to one of the keys
              below. All 12 are read-only in v1.
            </p>
            <div className="flex flex-wrap gap-2">
              {RESOURCES.map((r) => (
                <a key={r.key} href={`#res-${r.key}`} className="text-xs px-2.5 py-1 rounded-full border border-border hover:bg-accent transition-colors font-mono">{r.key}</a>
              ))}
            </div>
          </Section>

          <div className="space-y-12">
            {RESOURCES.map((r) => (
              <section key={r.key} id={`res-${r.key}`} className="scroll-mt-24 space-y-3 pt-2 border-t border-border first:border-t-0 first:pt-0">
                <div>
                  <h3 className="font-heading font-semibold text-lg">{r.label} — <code className="text-sm font-mono text-muted-foreground">{r.key}</code></h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{r.description}</p>
                </div>
                <p className="text-xs text-muted-foreground"><strong>Sort order:</strong> {r.sort}</p>
                {r.caveats.length > 0 && (
                  <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                    {r.caveats.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                )}
                <CodeBlock>{`curl -H "Authorization: Bearer rn_live_..." \\
  "${API_BASE_URL}?resource=${r.key}&pageSize=50"`}</CodeBlock>
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-primary select-none">Fields &amp; example record</summary>
                  <div className="mt-3 space-y-3">
                    <FieldsTable fields={r.fields} />
                    <p className="text-xs text-muted-foreground">Example record (one entry from <InlineCode>data</InlineCode>):</p>
                    <CodeBlock>{JSON.stringify(r.example, null, 2)}</CodeBlock>
                  </div>
                </details>
              </section>
            ))}
          </div>
        </main>
      </div>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-muted-foreground">
            <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <Logo className="w-8 h-8" />
              <span className="font-heading font-semibold text-foreground">Repeater Nation</span>
            </Link>
            <span className="text-sm">© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
