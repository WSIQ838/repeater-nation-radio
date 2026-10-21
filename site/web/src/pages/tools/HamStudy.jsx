import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Eye, Check, RotateCcw, Shuffle } from 'lucide-react';
import ToolConsole, { PanelLoading } from '@/components/tools/ToolConsole';
import { Panel, ConsoleTabs } from '@/components/console/Console';
import { Button } from '@/components/ui/button';
import { POOLS, loadPool, figureUrl, subelementOf, shuffle } from '@/lib/questionPools';

const LETTERS = ['A', 'B', 'C', 'D'];
const knownKey = (pool) => `rn.hamStudy.known.${pool}`;

function readKnown(pool) {
  try { return new Set(JSON.parse(localStorage.getItem(knownKey(pool)) || '[]')); } catch { return new Set(); }
}

export default function HamStudy() {
  const [poolKey, setPoolKey] = useState('technician');
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState('');
  const [subelement, setSubelement] = useState('all');
  const [hideKnown, setHideKnown] = useState(true);
  const [order, setOrder] = useState([]);
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [known, setKnown] = useState(() => readKnown('technician'));

  useEffect(() => {
    setQuestions(null); setError(''); setKnown(readKnown(poolKey)); setSubelement('all');
    loadPool(poolKey).then(setQuestions).catch((e) => setError(e?.message || 'Could not load the question pool.'));
  }, [poolKey]);

  const subelements = useMemo(() => [...new Set((questions || []).map(subelementOf))].sort(), [questions]);
  const deck = useMemo(() => (questions || []).filter((q) => (subelement === 'all' || subelementOf(q) === subelement) && (!hideKnown || !known.has(q.id))), [questions, subelement, hideKnown, known]);

  useEffect(() => { setOrder(deck.map((q) => q.id)); setPos(0); setRevealed(false); }, [deck.length, subelement, hideKnown, poolKey]);  

  const byId = useMemo(() => new Map((questions || []).map((q) => [q.id, q])), [questions]);
  const q = byId.get(order[pos]);
  const inScope = (questions || []).filter((x) => subelement === 'all' || subelementOf(x) === subelement);
  const knownInScope = inScope.filter((x) => known.has(x.id)).length;

  const saveKnown = (next) => {
    setKnown(next);
    try { localStorage.setItem(knownKey(poolKey), JSON.stringify([...next])); } catch { /* optional */ }
  };
  const next = () => { setRevealed(false); setPos((p) => (order.length ? (p + 1) % order.length : 0)); };
  const markKnown = () => {
    if (!q) return;
    const n = new Set(known); n.add(q.id); saveKnown(n);
    if (!hideKnown) next();
  };

  const pct = inScope.length ? Math.round((knownInScope / inScope.length) * 100) : 0;

  return (
    <ToolConsole
      icon={BookOpen}
      title="HAM Study / Flashcards"
      subtitle="Learn the official question pool"
      kpis={[
        { label: 'Pool', value: `${POOLS[poolKey].label} ${POOLS[poolKey].years}` },
        { label: 'Questions', value: questions ? inScope.length : '—' },
        { label: 'Known', value: questions ? knownInScope : '—', tone: 'success' },
        { label: 'Progress', value: questions ? `${pct}%` : '—', tone: 'primary' },
      ]}
      footnote={`Questions from the official NCVEC question pools (${POOLS[poolKey].label} ${POOLS[poolKey].years}). Progress is saved in this browser.`}
    >
      <ConsoleTabs
        value={poolKey}
        onChange={setPoolKey}
        tabs={Object.entries(POOLS).map(([k, p]) => ({ id: k, label: p.label }))}
        right={questions ? (
          <>
            <select aria-label="Topic" value={subelement} onChange={(e) => setSubelement(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs">
              <option value="all">All topics ({questions.length})</option>
              {subelements.map((s) => <option key={s} value={s}>Subelement {s}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs whitespace-nowrap"><input type="checkbox" checked={hideKnown} onChange={(e) => setHideKnown(e.target.checked)} /> Hide known</label>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setOrder(shuffle(deck.map((x) => x.id))); setPos(0); setRevealed(false); }}><Shuffle className="w-3.5 h-3.5 mr-1" /> Shuffle</Button>
          </>
        ) : null}
      />

      {error ? <Panel title="Flashcards" accent="danger"><p className="p-3.5 text-sm text-destructive">{error}</p></Panel> : !questions ? (
        <Panel title="Flashcards"><PanelLoading text="Loading questions…" /></Panel>
      ) : q ? (
        <Panel title={`Card ${pos + 1} of ${order.length}`} meta={`${q.id}${q.refs ? ` · ${q.refs}` : ''}`}>
          <div className="h-1 bg-muted"><div className="h-1 bg-success transition-all" style={{ width: `${pct}%` }} /></div>
          <div className="p-3.5 space-y-3">
            <div className="font-medium">{q.question}</div>
            {figureUrl(q) && <img src={figureUrl(q)} alt={`Figure ${q.figure}`} className="max-h-72 bg-white rounded" />}
            <ol className="space-y-1.5 text-sm">
              {q.answers.map((a, i) => (
                <li key={i} className={`rounded border p-2.5 ${revealed && i === q.correct ? 'border-success bg-success/10 font-medium' : 'border-border'}`}>
                  <span className="font-mono font-semibold mr-2">{LETTERS[i]}.</span>{a}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              {!revealed ? <Button size="sm" onClick={() => setRevealed(true)}><Eye className="w-4 h-4 mr-1.5" /> Show answer</Button> : (
                <>
                  <Button size="sm" onClick={markKnown}><Check className="w-4 h-4 mr-1.5" /> I knew it</Button>
                  <Button size="sm" variant="outline" onClick={next}>Still learning</Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={next}>Skip</Button>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel title="Flashcards" accent="success">
          <div className="p-6 text-center space-y-3">
            <div className="font-heading font-semibold">You've marked every card in this set as known.</div>
            <div className="flex justify-center gap-2">
              <Link to="/tools/ham-exam"><Button size="sm">Take a practice exam</Button></Link>
              <Button size="sm" variant="outline" onClick={() => saveKnown(new Set([...known].filter((id) => !inScope.some((x) => x.id === id))))}><RotateCcw className="w-4 h-4 mr-1.5" /> Reset this set</Button>
            </div>
          </div>
        </Panel>
      )}
    </ToolConsole>
  );
}
