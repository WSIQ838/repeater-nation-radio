import { useEffect, useRef } from 'react';

// True while focus is anywhere PTT shouldn't hijack a keystroke -- a text
// input, textarea, contentEditable region, or a select -- so the radio never
// steals a key while someone's typing in a search box, DM, or forum post
// elsewhere on the site.
function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return !!el.closest?.('[contenteditable="true"], [role="textbox"]');
}

// A stored binding is "type:value" -- "key:ControlLeft", "mouse:3",
// "gamepad:0". A bare value with no "type:" prefix is legacy data saved
// before mouse/gamepad support existed, always a keyboard
// KeyboardEvent.code, so it's treated as "key:<value>".
export function parsePttBinding(raw) {
  if (!raw) return null;
  const idx = raw.indexOf(':');
  if (idx === -1) return { type: 'key', value: raw };
  return { type: raw.slice(0, idx), value: raw.slice(idx + 1) };
}

const MOUSE_BUTTON_LABELS = {
  0: 'Left click', 1: 'Middle click', 2: 'Right click', 3: 'Mouse back button', 4: 'Mouse forward button',
};

// `keyLabels` is an optional { code: label } map (e.g. PTT_KEY_OPTIONS'
// friendly names) for keyboard codes worth naming specially; anything else
// falls back to the raw code/index.
export function pttBindingLabel(raw, keyLabels = {}) {
  const parsed = parsePttBinding(raw);
  if (!parsed) return '';
  if (parsed.type === 'key') return keyLabels[parsed.value] || parsed.value;
  if (parsed.type === 'mouse') return MOUSE_BUTTON_LABELS[parsed.value] || `Mouse button ${Number(parsed.value) + 1}`;
  if (parsed.type === 'gamepad') return `Gamepad button ${Number(parsed.value) + 1}`;
  return raw;
}

// Binds a single input -- any keyboard key, mouse button, or gamepad
// button -- to PTT press/release. `binding` is "key:<code>", "mouse:
// <button>", "gamepad:<index>", or a bare legacy keyboard code (see
// parsePttBinding above). Ignores OS key-repeat and any keystroke while a
// typing target has focus; a mouse binding additionally ignores clicks on
// interactive controls (buttons, links, form fields) so clicking Cancel/
// Save in the radio's own settings dialog while a mouse binding is active
// doesn't also key up the radio. Gamepad buttons have no press/release
// events in the browser, so they're polled every animation frame instead
// -- only while a gamepad binding is actually the active one, so keyboard
// and mouse bindings pay zero cost for it. Pass `extraWindow` (e.g. a
// popped-out radio window) to also listen there -- keyboard/mouse events
// only fire on whichever window currently has focus, so a detached window
// needs its own listeners to keep working (gamepad polling already checks
// navigator.getGamepads() globally, not per-window, so it needs no such
// duplication).
export default function useKeyboardPTT(binding, onPress, onRelease, enabled = true, extraWindow = null) {
  const holdingRef = useRef(false);
  const parsed = parsePttBinding(binding);

  useEffect(() => {
    if (!enabled || !parsed) return undefined;
    const targets = [window, extraWindow].filter(Boolean);

    const press = () => { if (!holdingRef.current) { holdingRef.current = true; onPress(); } };
    const release = () => { if (holdingRef.current) { holdingRef.current = false; onRelease(); } };
    // Releasing focus/visibility mid-hold (alt-tab, window blur) must not
    // leave the floor jammed open from an input the browser never sees
    // go up.
    const onBlur = () => release();

    if (parsed.type === 'key') {
      const onKeyDown = (e) => {
        if (e.code !== parsed.value || e.repeat) return;
        // e.target (the focused element that received the keystroke) works
        // correctly regardless of which window/document the event came
        // from, unlike document.activeElement which only reflects the
        // main window.
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        press();
      };
      const onKeyUp = (e) => { if (e.code === parsed.value) release(); };
      for (const w of targets) {
        w.addEventListener('keydown', onKeyDown);
        w.addEventListener('keyup', onKeyUp);
        w.addEventListener('blur', onBlur);
      }
      return () => {
        for (const w of targets) {
          w.removeEventListener('keydown', onKeyDown);
          w.removeEventListener('keyup', onKeyUp);
          w.removeEventListener('blur', onBlur);
        }
        release();
      };
    }

    if (parsed.type === 'mouse') {
      const btn = Number(parsed.value);
      const onMouseDown = (e) => {
        if (e.button !== btn) return;
        if (isTypingTarget(e.target) || e.target?.closest?.('button, a, [role="button"], select, input, textarea')) return;
        e.preventDefault();
        press();
      };
      const onMouseUp = (e) => { if (e.button === btn) release(); };
      for (const w of targets) {
        w.addEventListener('mousedown', onMouseDown);
        w.addEventListener('mouseup', onMouseUp);
        w.addEventListener('blur', onBlur);
      }
      return () => {
        for (const w of targets) {
          w.removeEventListener('mousedown', onMouseDown);
          w.removeEventListener('mouseup', onMouseUp);
          w.removeEventListener('blur', onBlur);
        }
        release();
      };
    }

    if (parsed.type === 'gamepad' && navigator.getGamepads) {
      const idx = Number(parsed.value);
      let rafId = null;
      let cancelled = false;
      const poll = () => {
        if (cancelled) return;
        const pads = navigator.getGamepads() || [];
        let pressed = false;
        for (const pad of pads) {
          if (pad?.buttons?.[idx]?.pressed) { pressed = true; break; }
        }
        if (pressed) press(); else release();
        rafId = requestAnimationFrame(poll);
      };
      rafId = requestAnimationFrame(poll);
      return () => {
        cancelled = true;
        if (rafId) cancelAnimationFrame(rafId);
        release();
      };
    }

    return undefined;
  }, [parsed?.type, parsed?.value, onPress, onRelease, enabled, extraWindow]);
}
