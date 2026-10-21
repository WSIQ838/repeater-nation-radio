/* global __BUILD_ID__ */
// Long-open tabs keep running whatever code they first loaded, polling on old
// schedules long after a fix ships (seen 2026-10-04: tabs opened before the
// rate-limit fix were still polling every 10 seconds). Check now and then for
// a newer build and switch to it at a safe moment: the next in-app page
// change, or after the tab has sat hidden for a while with the radio off and
// nothing typed on the page.

const CHECK_MS = 15 * 60 * 1000;
const HIDDEN_RELOAD_AFTER_MS = 10 * 60 * 1000;

let voiceBusy = false;
let updateReady = false;
let hiddenSince = 0;

// The radio widget reports while it's tuned in or on a direct call; a reload
// then would cut the audio.
export function setVoiceBusy(busy) { voiceBusy = !!busy; }

function hasTypedText() {
  for (const el of document.querySelectorAll('textarea, input, [contenteditable="true"]')) {
    if (el.isContentEditable) { if (el.textContent.trim()) return true; continue; }
    if (el.tagName === 'INPUT' && !['text', 'email', 'url', 'tel', 'number', ''].includes(el.type)) continue;
    if (el.value && el.value !== el.defaultValue) return true;
  }
  return false;
}

function reloadIfIdle() {
  if (!updateReady || voiceBusy || !document.hidden) return;
  if (!hiddenSince || Date.now() - hiddenSince < HIDDEN_RELOAD_AFTER_MS) return;
  if (hasTypedText()) return;
  window.location.reload();
}

async function check() {
  if (updateReady) { reloadIfIdle(); return; }
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { build } = await res.json();
    if (build && build !== __BUILD_ID__) updateReady = true;
  } catch { /* offline, or not deployed with version.json */ }
  reloadIfIdle();
}

export function startUpdateWatcher() {
  if (import.meta.env.DEV || typeof __BUILD_ID__ === 'undefined') return;
  setInterval(check, CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenSince = Date.now();
    else { hiddenSince = 0; check(); }
  });
  // In-app navigation goes through history.pushState (react-router); once a
  // new build is out, turn the next one into a full page load.
  const push = window.history.pushState;
  window.history.pushState = function pushState(state, title, url) {
    if (updateReady && url != null && !voiceBusy && !hasTypedText()) {
      window.location.assign(new URL(url, window.location.href).href);
      return undefined;
    }
    return push.apply(this, [state, title, url]);
  };
}
