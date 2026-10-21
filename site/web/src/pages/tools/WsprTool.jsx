import { useState } from 'react';
import { Waves } from 'lucide-react';
import SpotLookup from '@/components/tools/SpotLookup';

function normalize(d, call) {
  return (d.spots || []).map((s) => {
    const iSent = String(s.tx || '').toUpperCase() === call;
    return {
      time: s.time,
      other: iSent ? s.rx : s.tx,
      otherLoc: iSent ? s.rxLoc : s.txLoc,
      myLoc: iSent ? s.txLoc : s.rxLoc,
      frequencyHz: s.frequencyHz,
      snr: s.snr,
      distanceKm: Number.isFinite(s.distanceKm) ? s.distanceKm : null,
      extra: [iSent ? 'Heard by' : 'Heard', Number.isFinite(s.powerDbm) ? `${s.powerDbm} dBm` : null].filter(Boolean).join(' · '),
    };
  });
}

export default function WsprTool() {
  const [hours, setHours] = useState(24);
  return (
    <SpotLookup
      icon={Waves}
      title="WSPR Propagation"
      subtitle="Where a WSPR beacon was heard"
      action="wspr"
      options={{ hours }}
      normalize={normalize}
      renderOptions={(
        <select id="wspr-hours" aria-label="Period" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value={1}>Last hour</option><option value={6}>Last 6 hours</option><option value={24}>Last 24 hours</option>
        </select>
      )}
      sourceNote="Data from the WSPRnet database via wspr.live. Results are cached for 5 minutes."
      emptyHint="The station may not have been beaconing in this period."
    />
  );
}
