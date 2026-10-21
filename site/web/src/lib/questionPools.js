// NCVEC amateur-radio question pools, served from /public/question-pools
// (public-domain questions; JSON via russolsen/ham_radio_question_pool,
// Apache-2.0 -- see public/question-pools/NOTICE.txt).
export const POOLS = {
  technician: { label: 'Technician', years: '2026–2030', file: 'technician-2026-2030.json', questions: 35, pass: 26 },
  general: { label: 'General', years: '2023–2027', file: 'general-2023-2027.json', questions: 35, pass: 26 },
  extra: { label: 'Amateur Extra', years: '2024–2028', file: 'extra-2024-2028.json', questions: 50, pass: 37 },
};

const cache = new Map();

export async function loadPool(key) {
  if (!cache.has(key)) {
    cache.set(key, fetch(`/question-pools/${POOLS[key].file}`).then((r) => {
      if (!r.ok) throw new Error('Could not load the question pool.');
      return r.json();
    }).catch((e) => { cache.delete(key); throw e; }));
  }
  return cache.get(key);
}

export const figureUrl = (q) => (q?.figure ? `/question-pools/${q.figure.endsWith('.png') ? q.figure : `${q.figure}.png`}` : null);
export const groupOf = (q) => q.id.slice(0, 3);
export const subelementOf = (q) => q.id.slice(0, 2);

export function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A real VE exam draws exactly one question from each topic group.
export function drawExam(pool) {
  const groups = new Map();
  for (const q of pool) {
    const g = groupOf(q);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(q);
  }
  return [...groups.keys()].sort().map((g) => {
    const qs = groups.get(g);
    return qs[Math.floor(Math.random() * qs.length)];
  });
}
