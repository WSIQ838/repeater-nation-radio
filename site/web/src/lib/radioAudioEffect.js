// Client-side radio DSP for received audio, plus one small local audio cue
// (the "roger beep" below). The DSP chain itself never mixes synthesized
// tones into the received voice signal -- it only ever processes what's
// actually on the track.

export const RADIO_EQ_FREQUENCIES = Object.freeze([31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);

export const DEFAULT_RADIO_DSP = Object.freeze({
  enabled: true,
  preset: 'Police Radio',
  eq_bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  highpass_hz: 500,
  lowpass_hz: 3000,
  presence_hz: 1750,
  presence_gain_db: 5,
  presence_q: 1.1,
  drive: 2.5,
  distortion: 0,
  compression_ratio: 7,
  compression_threshold_db: -32,
  attack_ms: 2,
  release_ms: 60,
});

function normalizeDsp(settings = {}) {
  const n = (value, fallback, min, max) => {
    const x = Number(value);
    if (!Number.isFinite(x)) return fallback;
    return Math.max(min, Math.min(max, x));
  };
  const eqBands = Array.isArray(settings.eq_bands) && settings.eq_bands.length === 10
    ? settings.eq_bands.map((value) => n(value, 0, -12, 12))
    : DEFAULT_RADIO_DSP.eq_bands;
  return {
    ...DEFAULT_RADIO_DSP,
    eq_bands: eqBands,
    enabled: settings.enabled !== false,
    preset: settings.preset || DEFAULT_RADIO_DSP.preset,
    highpass_hz: n(settings.highpass_hz, DEFAULT_RADIO_DSP.highpass_hz, 300, 700),
    lowpass_hz: n(settings.lowpass_hz, DEFAULT_RADIO_DSP.lowpass_hz, 2500, 5000),
    presence_hz: n(settings.presence_hz, DEFAULT_RADIO_DSP.presence_hz, 1500, 2500),
    presence_gain_db: n(settings.presence_gain_db, DEFAULT_RADIO_DSP.presence_gain_db, 0, 8),
    presence_q: n(settings.presence_q, DEFAULT_RADIO_DSP.presence_q, 0.1, 10),
    drive: n(settings.drive, DEFAULT_RADIO_DSP.drive, 0, 10),
    distortion: n(settings.distortion, DEFAULT_RADIO_DSP.distortion, 0, 10),
    compression_ratio: n(settings.compression_ratio, DEFAULT_RADIO_DSP.compression_ratio, 1, 12),
    compression_threshold_db: n(settings.compression_threshold_db, DEFAULT_RADIO_DSP.compression_threshold_db, -60, 0),
    attack_ms: n(settings.attack_ms, DEFAULT_RADIO_DSP.attack_ms, 1, 50),
    release_ms: n(settings.release_ms, DEFAULT_RADIO_DSP.release_ms, 20, 300),
  };
}

// DynamicsCompressorNode has no automatic makeup gain -- at the default
// settings (threshold -32dB, ratio 7:1) it pulls typical speech down by
// roughly 12dB with nothing compensating for it, so the "radio filter"
// came out dramatically quieter than unprocessed audio (reported as the
// filter "not working" -- it was working, just burying the voice).
// Estimate a static makeup gain from how much a reference speech level
// would be pulled down by the current threshold/ratio, clamped to a
// sane range so it can't itself blow out the signal.
function computeMakeupGainDb(dsp) {
  const referenceDb = -18; // typical conversational speech level
  const aboveThreshold = referenceDb - dsp.compression_threshold_db;
  if (aboveThreshold <= 0) return 0;
  const reductionDb = aboveThreshold * (1 - 1 / dsp.compression_ratio);
  return Math.max(0, Math.min(12, reductionDb));
}

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

function makeRadioCurve(amount) {
  const n = 44100;
  const curve = new Float32Array(n);
  const k = Math.max(0.01, amount);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

// A separate, harder-edged clip than the gentle tanh saturation above --
// tanh stays smooth/musical even at max drive, while this clips flat once
// the signal crosses the threshold, producing the harsher, crunchier grit
// of a cheap/overdriven speaker. At amount=0 this is the identity function
// (no change), so it's an opt-in effect layered on top of, not instead of,
// the existing drive stage.
function makeDistortionCurve(amount) {
  const n = 44100;
  const curve = new Float32Array(n);
  const gain = 1 + Math.max(0, Math.min(10, amount)) * 4;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.max(-1, Math.min(1, x * gain));
  }
  return curve;
}

export function createRadioTransmitChain(audioCtx, mediaStream, dspSettings = DEFAULT_RADIO_DSP) {
  if (!audioCtx || !mediaStream) return null;

  let dsp = normalizeDsp(dspSettings);
  if (!dsp.enabled) return null;

  const source = audioCtx.createMediaStreamSource(mediaStream);
  const eqFilters = RADIO_EQ_FREQUENCIES.map((frequency, index) => {
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = frequency;
    filter.Q.value = 1.0;
    filter.gain.value = dsp.eq_bands[index] || 0;
    return filter;
  });
  const highpass = audioCtx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = dsp.highpass_hz;
  highpass.Q.value = 0.707;
  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = dsp.lowpass_hz;
  lowpass.Q.value = 0.707;
  const presence = audioCtx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = dsp.presence_hz;
  presence.Q.value = dsp.presence_q;
  presence.gain.value = dsp.presence_gain_db;
  const shaper = audioCtx.createWaveShaper();
  shaper.curve = makeRadioCurve(dsp.drive);
  shaper.oversample = '2x';
  const distortion = audioCtx.createWaveShaper();
  distortion.curve = makeDistortionCurve(dsp.distortion);
  distortion.oversample = '4x';
  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = dsp.compression_threshold_db;
  compressor.knee.value = 3;
  compressor.ratio.value = dsp.compression_ratio;
  compressor.attack.value = dsp.attack_ms / 1000;
  compressor.release.value = dsp.release_ms / 1000;
  const makeup = audioCtx.createGain();
  makeup.gain.value = dbToGain(computeMakeupGainDb(dsp));
  const destination = audioCtx.createMediaStreamDestination();

  let chain = source.connect(highpass);
  for (const filter of eqFilters) chain = chain.connect(filter);
  chain.connect(lowpass).connect(presence).connect(shaper).connect(distortion).connect(compressor).connect(makeup).connect(destination);

  const applyDsp = (nextSettings = {}) => {
    dsp = normalizeDsp(nextSettings);
    const now = audioCtx.currentTime;
    highpass.frequency.setTargetAtTime(dsp.highpass_hz, now, 0.01);
    lowpass.frequency.setTargetAtTime(dsp.lowpass_hz, now, 0.01);
    presence.frequency.setTargetAtTime(dsp.presence_hz, now, 0.01);
    presence.gain.setTargetAtTime(dsp.presence_gain_db, now, 0.01);
    presence.Q.setTargetAtTime(dsp.presence_q, now, 0.01);
    compressor.threshold.setTargetAtTime(dsp.compression_threshold_db, now, 0.01);
    compressor.ratio.setTargetAtTime(dsp.compression_ratio, now, 0.01);
    compressor.attack.setTargetAtTime(dsp.attack_ms / 1000, now, 0.01);
    compressor.release.setTargetAtTime(dsp.release_ms / 1000, now, 0.01);
    makeup.gain.setTargetAtTime(dbToGain(computeMakeupGainDb(dsp)), now, 0.01);
    eqFilters.forEach((filter, index) => filter.gain.setTargetAtTime(dsp.eq_bands[index] || 0, now, 0.01));
    shaper.curve = makeRadioCurve(dsp.drive);
    distortion.curve = makeDistortionCurve(dsp.distortion);
  };

  return {
    outputTrack: destination.stream.getAudioTracks()[0],
    update(nextSettings) { if (nextSettings) applyDsp(nextSettings); },
    disconnect() {
      for (const node of [source, ...eqFilters, highpass, lowpass, presence, shaper, distortion, compressor, makeup, destination]) {
        try { node.disconnect(); } catch { /* already disconnected */ }
      }
    },
  };
}

export function createRadioVoiceChain(audioCtx, mediaElement, dspSettings = DEFAULT_RADIO_DSP) {
  if (!audioCtx || !mediaElement) return null;

  let dsp = normalizeDsp(dspSettings);
  if (!dsp.enabled) return null;

  mediaElement.volume = 1;
  const source = audioCtx.createMediaElementSource(mediaElement);

  const highpass = audioCtx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = dsp.highpass_hz;
  highpass.Q.value = 0.707;

  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = dsp.lowpass_hz;
  lowpass.Q.value = 0.707;

  const presence = audioCtx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = dsp.presence_hz;
  presence.Q.value = dsp.presence_q;
  presence.gain.value = dsp.presence_gain_db;

  const shaper = audioCtx.createWaveShaper();
  shaper.curve = makeRadioCurve(dsp.drive);
  shaper.oversample = '2x';

  const distortion = audioCtx.createWaveShaper();
  distortion.curve = makeDistortionCurve(dsp.distortion);
  distortion.oversample = '4x';

  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = dsp.compression_threshold_db;
  compressor.knee.value = 3;
  compressor.ratio.value = dsp.compression_ratio;
  compressor.attack.value = dsp.attack_ms / 1000;
  compressor.release.value = dsp.release_ms / 1000;

  const makeup = audioCtx.createGain();
  makeup.gain.value = dbToGain(computeMakeupGainDb(dsp));

  const volume = audioCtx.createGain();
  volume.gain.value = 0.8;

  source
    .connect(highpass)
    .connect(lowpass)
    .connect(presence)
    .connect(shaper)
    .connect(distortion)
    .connect(compressor)
    .connect(makeup)
    .connect(volume)
    .connect(audioCtx.destination);

  const applyDsp = (nextSettings = {}) => {
    dsp = normalizeDsp(nextSettings);
    const now = audioCtx.currentTime;
    highpass.frequency.setTargetAtTime(dsp.highpass_hz, now, 0.01);
    lowpass.frequency.setTargetAtTime(dsp.lowpass_hz, now, 0.01);
    presence.frequency.setTargetAtTime(dsp.presence_hz, now, 0.01);
    presence.gain.setTargetAtTime(dsp.presence_gain_db, now, 0.01);
    presence.Q.setTargetAtTime(dsp.presence_q, now, 0.01);
    compressor.threshold.setTargetAtTime(dsp.compression_threshold_db, now, 0.01);
    compressor.ratio.setTargetAtTime(dsp.compression_ratio, now, 0.01);
    compressor.attack.setTargetAtTime(dsp.attack_ms / 1000, now, 0.01);
    compressor.release.setTargetAtTime(dsp.release_ms / 1000, now, 0.01);
    shaper.curve = makeRadioCurve(dsp.drive);
    distortion.curve = makeDistortionCurve(dsp.distortion);
    makeup.gain.setTargetAtTime(dbToGain(computeMakeupGainDb(dsp)), now, 0.01);
  };

  return {
    setVolume(value0to100) {
      const v = Math.max(0, Math.min(1, Number(value0to100) / 100));
      volume.gain.setTargetAtTime(v, audioCtx.currentTime, 0.015);
    },
    update(nextSettings) {
      if (nextSettings) applyDsp(nextSettings);
    },
    disconnect() {
      for (const node of [source, highpass, lowpass, presence, shaper, distortion, compressor, makeup, volume]) {
        try { node.disconnect(); } catch { /* already disconnected */ }
      }
    },
  };
}

// The roger beep -- a short, local confirmation tone that plays the
// instant PTT is released. Members can turn it off or pick a style
// (RadioUserSettings.roger_beep_enabled / roger_beep_style, surfaced in
// the radio's own Settings dialog). ROGER_BEEP_DEFAULT/ROGER_BEEP_STYLES
// are the source of truth for both that dropdown and the fallback used
// when a settings row predates this field. Admins can also add their own
// recorded beeps (RadioRogerBeep entity, managed in Admin -> Web Radio);
// those are selected by passing that beep's audio_url as customUrl below
// rather than adding to this fixed list, since the list of admin uploads
// is dynamic.
export const ROGER_BEEP_DEFAULT = 'motorola';
export const ROGER_BEEP_STYLES = [
  { value: 'motorola', label: 'Motorola chirp (recorded)' },
  { value: 'classic_up', label: 'Classic (rising)' },
  { value: 'classic_down', label: 'Classic (falling)' },
  { value: 'single', label: 'Single beep' },
  { value: 'double', label: 'Double beep' },
];
const MOTOROLA_CLIP_URL = '/sounds/roger-beep-motorola.mp3';

// Any recorded clip (the built-in Motorola chirp or an admin-uploaded one)
// is decoded once per URL and cached as a plain AudioBuffer, which (unlike
// an HTMLAudioElement) isn't tied to the AudioContext that decoded it, so
// a cached buffer keeps working across reconnects even after that context
// has been closed and replaced.
const clipBufferPromises = new Map();
function loadClipBuffer(audioCtx, url) {
  if (!clipBufferPromises.has(url)) {
    clipBufferPromises.set(url, fetch(url)
      .then((res) => res.arrayBuffer())
      .then((data) => audioCtx.decodeAudioData(data)));
  }
  return clipBufferPromises.get(url);
}

const rogerBeepOutputGains = new WeakMap();

function getRogerBeepOutputGain(audioCtx) {
  let gain = rogerBeepOutputGains.get(audioCtx);
  if (!gain) {
    gain = audioCtx.createGain();
    gain.gain.value = 1;
    gain.connect(audioCtx.destination);
    rogerBeepOutputGains.set(audioCtx, gain);
  }
  return gain;
}

export function setRogerBeepVolume(audioCtx, volume0to100) {
  if (!audioCtx) return;
  const vol = Math.max(0, Math.min(1, Number(volume0to100) / 100));
  const gain = getRogerBeepOutputGain(audioCtx);
  gain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.01);
}

