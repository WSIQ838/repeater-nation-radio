// Shared helpers for representing an optional alpha channel on a hex color.
// A color stays a plain 6-digit hex ('#rrggbb') while fully opaque -- every
// existing stored value and every consumer that expects a plain hex string
// keeps working unchanged -- and becomes an 8-digit hex ('#rrggbbaa') only
// once transparency is actually dialed in. Modern CSS accepts 8-digit hex
// directly, so most consumers need no changes at all.

export function clampPct(n) {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
}

export function parseColorAlpha(input) {
  const s = String(input || '').trim();
  let hex = s.startsWith('#') ? s.slice(1) : s;
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length === 8) {
    const alpha = Math.round((parseInt(hex.slice(6, 8), 16) / 255) * 100);
    return { hex6: `#${hex.slice(0, 6)}`, opacity: Number.isFinite(alpha) ? clampPct(alpha) : 100 };
  }
  if (hex.length === 6) return { hex6: `#${hex}`, opacity: 100 };
  return { hex6: '#000000', opacity: 100 };
}

export function serializeColorAlpha(hex6, opacityPct) {
  const opacity = clampPct(opacityPct);
  const clean = String(hex6 || '#000000').replace('#', '').slice(0, 6).padEnd(6, '0');
  if (opacity >= 100) return `#${clean}`;
  const alphaHex = Math.round((opacity / 100) * 255).toString(16).padStart(2, '0');
  return `#${clean}${alphaHex}`;
}

// Just the 6-digit hex portion, stripping any embedded alpha. For consumers
// that need a guaranteed-opaque color regardless of what was stored (e.g. a
// fixed-alpha tint derived from an admin-picked accent color).
export function hex6Of(input) {
  return parseColorAlpha(input).hex6;
}
