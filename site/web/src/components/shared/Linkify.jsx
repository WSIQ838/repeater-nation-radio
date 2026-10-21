import { Link } from 'react-router-dom';

// Turns web addresses (and email addresses) inside text people typed into
// clickable links, everywhere user text is shown: posts, replies, messages,
// comments, bios, descriptions, notes, announcements.
//
// Only http(s) and mailto links are ever made, the text itself is rendered
// by React (never as HTML), and outside links open in a new tab with
// rel="noopener noreferrer nofollow ugc". Links back to this site stay in the
// same tab. Inside something that is already a link (a clickable card), pass
// `nested` so the links become clickable spans instead of invalid <a> in <a>.

const TLDS = 'com|net|org|edu|gov|mil|io|co|us|uk|ca|au|de|app|dev|info|biz|me|tv|gg|ly|radio|club|xyz|site|online|store|tech|ai|fm|am|link|live|page|blog|news|shop|fyi';
const URL_RE = new RegExp(
  [
    '(https?:\\/\\/[^\\s<>"]+)',                                   // http(s)://...
    '(\\bwww\\.[^\\s<>"]+)',                                        // www.example.com/...
    '([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,})', // email
    `(\\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\\.)+(?:${TLDS})\\b(?:\\/[^\\s<>"]*)?)`, // example.com/path
  ].join('|'),
  'gi',
);
const SITE_HOSTS = new Set(['repeaternation.com', 'www.repeaternation.com']);

// Punctuation that ends a sentence rather than the link: "see example.com."
function trimTrailing(raw) {
  let url = raw;
  for (;;) {
    const last = url.slice(-1);
    if (/[.,;:!?'"*_~]/.test(last)) { url = url.slice(0, -1); continue; }
    const pairs = { ')': '(', ']': '[', '}': '{' };
    if (pairs[last]) {
      const opens = url.split(pairs[last]).length - 1;
      const closes = url.split(last).length - 1;
      if (closes > opens) { url = url.slice(0, -1); continue; }
    }
    return url;
  }
}

export function findLinks(text) {
  const out = [];
  if (!text) return out;
  const str = String(text);
  URL_RE.lastIndex = 0;
  let m;
  while ((m = URL_RE.exec(str))) {
    const raw = m[0];
    // An email's domain also matches the bare-domain pattern; the email wins
    // because it starts earlier. Skip bare domains glued to a word ("a@b.com" handled above).
    const url = trimTrailing(raw);
    if (!url || url.length < 4) continue;
    let href;
    if (m[3]) href = `mailto:${url}`;
    else if (/^https?:\/\//i.test(url)) href = url;
    else href = `https://${url}`;
    try {
      const u = new URL(href);
      if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) continue;
    } catch { continue; }
    out.push({ start: m.index, end: m.index + url.length, text: url, href });
    URL_RE.lastIndex = m.index + url.length;
  }
  return out;
}

function sitePath(href) {
  try {
    const u = new URL(href);
    const here = typeof window !== 'undefined' ? window.location.host : '';
    if (SITE_HOSTS.has(u.host.toLowerCase()) || (here && u.host === here)) return `${u.pathname}${u.search}${u.hash}` || '/';
  } catch { /* not a URL */ }
  return null;
}

const LINK_CLASS = 'text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary break-words [overflow-wrap:anywhere]';
const stop = (e) => e.stopPropagation();

function LinkNode({ link, nested, className }) {
  const cls = `${LINK_CLASS} ${className || ''}`;
  const internal = link.href.startsWith('mailto:') ? null : sitePath(link.href);
  if (nested) {
    const open = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (internal) window.location.assign(internal);
      else window.open(link.href, '_blank', 'noopener,noreferrer');
    };
    return (
      <span role="link" tabIndex={0} className={`${cls} cursor-pointer`} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter') open(e); }}>
        {link.text}
      </span>
    );
  }
  if (internal) return <Link to={internal} className={cls} onClick={stop}>{link.text}</Link>;
  return (
    <a href={link.href} target={link.href.startsWith('mailto:') ? undefined : '_blank'} rel="noopener noreferrer nofollow ugc" className={cls} onClick={stop}>
      {link.text}
    </a>
  );
}

// Text with its links made clickable, as an array of strings and links.
export function linkifyText(text, { nested = false, linkClassName = '', keyPrefix = 'l' } = {}) {
  if (text === null || text === undefined || text === '') return text;
  const str = String(text);
  const links = findLinks(str);
  if (!links.length) return str;
  const parts = [];
  let at = 0;
  links.forEach((link, i) => {
    if (link.start > at) parts.push(str.slice(at, link.start));
    parts.push(<LinkNode key={`${keyPrefix}${i}`} link={link} nested={nested} className={linkClassName} />);
    at = link.end;
  });
  if (at < str.length) parts.push(str.slice(at));
  return parts;
}

export default function Linkify({ text, children, nested = false, linkClassName = '' }) {
  const value = text ?? (typeof children === 'string' ? children : null);
  if (value === null || value === undefined) return children ?? null;
  return <>{linkifyText(value, { nested, linkClassName })}</>;
}
