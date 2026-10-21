import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadToolsConfig } from '@/lib/configCache';
import { Button } from '@/components/ui/button';
import { Radio, ArrowLeft } from 'lucide-react';
import RadioMonitorGrid from '@/components/radio/RadioMonitorGrid';

// ===== APP-SPECIFIC =====
// A bookmarkable/shareable URL for the web radio: up to 12 admin-chosen
// channels (Admin -> Web Radio -> Monitor Grid), each rendered as its own
// always-listening mini radio -- open a new tab, paste this link, and start
// monitoring several channels at once. This is receive-only; to actually
// transmit, use the normal floating radio widget (still available on every
// page, including this one) and tune it to whichever channel you want to
// talk on.
// ===== END APP-SPECIFIC =====

export default function RadioPage() {
  const navigate = useNavigate();
  const [radioEnabled, setRadioEnabled] = useState(null); // null = not checked yet

  useEffect(() => {
    loadToolsConfig().then((config) => {
      setRadioEnabled(!!config?.radio_enabled);
    }).catch(() => setRadioEnabled(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2">
        <ArrowLeft className="w-4 h-4" /> Back
      </Button>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center shrink-0">
          <Radio className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="font-heading font-bold text-xl">Web Radio</h1>
          <p className="text-sm text-muted-foreground">
            {radioEnabled === false
              ? 'The web radio is currently turned off site-wide — check back later.'
              : 'Listen to several channels at once. To talk, open the radio button in the corner and tune it to a channel.'}
          </p>
        </div>
      </div>

      {radioEnabled !== false && <RadioMonitorGrid />}
    </div>
  );
}
