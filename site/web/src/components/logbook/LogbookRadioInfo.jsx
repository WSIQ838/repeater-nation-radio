import { useEffect, useState } from 'react';
import { Radio, RotateCcw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import FormField from '@/components/forms/FormField';
import FormInput from '@/components/forms/FormInput';
import FormSelect from '@/components/forms/FormSelect';
import { GMRS_CHANNELS } from '@/lib/gmrsChannels';
import { HAM_BANDS } from '@/lib/hamBands';

const RADIO_TYPES = ['GMRS Radio', 'Mobile Radio', 'Base Station', 'Portable Repeater', 'Repeater Equipment', 'Emergency Equipment', 'Handheld', 'Mobile', 'Other'];

const eqLabel = (eq) => {
  const detail = [eq.manufacturer, eq.model].filter(Boolean).join(' ');
  return detail ? `${eq.name} — ${detail}` : eq.name;
};

export default function LogbookRadioInfo({ radioInfo, onChange, onReset }) {
  const [equipment, setEquipment] = useState([]);

  useEffect(() => {
    Promise.all([base44.auth.me(), base44.entities.Equipment.list()])
      .then(([me, items]) => {
        setEquipment((items || []).filter((eq) => eq.created_by_id === me.id && RADIO_TYPES.includes(eq.type)));
      })
      .catch(() => setEquipment([]));
  }, []);

  const updateService = (service) => {
    onChange({ radio_service: service, band: '', channel: '', frequency: '', mode: 'Simplex' });
  };

  const selectedRadio = radioInfo.radio_used || '';
  const isCustomRadio = selectedRadio && !equipment.some((eq) => eqLabel(eq) === selectedRadio);

  return (
    <Card className="h-full overflow-hidden border-border shadow-sm rounded-xl">
      <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full bg-primary" />
            <h2 className="font-heading font-semibold text-sm">Radio Information</h2>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Saved station information used when you log a new contact. Logging a contact will not change these settings.
          </p>
        </div>
        <Radio className="w-4 h-4 text-primary shrink-0" />
      </div>

      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <FormField label="Radio Service">
          <FormSelect value={radioInfo.radio_service} onChange={(e) => updateService(e.target.value)}>
            <option value="GMRS">GMRS</option>
            <option value="HAM">Amateur Radio (HAM)</option>
          </FormSelect>
        </FormField>

        {radioInfo.radio_service === 'HAM' ? (
          <>
            <FormField label="HAM Band">
              <FormSelect value={radioInfo.band} onChange={(e) => onChange({ band: e.target.value })}>
                <option value="">Select a band…</option>
                {HAM_BANDS.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.range})</option>)}
              </FormSelect>
            </FormField>
            <FormField label="Frequency (MHz)">
              <FormInput type="number" step="0.0001" value={radioInfo.frequency} onChange={(e) => onChange({ frequency: e.target.value })} placeholder="e.g. 146.520" />
            </FormField>
          </>
        ) : (
          <>
            <FormField label="GMRS Channel">
              <FormSelect
                value={radioInfo.channel}
                onChange={(e) => {
                  const channel = e.target.value;
                  const sel = GMRS_CHANNELS.find((x) => x.ch === channel);
                  onChange({
                    channel,
                    frequency: sel ? sel.freq : '',
                    mode: sel?.type === 'repeater' ? 'Repeater' : 'Simplex',
                  });
                }}
              >
                <option value="">Select a GMRS channel…</option>
                {GMRS_CHANNELS.map((c) => (
                  <option key={c.ch} value={c.ch}>{c.type === 'repeater' ? `CH RP${c.ch}` : `CH ${c.ch}`}</option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="Frequency (MHz)">
              <FormSelect
                value={radioInfo.frequency}
                onChange={(e) => {
                  const frequency = e.target.value;
                  const sel = GMRS_CHANNELS.find((x) => x.freq === frequency);
                  onChange({
                    frequency,
                    channel: sel ? sel.ch : '',
                    mode: sel?.type === 'repeater' ? 'Repeater' : 'Simplex',
                  });
                }}
              >
                <option value="">Select frequency…</option>
                {GMRS_CHANNELS.map((c) => <option key={c.ch} value={c.freq}>{c.freq} MHz</option>)}
              </FormSelect>
            </FormField>
          </>
        )}

        <FormField label="Mode">
          <FormSelect value={radioInfo.mode} onChange={(e) => onChange({ mode: e.target.value })}>
            <option value="Simplex">Simplex</option>
            <option value="Repeater">Repeater</option>
          </FormSelect>
        </FormField>

        <FormField label="Radio Used">
          {equipment.length === 0 || isCustomRadio ? (
            <FormInput
              value={radioInfo.radio_used}
              onChange={(e) => onChange({ radio_used: e.target.value })}
              placeholder="Enter radio name"
            />
          ) : (
            <FormSelect value={radioInfo.radio_used} onChange={(e) => onChange({ radio_used: e.target.value })}>
              <option value="">Select from your equipment…</option>
              {equipment.map((eq) => <option key={eq.id} value={eqLabel(eq)}>{eqLabel(eq)}</option>)}
            </FormSelect>
          )}
        </FormField>

        <div className="sm:col-span-2 xl:col-span-3 flex items-center justify-between gap-3 pt-1">
          <div className="text-[11px] text-muted-foreground">
            These settings stay saved on this device and are applied to new log entries without being overwritten by contact or repeater data.
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onReset} title="Reset saved radio information to the default values.">
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset
          </Button>
        </div>
      </div>
    </Card>
  );
}
