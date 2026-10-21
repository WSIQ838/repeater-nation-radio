// FCC GMRS channel reference used throughout the application.
// Channels 1-22 are the shared GMRS/FRS channel center frequencies.
// Channels 15-22 also have the paired GMRS repeater input frequency (+5 MHz).
export const GMRS_CHANNELS = [
  { ch: '1', freq: '462.5625', label: 'CH 1 — 462.5625 MHz', type: 'simplex' },
  { ch: '2', freq: '462.5875', label: 'CH 2 — 462.5875 MHz', type: 'simplex' },
  { ch: '3', freq: '462.6125', label: 'CH 3 — 462.6125 MHz', type: 'simplex' },
  { ch: '4', freq: '462.6375', label: 'CH 4 — 462.6375 MHz', type: 'simplex' },
  { ch: '5', freq: '462.6625', label: 'CH 5 — 462.6625 MHz', type: 'simplex' },
  { ch: '6', freq: '462.6875', label: 'CH 6 — 462.6875 MHz', type: 'simplex' },
  { ch: '7', freq: '462.7125', label: 'CH 7 — 462.7125 MHz', type: 'simplex' },
  { ch: '8', freq: '467.5625', label: 'CH 8 — 467.5625 MHz', type: 'simplex' },
  { ch: '9', freq: '467.5875', label: 'CH 9 — 467.5875 MHz', type: 'simplex' },
  { ch: '10', freq: '467.6125', label: 'CH 10 — 467.6125 MHz', type: 'simplex' },
  { ch: '11', freq: '467.6375', label: 'CH 11 — 467.6375 MHz', type: 'simplex' },
  { ch: '12', freq: '467.6625', label: 'CH 12 — 467.6625 MHz', type: 'simplex' },
  { ch: '13', freq: '467.6875', label: 'CH 13 — 467.6875 MHz', type: 'simplex' },
  { ch: '14', freq: '467.7125', label: 'CH 14 — 467.7125 MHz', type: 'simplex' },
  { ch: '15', freq: '462.5500', input: '467.5500', label: 'CH 15 — 462.5500 MHz', inputLabel: 'CH 15 INPUT — 467.5500 MHz', type: 'repeater' },
  { ch: '16', freq: '462.5750', input: '467.5750', label: 'CH 16 — 462.5750 MHz', inputLabel: 'CH 16 INPUT — 467.5750 MHz', type: 'repeater' },
  { ch: '17', freq: '462.6000', input: '467.6000', label: 'CH 17 — 462.6000 MHz', inputLabel: 'CH 17 INPUT — 467.6000 MHz', type: 'repeater' },
  { ch: '18', freq: '462.6250', input: '467.6250', label: 'CH 18 — 462.6250 MHz', inputLabel: 'CH 18 INPUT — 467.6250 MHz', type: 'repeater' },
  { ch: '19', freq: '462.6500', input: '467.6500', label: 'CH 19 — 462.6500 MHz', inputLabel: 'CH 19 INPUT — 467.6500 MHz', type: 'repeater' },
  { ch: '20', freq: '462.6750', input: '467.6750', label: 'CH 20 — 462.6750 MHz', inputLabel: 'CH 20 INPUT — 467.6750 MHz', type: 'repeater' },
  { ch: '21', freq: '462.7000', input: '467.7000', label: 'CH 21 — 462.7000 MHz', inputLabel: 'CH 21 INPUT — 467.7000 MHz', type: 'repeater' },
  { ch: '22', freq: '462.7250', input: '467.7250', label: 'CH 22 — 462.7250 MHz', inputLabel: 'CH 22 INPUT — 467.7250 MHz', type: 'repeater' },
];

export const GMRS_FREQUENCY_OPTIONS = GMRS_CHANNELS.flatMap((c) => [
  { ch: c.ch, freq: c.freq, label: c.label, direction: c.type === 'repeater' ? 'output' : 'simplex' },
  ...(c.input ? [{ ch: c.ch, freq: c.input, label: c.inputLabel, direction: 'input' }] : []),
]);

export const GMRS_REPEATER_CHANNELS = GMRS_CHANNELS.filter((c) => c.type === 'repeater');

export const getGmrsChannel = (ch) => GMRS_CHANNELS.find((c) => c.ch === String(ch));
export const getGmrsFrequency = (freq) => GMRS_FREQUENCY_OPTIONS.find((f) => f.freq === String(freq));
