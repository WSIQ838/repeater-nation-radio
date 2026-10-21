import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { AtSign, X } from 'lucide-react';
import StaffTag from '@/components/shared/StaffTag';

// Tag picker: searches member profiles by callsign or display name and lets
// the author attach callsign tags to a post. Hands selected callsigns back.
export default function MemberTagger({ tags = [], onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const search = async (q) => {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const profiles = await base44.entities.Profile.list('-updated_date', 50);
      const lq = q.toLowerCase();
      const filtered = (profiles || [])
        .filter(
          (p) =>
            (p.callsign && p.callsign.toLowerCase().includes(lq)) ||
            (p.display_name && p.display_name.toLowerCase().includes(lq))
        )
        .filter((p) => p.callsign && !tags.includes(p.callsign))
        .slice(0, 6);
      setResults(filtered);
    } catch (e) {
      console.error(e);
    }
    setSearching(false);
  };

  const add = (callsign) => {
    if (callsign && !tags.includes(callsign)) onChange([...tags, callsign]);
    setQuery('');
    setResults([]);
  };

  const remove = (t) => onChange(tags.filter((x) => x !== t));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
          >
            <AtSign className="w-3 h-3" /> {t}
            <button type="button" onClick={() => remove(t)} className="hover:text-destructive">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Tag members by callsign or name…"
          className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-transparent text-sm"
        />
        {query && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
            {searching ? (
              <div className="p-2 text-xs text-muted-foreground">Searching…</div>
            ) : results.length ? (
              results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => add(p.callsign)}
                  className="w-full flex items-center gap-2 p-2 text-left text-sm hover:bg-accent"
                >
                  <span className="font-mono text-xs">{p.callsign}</span><StaffTag userId={p.created_by_id} compact />
                  <span className="text-muted-foreground truncate">{p.display_name}</span>
                </button>
              ))
            ) : (
              <div className="p-2 text-xs text-muted-foreground">No members found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}