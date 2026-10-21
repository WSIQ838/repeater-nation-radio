import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Image } from '@/components/ui/image';
import {
  MapPin,
  Radio,
  Mail,
  ShieldCheck,
  Scale,
  PenSquare,
  LifeBuoy,
  Crown,
  CircleUserRound,
} from 'lucide-react';
import { formatOnlineStatus } from '@/lib/onlineStatus';
import StaffTag from '@/components/shared/StaffTag';
import Linkify from '@/components/shared/Linkify';

const ROLE_ICONS = {
  member: {
    icon: CircleUserRound,
    label: 'Member',
    color: 'text-muted-foreground',
  },
  super_admin: {
    icon: Crown,
    label: 'Super Admin',
    color: 'text-amber-500',
  },
  admin: {
    icon: ShieldCheck,
    label: 'Admin',
    color: 'text-primary',
  },
  moderator: {
    icon: Scale,
    label: 'Moderator',
    color: 'text-blue-500',
  },
  editor: {
    icon: PenSquare,
    label: 'Editor',
    color: 'text-purple-500',
  },
  support_staff: {
    icon: LifeBuoy,
    label: 'Support',
    color: 'text-cyan-500',
  },
};

function normalizeRole(role) {
  if (!role) return 'user';
  return String(role).trim().toLowerCase();
}

function RoleIcon({ role }) {
  const normalizedRole = normalizeRole(role);
  const cfg = ROLE_ICONS[normalizedRole];

  // Regular users without an explicit member/staff role do not get a role icon.
  if (!cfg) return null;

  const Icon = cfg.icon;

  return (
    <span
      title={cfg.label}
      className={`inline-flex items-center ${cfg.color}`}
      aria-label={cfg.label}
    >
      <Icon className="w-4 h-4" />
    </span>
  );
}

function MemberOnlineStatus({ lastActive }) {
  const status = formatOnlineStatus(lastActive);

  let className = 'text-muted-foreground';
  let label = status.text;

  if (status.status === 'online') {
    className = 'text-success font-medium';
    label = '🟢 Online';
  } else if (status.status === 'idle') {
    className = 'text-amber-500 font-medium';
    label = '🟡 Idle';
  }

  return (
    <div className={`text-xs mt-0.5 ${className}`}>
      {label}
    </div>
  );
}

function MemberCard({ profile, presence, role }) {
  const p = profile;
  const initial = (p.display_name || p.callsign || '?')
    .charAt(0)
    .toUpperCase();

  return (
    <Link to={`/members/${p.created_by_id}`} className="block">
      <Card className="p-4 hover:shadow-md hover:border-primary/40 transition-all h-full">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-primary text-primary-foreground overflow-hidden shrink-0 grid place-items-center">
            {p.avatar_url ? (
              <Image
                src={p.avatar_url}
                alt="avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xl font-heading font-bold">
                {initial}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold truncate">
                {p.display_name || 'Operator'}
              </span>

              {/* Staff get the same tag they have everywhere else; members keep their icon. */}
              <StaffTag userId={p.created_by_id} />
              {normalizeRole(role) === 'member' && <RoleIcon role={role} />}
            </div>

            {p.callsign && (
              <div className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                <Radio className="w-3 h-3" />
                {p.callsign}
                {(p.license_service === 'HAM' || p.license_service === 'GMRS') && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${p.license_service === 'HAM' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {p.license_service}
                  </span>
                )}
              </div>
            )}

            {presence?.last_active && (
              <MemberOnlineStatus lastActive={presence.last_active} />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
          {(p.city || p.state || p.location) && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MapPin className="w-3 h-3" />
              {[p.city, p.state].filter(Boolean).join(', ') || p.location}
            </span>
          )}
        </div>

        {p.bio && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
            <Linkify text={p.bio} nested />
          </p>
        )}

        <div className="flex items-center gap-1 text-xs text-primary mt-3 font-medium">
          <Mail className="w-3.5 h-3.5" />
          View profile
        </div>
      </Card>
    </Link>
  );
}

export default memo(MemberCard);
