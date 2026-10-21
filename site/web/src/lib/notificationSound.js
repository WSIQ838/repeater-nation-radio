// Notification chime — a short Motorola PTT (push-to-talk) radio beep, fitting
// for a GMRS/HAM community app. Browsers block audio until the page has seen
// some user interaction (autoplay policy), so a notification that arrives
// before any click/tap/keypress would otherwise fail to play with no visible
// error. To avoid that, we "unlock" playback on the very first interaction
// anywhere on the page (play-then-immediately-pause), so later programmatic
// play() calls from a live notification succeed even if the tab was idle.
const SOUND_URL = '/sounds/notification-ptt.mp3';
let audio = null;
let unlocked = false;

function getAudio() {
  if (!audio) {
    audio = new Audio(SOUND_URL);
    audio.volume = 0.5;
  }
  return audio;
}

function unlock() {
  if (unlocked) return;
  unlocked = true;
  const el = getAudio();
  el.play().then(() => { el.pause(); el.currentTime = 0; }).catch(() => {});
}

if (typeof document !== 'undefined') {
  const events = ['pointerdown', 'keydown', 'touchstart'];
  const onFirstInteraction = () => {
    unlock();
    events.forEach((e) => document.removeEventListener(e, onFirstInteraction));
  };
  events.forEach((e) => document.addEventListener(e, onFirstInteraction));
}

export function playNotificationSound() {
  try {
    const el = getAudio();
    el.currentTime = 0;
    el.play()?.catch(() => {});
  } catch {
    // Playback blocked or unavailable — not worth surfacing.
  }
}
