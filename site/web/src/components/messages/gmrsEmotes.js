// Custom GMRS-themed emotes for the message emoji picker.
// Each emote is inserted into the message body as a shortcode (e.g. :over:)
// and rendered inline by MessageBody.jsx.

const BASE = 'https://media.base44.com/images/public/6a6d787f8e808727b935dd09';

export const GMRS_EMOTES = [
  { code: ':gmrs:', label: 'GMRS', url: `${BASE}/c7aa40aec_1.png` },
  { code: ':over:', label: 'OVER', url: `${BASE}/fedcb1a24_2.png` },
  { code: ':out:', label: 'OUT', url: `${BASE}/8f5ebc07d_3.png` },
  { code: ':10-4:', label: '10-4', url: `${BASE}/0b9dc535b_4.png` },
  { code: ':roger:', label: 'ROGER', url: `${BASE}/65654c649_5.png` },
  { code: ':copy:', label: 'COPY', url: `${BASE}/c326bcd78_6.png` },
  { code: ':thumbsup:', label: 'Thumbs Up', url: `${BASE}/b4aa7318a_7.png` },
  { code: ':netcontrol:', label: 'Net Control', url: `${BASE}/e2904a950_8.png` },
  { code: ':tower:', label: 'GMRS Tower', url: `${BASE}/b99fa05c7_9.png` },
  { code: ':flag:', label: 'Flag Tower', url: `${BASE}/b03c5f04a_10.png` },
];

export const GMRS_EMOTE_MAP = Object.fromEntries(
  GMRS_EMOTES.map((e) => [e.code, e.url])
);