function playAudioClip(audioCtx, volume0to100, url) {
  const sourceVolume = Math.max(0, Math.min(1, Number(volume0to100) / 100));
  if (sourceVolume <= 0) return;
  loadClipBuffer(audioCtx, url).then((buffer) => {
    try {
      const source = audioCtx.createBufferSource();
      const gain = audioCtx.createGain();
      source.buffer = buffer;
      gain.gain.value = 1;
      source.connect(gain).connect(getRogerBeepOutputGain(audioCtx));
      source.start();
      source.onended = () => {
        try { source.disconnect(); } catch { /* already disconnected */ }
        try { gain.disconnect(); } catch { /* already disconnected */ }
      };
    } catch { /* the beep is a nicety, not required functionality */ }
  }).catch(() => { /* fetch/decode failed -- not worth surfacing for a beep */ });
}

// Real roger beeps (MDC-style) are short, discrete, staccato tones -- not
// one smooth pitch-bend, which reads as a siren/slide rather than a radio
// chirp. Each style below is defined as a list of {freq, start, dur} tones
// stepped in time. A triangle wave gives them the brighter, slightly
// electronic edge of a real chirp without the harshness of a square wave.
function rogerBeepTones(style) {
  switch (style) {
    case 'classic_down': return [{ freq: 1900, start: 0, dur: 0.07 }, { freq: 1300, start: 0.075, dur: 0.09 }];
    case 'single': return [{ freq: 1600, start: 0, dur: 0.11 }];
    case 'double': return [{ freq: 1700, start: 0, dur: 0.055 }, { freq: 1700, start: 0.09, dur: 0.055 }];
    case 'classic_up':
    default: return [{ freq: 1300, start: 0, dur: 0.07 }, { freq: 1900, start: 0.075, dur: 0.09 }];
  }
}

