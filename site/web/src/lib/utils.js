import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;

// Base44Error (thrown by the SDK for failed requests) carries the server's
// response body on `.data`; the raw axios error is on `.originalError`.
// Backend functions reply with { error: '...' }, so read that first and let
// callers fall back to a generic message only when there is none.
// A bare "YYYY-MM-DD" string parses as UTC midnight per the JS Date spec, so
// formatting it with toLocaleDateString() in a negative-UTC-offset timezone
// (e.g. any US timezone) rolls the displayed date back a day. The multi-arg
// Date constructor is interpreted as local time instead, so build the date
// from its parts rather than parsing the string directly.
export function parseDateOnlyLocal(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function errMsg(e) {
  return (
    e?.data?.error ||
    e?.data?.message ||
    e?.originalError?.response?.data?.error ||
    e?.response?.data?.error ||
    e?.error ||
    undefined
  );
}
