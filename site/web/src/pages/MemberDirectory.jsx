import { useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, UserSearch } from 'lucide-react';
import MemberCard from '@/components/members/MemberCard';
import { formatOnlineStatus } from '@/lib/onlineStatus';

const PAGE_SIZE = 30;

const ALLOWED_ROLES = new Set([
  'user',
  'member',
  'admin',
  'super_admin',
  'moderator',
  'editor',
  'support_staff',
]);

function normalizeRole(role) {
  const normalized = role == null
    ? 'user'
    : String(role).trim().toLowerCase();

  return ALLOWED_ROLES.has(normalized) ? normalized : 'user';
}

// Members usually store their state as a 2-letter code ("OH") while people search
// by name ("Ohio"), so the directory understands both.
const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'],
  ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
  ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'],
  ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'], ['PR', 'Puerto Rico'],
];
const CODE_TO_STATE = Object.fromEntries(US_STATES);
const STATE_TO_CODE = Object.fromEntries(US_STATES.map(([code, name]) => [name.toLowerCase(), code]));

// Best-effort 2-letter state code for a profile: the state field (code or full name),
// falling back to a trailing ", OH" in the free-text location.
function profileStateCode(p) {
  const raw = (p.state || '').trim();
  if (raw) {
    const up = raw.toUpperCase();
    if (CODE_TO_STATE[up]) return up;
    if (STATE_TO_CODE[raw.toLowerCase()]) return STATE_TO_CODE[raw.toLowerCase()];
  }
  const m = (p.location || '').match(/,\s*([A-Za-z]{2})\s*$/);
  if (m && CODE_TO_STATE[m[1].toUpperCase()]) return m[1].toUpperCase();
  return '';
}

function profileMatchesQuery(p, q) {
  const lc = (s) => (s || '').toLowerCase();
  if ([p.display_name, p.callsign, p.location, p.city, p.state].some((f) => lc(f).includes(q))) return true;
  // "ohio" or "oh" -> also match members whose state is stored the other way round.
  const code = STATE_TO_CODE[q] || (CODE_TO_STATE[q.toUpperCase()] ? q.toUpperCase() : '');
  return !!code && profileStateCode(p) === code;
}

function normalizeRoleMap(roleMap) {
  if (!roleMap || typeof roleMap !== 'object') return {};

  const normalized = {};
  Object.entries(roleMap).forEach(([userId, role]) => {
    if (userId) normalized[userId] = normalizeRole(role);
  });

  return normalized;
}

