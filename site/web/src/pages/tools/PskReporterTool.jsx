import { useState } from 'react';
import { RadioReceiver } from 'lucide-react';
import SpotLookup, { locatorDistanceKm } from '@/components/tools/SpotLookup';

export default function PskReporterTool() {
  const [direction, setDirection] = useState('sent');
  const normalize = (d) => (d.reports || []).map((r) => {
    const sent = d.direction !== 'heard';
    const otherLoc = sent ? r.receiverLocator : r.senderLocator;
    const myLoc = sent ? r.senderLocator : r.receiverLocator;
    return {
      time: r.time,
      other: sent ? r.receiver : r.sender,
      otherLoc,
      myLoc,
      frequencyHz: r.frequencyHz,
      snr: Number.isFinite(r.snr) ? r.snr : null,
      distanceKm: locatorDistanceKm(myLoc, otherLoc),
      extra: [r.mode, sent ? r.receiverCountry : r.senderCountry].filter(Boolean).join(' · '),
    };
  });

  return (
    <SpotLookup
      icon={RadioReceiver}
      title="PSK Reporter"
      subtitle="Where your digital signals are heard"
      action="psk"
      options={{ direction }}
      normalize={normalize}
      renderOptions={(
        <select id="psk-dir" aria-label="Show" value={direction} onChange={(e) => setDirection(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="sent">Who heard this station</option><option value="heard">What this station heard</option>
        </select>
      )}
      sourceNote="Data from PSK Reporter (pskreporter.info). Each callsign can be looked up once every 5 minutes; repeat lookups show the cached result."
      emptyHint="The station may not have transmitted digital modes in the last hour."
    />
  );
}
