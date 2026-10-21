import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileDown, FileUp, Loader2, Download, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import ToolConsole, { TABLE, THEAD, TH, TR, TD } from '@/components/tools/ToolConsole';
import { Panel } from '@/components/console/Console';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { base44 } from '@/api/base44Client';
import { parseAdif, adifRecordToContact, contactsToAdif } from '@/lib/adif';
import { loadAllContacts, importContactsGently, isDuplicateContact, MAX_IMPORT, IMPORT_BATCH_SIZE as BATCH_SIZE, IMPORT_BATCH_PAUSE_MS as BATCH_PAUSE_MS } from '@/lib/myContacts';

// Imports go through importContactsGently (small spaced batches, capped per
// file) so a large log can't hit the app's shared rate limit.

export default function AdifTool() {
  const [me, setMe] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [preview, setPreview] = useState(null); // { fileName, ready, duplicates, invalid, truncated }
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const cancelRef = useRef(false);

  useEffect(() => { base44.auth.me().then(setMe).catch(() => setMe(null)); }, []);

  const doExport = async () => {
    if (!me) return;
    setExporting(true); setExportMsg(''); setError('');
    try {
      const rows = await loadAllContacts(me.id);
      if (!rows.length) { setExportMsg('Your logbook has no contacts to export yet.'); return; }
      const text = contactsToAdif(rows.slice().reverse());
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `repeater-nation-log-${new Date().toISOString().slice(0, 10)}.adi`;
      a.click();
      URL.revokeObjectURL(url);
      setExportMsg(`Exported ${rows.length} contact${rows.length === 1 ? '' : 's'}.`);
    } catch (e) {
      setError(e?.message || 'Could not export your logbook.');
    } finally {
      setExporting(false);
    }
  };

  const onFile = async (file) => {
    setPreview(null); setResult(null); setError('');
    if (!file || !me) return;
    if (file.size > 10 * 1024 * 1024) { setError('That file is larger than 10 MB. Split it into smaller ADIF files.'); return; }
    try {
      const { records } = parseAdif(await file.text());
      if (!records.length) { setError('No ADIF records were found in that file. Is it an .adi file?'); return; }
      const existing = await loadAllContacts(me.id);
      const ready = []; const duplicates = []; const invalid = [];
      for (const rec of records) {
        const { contact, error: why } = adifRecordToContact(rec);
        if (!contact) { invalid.push(`${rec.call || '(no call)'}: ${why}`); continue; }
        if (isDuplicateContact(contact, existing) || isDuplicateContact(contact, ready)) duplicates.push(contact);
        else ready.push(contact);
      }
      setPreview({ fileName: file.name, total: records.length, ready: ready.slice(0, MAX_IMPORT), truncated: Math.max(0, ready.length - MAX_IMPORT), duplicates, invalid });
    } catch (e) {
      setError(e?.message || 'Could not read that file.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doImport = async () => {
    if (!preview?.ready?.length) return;
    setImporting(true); setProgress(0); setError(''); cancelRef.current = false;
    const res = await importContactsGently(preview.ready, {
      onProgress: (done, total) => setProgress(Math.round((done / total) * 100)),
      isCancelled: () => cancelRef.current,
    });
    setResult(res);
    setPreview(null);
    setImporting(false);
  };

  const etaMin = preview?.ready?.length ? Math.max(1, Math.ceil((preview.ready.length / BATCH_SIZE) * (BATCH_PAUSE_MS / 1000) / 60)) : 0;

  return (
    <ToolConsole
      icon={FileDown}
      title="ADIF Import / Export"
      subtitle="Move contacts between loggers"
      actions={(
        <>
          <input ref={fileRef} type="file" accept=".adi,.adif,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={!me || importing}><FileUp className="w-4 h-4 mr-1.5" /> Import ADIF</Button>
          <Button size="sm" onClick={doExport} disabled={!me || exporting}>{exporting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />} Export ADIF</Button>
        </>
      )}
      kpis={[
        { label: 'Ready to import', value: preview ? preview.ready.length : '—', tone: 'primary' },
        { label: 'Already in log', value: preview ? preview.duplicates.length : '—' },
        { label: 'Unreadable', value: preview ? preview.invalid.length : '—' },
        { label: 'Imported', value: result ? result.created : '—', tone: 'success' },
      ]}
      footnote="Works with LoTW, QRZ, eQSL, WSJT-X, N1MM, Log4OM and any logger that reads or writes ADIF."
    >
      {error && <Panel title="Problem" accent="danger"><p className="p-3.5 text-sm text-destructive flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}</p></Panel>}

      <div className="grid xl:grid-cols-2 gap-3 items-start">
        <Panel title="Export your logbook" accent="success">
          <div className="p-3.5 space-y-3">
            <p className="text-sm text-muted-foreground">Download every contact in your <Link to="/logbook" className="text-primary hover:underline">logbook</Link> as an ADIF (.adi) file you can upload to LoTW, QRZ, eQSL, or another logger.</p>
            <Button size="sm" onClick={doExport} disabled={!me || exporting}>
              {exporting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileDown className="w-4 h-4 mr-1.5" />} Export ADIF
            </Button>
            {exportMsg && <p className="text-sm text-muted-foreground">{exportMsg}</p>}
          </div>
        </Panel>

        <Panel title="Import contacts" meta={`up to ${MAX_IMPORT} per file`}>
          <div className="p-3.5 space-y-3">
            <p className="text-sm text-muted-foreground">Add contacts from an ADIF file to your logbook. Contacts already in your log (same callsign within 2 minutes) are skipped.</p>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={!me || importing}>
              <Upload className="w-4 h-4 mr-1.5" /> Choose ADIF file
            </Button>
          </div>
        </Panel>
      </div>

      {preview && !importing && (
        <Panel title={preview.fileName} meta={`${preview.ready.length} new`}>
          <div className="p-3.5 space-y-2 text-sm">
            <p><span className="font-semibold">{preview.ready.length}</span> new contact{preview.ready.length === 1 ? '' : 's'} ready to import
              {preview.duplicates.length > 0 && <span className="text-muted-foreground"> · {preview.duplicates.length} already in your logbook (skipped)</span>}
              {preview.invalid.length > 0 && <span className="text-muted-foreground"> · {preview.invalid.length} could not be read (skipped)</span>}
            </p>
            {preview.truncated > 0 && <p className="text-amber-600 dark:text-amber-400">{preview.truncated} more are over the {MAX_IMPORT}-contact limit — import this file again afterwards to add them.</p>}
          </div>
          {preview.ready.length > 0 && (
            <div className="overflow-x-auto max-h-64 overflow-y-auto scrollbar-thin border-t border-border">
              <table className={TABLE}>
                <thead className={`${THEAD} sticky top-0`}><tr><th className={TH}>Date (UTC)</th><th className={TH}>Callsign</th><th className={TH}>Service</th><th className={TH}>Freq / band</th><th className={TH}>Name</th></tr></thead>
                <tbody>
                  {preview.ready.slice(0, 100).map((c, i) => (
                    <tr key={`${c.callsign}-${c.date}-${i}`} className={TR}>
                      <td className={`${TD} whitespace-nowrap font-mono text-[12px]`}>{c.date.slice(0, 16).replace('T', ' ')}</td>
                      <td className={`${TD} font-mono text-primary`}>{c.callsign}</td>
                      <td className={TD}>{c.radio_service}</td>
                      <td className={`${TD} font-mono text-[12px]`}>{c.frequency ?? ''}{c.band ? ` (${c.band})` : ''}</td>
                      <td className={TD}>{c.contact_name || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.ready.length > 100 && <div className="px-3.5 py-2 text-[11px] text-muted-foreground border-t border-border bg-muted/30">…and {preview.ready.length - 100} more</div>}
            </div>
          )}
          <div className="p-3.5 space-y-2 border-t border-border">
            {preview.invalid.length > 0 && (
              <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Show skipped records</summary><ul className="mt-1 list-disc pl-5">{preview.invalid.slice(0, 50).map((x, i) => <li key={i}>{x}</li>)}</ul></details>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={doImport} disabled={!preview.ready.length}>Import {preview.ready.length} contact{preview.ready.length === 1 ? '' : 's'}</Button>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Cancel</Button>
              {preview.ready.length > BATCH_SIZE && <span className="text-xs text-muted-foreground">Takes about {etaMin} minute{etaMin === 1 ? '' : 's'} — keep this tab open.</span>}
            </div>
          </div>
        </Panel>
      )}

      {importing && (
        <Panel title="Importing" meta="keep this tab open">
          <div className="p-3.5 space-y-3">
            <div className="flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Importing…</div>
            <Progress value={progress} />
            <Button variant="outline" size="sm" onClick={() => { cancelRef.current = true; }}>Stop import</Button>
          </div>
        </Panel>
      )}

      {result && (
        <Panel title="Import complete" accent="success">
          <div className="p-3.5 text-sm flex gap-2">
            <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
            <div>
              Imported {result.created} contact{result.created === 1 ? '' : 's'}{result.failed ? `, ${result.failed} failed` : ''}{result.cancelled ? ' (stopped early)' : ''}.{' '}
              <Link to="/logbook" className="text-primary hover:underline">Open your logbook</Link>
            </div>
          </div>
        </Panel>
      )}

      <Panel title="How fields are mapped" accent="muted">
        <div className="p-3.5 text-sm text-muted-foreground space-y-1.5">
          <p>CALL, QSO_DATE/TIME_ON (UTC), FREQ, BAND, NAME, STATION_CALLSIGN, RST, QTH, STATE, CNTY, GRIDSQUARE or LAT/LON, TX_PWR, MY_RIG and MY_ANTENNA are imported. MODE and COMMENT are kept in the contact's notes.</p>
          <p>Contacts between 462 and 467.8 MHz are imported as GMRS; everything else as HAM.</p>
        </div>
      </Panel>
    </ToolConsole>
  );
}