export default function MemberDirectory() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [licenseFilter, setLicenseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [me, setMe] = useState(null);
  const [presence, setPresence] = useState({});
  const [roles, setRoles] = useState({});
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let active = true;

    // Auth and the directory are independent. Start both immediately so the
    // first screen is gated by only the slower of the two requests.
    Promise.all([
      base44.auth.me().catch(() => null),
      base44.functions.invoke('public-member-directory', {}).then((r) => {
        const body = r?.data || r;
        if (body?.error) throw new Error(body.error);
        if (!Array.isArray(body?.members)) throw new Error('The member directory returned an invalid response.');
        return body.members;
      }),
    ]).then(([currentUser, profileRows]) => {
      if (!active) return;
      setMe(currentUser);
      setProfiles(profileRows);
      setLoadError('');
    }).catch((error) => {
      if (!active) return;
      console.error('[members] directory load failed', error);
      setProfiles([]);
      setLoadError(error?.message || 'Could not load the member directory. Please try again.');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!profiles.length) {
      setRoles({});
      return;
    }

    const ids = [
      ...new Set(profiles.map((p) => p.created_by_id).filter(Boolean).map(String)),
    ];

    if (!ids.length) {
      setRoles({});
      return;
    }

    let active = true;

    // get-member-roles caps each call at 300 ids server-side, so a directory
    // past that size needs batching -- same reason presence, below, is
    // already batched at 100 ids per call.
    const batches = [];
    for (let i = 0; i < ids.length; i += 250) batches.push(ids.slice(i, i + 250));

    Promise.all(batches.map((batch) =>
      base44.functions.invoke('get-member-roles', { user_ids: batch })
        .then((r) => r?.data?.roles || r?.roles || {})
        .catch(() => ({}))
    )).then((results) => {
      if (!active) return;
      setRoles(normalizeRoleMap(Object.assign({}, ...results)));
    });

    return () => {
      active = false;
    };
  }, [profiles]);

  useEffect(() => {
    if (!profiles.length || !me) return;

    // The directory is sorted alphabetically by display name, unrelated to
    // whatever order profiles came back in — capping this at the first 100
    // meant presence was effectively random past that point, missing most
    // of an alphabetically-later page entirely. getFriendsPresence itself
    // caps each call at 100 ids, so cover everyone by batching.
    const ids = profiles.map((p) => p.created_by_id).filter(Boolean);
    if (!ids.length) return;

    const batches = [];
    for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));

    let active = true;

    const fetchPresence = () => {
      if (document.hidden) return; // don't poll from a background tab
      Promise.all(batches.map((batch) =>
        base44.functions.invoke('getFriendsPresence', { user_ids: batch, requester_id: me.id })
          .then((r) => r?.data?.users || r?.users || [])
          .catch(() => [])
      )).then((results) => {
        if (!active) return;
        const map = {};
        results.flat().forEach((u) => {
          if (u?.id) map[u.id] = u;
        });
        setPresence(map);
      });
    };

    fetchPresence();
    // Every member's status, so poll gently: once a minute, never from a
    // hidden tab, and catch up straight away when the tab is shown again.
    const interval = setInterval(fetchPresence, 60000);
    const onVisible = () => { if (!document.hidden) fetchPresence(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [profiles, me]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, licenseFilter, statusFilter, stateFilter]);

  // States that actually have members, with counts, for the State filter.
  const stateOptions = useMemo(() => {
    const counts = {};
    profiles.forEach((p) => {
      const code = profileStateCode(p);
      if (code) counts[code] = (counts[code] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([code, n]) => ({ code, n, name: CODE_TO_STATE[code] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles]);

  const withLocation = useMemo(() => profiles.filter((p) => profileStateCode(p)).length, [profiles]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();

    const matches = profiles.filter((p) => {
      if (q && !profileMatchesQuery(p, q)) return false;
      if (stateFilter !== 'all' && profileStateCode(p) !== stateFilter) return false;

      if (licenseFilter === 'active' && p.license_status !== 'Active') return false;
      if (licenseFilter === 'unverified' && p.license_status === 'Active') return false;

      if (statusFilter !== 'all') {
        const last = presence[p.created_by_id]?.last_active;
        const st = last ? formatOnlineStatus(last) : { status: 'offline' };

        if (statusFilter === 'online' && st.status !== 'online') return false;
        if (statusFilter === 'idle' && st.status !== 'idle') return false;
        if (statusFilter === 'offline' && st.status !== 'offline') return false;
      }

      return true;
    });

    matches.sort((a, b) => {
      const an = (a.display_name || a.callsign || '').toLowerCase();
      const bn = (b.display_name || b.callsign || '').toLowerCase();
      return an.localeCompare(bn);
    });

    return matches;
  }, [profiles, presence, query, licenseFilter, statusFilter, stateFilter]);

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-heading font-bold">Members</h1>
        <p className="text-muted-foreground mt-1">
          Find and connect with other GMRS and HAM operators
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search callsign, name, or location…"
            className="pl-9"
          />
        </div>

        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="all">All States</option>
          {stateOptions.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.n})</option>)}
        </select>

        <select
          value={licenseFilter}
          onChange={(e) => setLicenseFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="all">All Licenses</option>
          <option value="active">Active Only</option>
          <option value="unverified">Unverified</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="all">All Status</option>
          <option value="online">Online</option>
          <option value="idle">Idle</option>
          <option value="offline">Offline</option>
        </select>
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} of {profiles.length} members
      </p>
      {withLocation < profiles.length && (
        <p className="text-xs text-muted-foreground -mt-4">
          Only {withLocation} of {profiles.length} members have added a state to their profile, so location searches can only find those members.
        </p>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : loadError ? (
        <Card className="p-8 text-center">
          <UserSearch className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="font-heading font-semibold text-lg">Members could not be loaded</h2>
          <p className="text-sm text-muted-foreground mt-1">{loadError}</p>
          <p className="text-xs text-muted-foreground mt-2">Refresh the page to try again.</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <UserSearch className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="font-heading font-semibold text-lg">No members found</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Try adjusting your search.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.slice(0, visibleCount).map((p) => (
              <MemberCard
                key={p.id}
                profile={p}
                presence={presence[p.created_by_id]}
                role={roles[String(p.created_by_id)] || 'user'}
              />
            ))}
          </div>

          {visibleCount < filtered.length && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                Load more ({filtered.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}