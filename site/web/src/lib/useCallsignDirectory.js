import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Resolves tagged callsigns (e.g. from ProfilePost.mentions/ForumPost.mentions)
// to the member's user id, so a mention pill can link to their profile.
// Also hands back the full profile-by-user-id map, since most callers that
// need the callsign directory also want author avatars for the same posts.
// Shared across every place mentions are rendered rather than each one
// re-fetching Profile records itself.
export default function useCallsignDirectory() {
  const [callsignToUserId, setCallsignToUserId] = useState({});
  const [profileByUserId, setProfileByUserId] = useState({});

  useEffect(() => {
    let cancelled = false;
    base44.entities.Profile.list('-updated_date', 500)
      .then((profiles) => {
        if (cancelled) return;
        const byCallsign = {};
        const byUserId = {};
        (profiles || []).forEach((p) => {
          if (p?.callsign && p?.created_by_id) byCallsign[p.callsign.trim().toUpperCase()] = p.created_by_id;
          if (p?.created_by_id) byUserId[p.created_by_id] = p;
        });
        setCallsignToUserId(byCallsign);
        setProfileByUserId(byUserId);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return { callsignToUserId, profileByUserId };
}
