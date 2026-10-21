import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, Loader2, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import ToolConsole from '@/components/tools/ToolConsole';
import { Panel, DataRow, StatusChip } from '@/components/console/Console';
import { Button } from '@/components/ui/button';
import { POOLS, loadPool, drawExam, figureUrl } from '@/lib/questionPools';

const HISTORY_KEY = 'rn.hamExam.history';
const LETTERS = ['A', 'B', 'C', 'D'];

function readHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

export default function HamExam() {
  const [poolKey, setPoolKey] = useState('technician');
  const [exam, setExam] = useState(null); // array of questions
  const [answers, setAnswers] = useState({}); // id -> index
  const [index, setIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState(readHistory);

  const pool = POOLS[poolKey];

  const start = async () => {
    setLoading(true); setError('');
    try {
      const qs = await loadPool(poolKey);
      setExam(drawExam(qs)); setAnswers({}); setIndex(0); setSubmitted(false);
    } catch (e) { setError(e?.message || 'Could not load the question pool.'); }
    setLoading(false);
  };

  const score = exam ? exam.filter((q) => answers[q.id] === q.correct).length : 0;
  const passed = score >= pool.pass;

  const submit = () => {
    setSubmitted(true);
    const entry = { pool: poolKey, score, total: exam.length, passed: score >= pool.pass, at: new Date().toISOString() };
    const next = [entry, ...history].slice(0, 20);
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* optional */ }
  };

  useEffect(() => { setExam(null); }, [poolKey]);

  const q = exam?.[index];
  const answered = exam ? exam.filter((x) => answers[x.id] != null).length : 0;

  const best = history.filter((h) => h.pool === poolKey).reduce((m, h) => Math.max(m, h.score), 0);
  const passes = history.filter((h) => h.passed).length;

  return (
    <ToolConsole
      icon={GraduationCap}
      title="HAM License Practice Exams"
      subtitle="Practice tests from the official question pools"
      status={exam && !submitted ? 'In progress' : undefined}
      statusTone="primary"
      actions={exam && !submitted ? <Button variant="outline" size="sm" onClick={() => setExam(null)}>Change exam</Button> : null}
      kpis={exam && !submitted ? [
        { label: 'Exam', value: pool.label },
        { label: 'Question', value: `${index + 1} / ${exam.length}` },
        { label: 'Answered', value: answered, tone: 'primary' },
        { label: 'Pass mark', value: `${pool.pass} / ${pool.questions}` },
      ] : [
        { label: 'Exam', value: pool.label },
        { label: 'Questions', value: pool.questions },
        { label: 'Pass mark', value: pool.pass },
        { label: 'Your best', value: best ? `${best} / ${pool.questions}` : '—', tone: best >= pool.pass ? 'success' : 'primary' },
      ]}
      footnote="Questions from the official NCVEC question pools. Practice results are only stored in this browser."
    >
      {!exam ? (
        <div className="grid xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 items-start">
          <Panel title="Choose an exam" meta="one question per topic group">
            <div className="p-3.5 space-y-3">
              <div className="grid sm:grid-cols-3 gap-2">
                {Object.entries(POOLS).map(([k, p]) => (
                  <button key={k} type="button" onClick={() => setPoolKey(k)}
                    className={`text-left rounded border p-3 transition-colors ${poolKey === k ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                    <div className="font-heading font-semibold">{p.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{p.years} pool · {p.questions} questions · pass with {p.pass}</div>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" onClick={start} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null} Start {pool.label} exam</Button>
                <span className="text-xs text-muted-foreground">Want to learn the material first? Try <Link to="/tools/ham-study" className="text-primary hover:underline">HAM Study / Flashcards</Link>.</span>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </Panel>
          <Panel title="Recent exams" accent="success" meta={history.length ? `${passes} passed` : 'this browser'}>
            {history.length ? history.map((h) => (
              <DataRow key={h.at} className="grid-cols-[minmax(0,1fr)_auto]">
                <span className="truncate">{POOLS[h.pool]?.label} <span className="text-muted-foreground text-[12px]">· {new Date(h.at).toLocaleDateString()}</span></span>
                <span className="flex items-center gap-2 font-mono text-[12px]">{h.score}/{h.total} <StatusChip tone={h.passed ? 'success' : 'muted'}>{h.passed ? 'Pass' : 'Not yet'}</StatusChip></span>
              </DataRow>
            )) : <p className="p-3.5 text-sm text-muted-foreground">Your scores will show here after your first exam.</p>}
          </Panel>
        </div>
      ) : submitted ? (
        <>
          <Panel title="Result" accent={passed ? 'success' : 'danger'}>
            <div className="p-6 text-center space-y-2">
              {passed ? <CheckCircle2 className="w-10 h-10 mx-auto text-success" /> : <XCircle className="w-10 h-10 mx-auto text-destructive" />}
              <div className="text-2xl font-mono font-semibold">{score} / {exam.length}</div>
              <div className="text-sm">{passed ? `Pass — you needed ${pool.pass}.` : `Not yet — ${pool.pass} needed to pass.`}</div>
              <div className="flex justify-center gap-2 pt-2">
                <Button size="sm" onClick={start}><RotateCcw className="w-4 h-4 mr-1.5" /> New {pool.label} exam</Button>
                <Button size="sm" variant="outline" onClick={() => setExam(null)}>Change exam</Button>
              </div>
            </div>
          </Panel>
          <Panel title="Review" meta={`${exam.length - score} missed`}>
            {exam.map((x, i) => {
              const mine = answers[x.id];
              const ok = mine === x.correct;
              return (
                <div key={x.id} className="px-3.5 py-3 border-b border-border/60 last:border-b-0">
                  <div className="text-sm"><span className="font-mono text-[11px] text-muted-foreground mr-2">{i + 1}. {x.id}</span>{x.question}</div>
                  {figureUrl(x) && <img src={figureUrl(x)} alt={`Figure ${x.figure}`} className="max-h-48 my-2 bg-white rounded" />}
                  <div className={`text-sm mt-1 ${ok ? 'text-success' : 'text-destructive'}`}>
                    {ok ? '✓ ' : '✗ '}{mine != null ? `Your answer: ${LETTERS[mine]}. ${x.answers[mine]}` : 'Not answered'}
                  </div>
                  {!ok && <div className="text-sm text-muted-foreground">Correct: {LETTERS[x.correct]}. {x.answers[x.correct]}</div>}
                </div>
              );
            })}
          </Panel>
        </>
      ) : (
        <>
          <Panel title={`Question ${index + 1}`} meta={q.id}>
            <div className="h-1 bg-muted"><div className="h-1 bg-primary transition-all" style={{ width: `${(answered / exam.length) * 100}%` }} /></div>
            <div className="p-3.5 space-y-3">
              <div className="font-medium">{q.question}</div>
              {figureUrl(q) && <img src={figureUrl(q)} alt={`Figure ${q.figure}`} className="max-h-72 bg-white rounded" />}
              <div className="space-y-2">
                {q.answers.map((a, i) => (
                  <button key={i} type="button" onClick={() => setAnswers((s) => ({ ...s, [q.id]: i }))}
                    className={`w-full text-left rounded border p-2.5 text-sm transition-colors ${answers[q.id] === i ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}>
                    <span className="font-mono font-semibold mr-2">{LETTERS[i]}.</span>{a}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button size="sm" variant="outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>Previous</Button>
                {index < exam.length - 1
                  ? <Button size="sm" onClick={() => setIndex((i) => i + 1)}>Next</Button>
                  : <Button size="sm" onClick={submit}>Finish and score</Button>}
              </div>
            </div>
          </Panel>
          <Panel title="Question map" accent="muted" meta={`${answered} of ${exam.length} answered`}>
            <div className="p-3 flex flex-wrap gap-1">
              {exam.map((x, i) => (
                <button key={x.id} type="button" onClick={() => setIndex(i)} aria-label={`Question ${i + 1}`}
                  className={`w-8 h-8 rounded text-xs font-mono border ${i === index ? 'border-primary text-primary' : 'border-border'} ${answers[x.id] != null ? 'bg-primary/15' : ''}`}>{i + 1}</button>
              ))}
            </div>
          </Panel>
        </>
      )}
    </ToolConsole>
  );
}