// Generated fresh each call straight to the destination rather than
// routed through the receive DSP chain above (which only ever processes
// real voice tracks), so it works even when no one else is on the channel
// to have subscribed a track in the first place. `customUrl` (an admin-
// uploaded RadioRogerBeep's audio_url) takes priority over `style` when
// present, since a custom selection isn't one of the fixed style keys.
export function playRogerBeep(audioCtx, volume0to100 = 80, style = ROGER_BEEP_DEFAULT, customUrl = null) {
  if (!audioCtx) return;
  setRogerBeepVolume(audioCtx, volume0to100);
  if (customUrl) { playAudioClip(audioCtx, volume0to100, customUrl); return; }
  if (style === 'motorola') { playAudioClip(audioCtx, volume0to100, MOTOROLA_CLIP_URL); return; }
  const peak = 0.32;
  if (peak <= 0) return;
  try {
    const now = audioCtx.currentTime;
    const tones = rogerBeepTones(style);
    const nodes = [];
    for (const t of tones) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(t.freq, now + t.start);
      gain.gain.setValueAtTime(0, now + t.start);
      gain.gain.linearRampToValueAtTime(peak, now + t.start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.dur);
      osc.connect(gain).connect(getRogerBeepOutputGain(audioCtx));
      osc.start(now + t.start);
      osc.stop(now + t.start + t.dur + 0.02);
      nodes.push(osc, gain);
    }
    const lastOsc = nodes[nodes.length - 2];
    lastOsc.onended = () => {
      for (const node of nodes) { try { node.disconnect(); } catch { /* already disconnected */ } }
    };
  } catch { /* the beep is a nicety, not required functionality */ }
}
