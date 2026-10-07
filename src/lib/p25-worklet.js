// "Digital P25" voice: the received audio is taken apart and rebuilt the way a P25
// radio's IMBE voice coder does it, which is where the robotic, slightly watery P25
// sound comes from. Every 20 ms the voice is reduced to a pitch, the loudness of each
// harmonic of that pitch and a voiced/unvoiced flag per band; the radio's speaker then
// rebuilds it from tones (voiced bands) and shaped noise (unvoiced bands). Like the real
// coder it works on 8 kHz audio, steps the pitch, smears the spectrum, gives the upper
// harmonics random phase and drops the background between words.
// Runs in an AudioWorklet; voicefx.js puts it between band-limiting filters.

const RATE = 8000, HOP = 160, WIN = 256, SYN = 320, NFFT = 512;
const MIN_LAG = 20, MAX_LAG = 123; // 400 Hz down to 65 Hz, the IMBE pitch range
const GATE_OPEN = 0.006, GATE_CLOSE = 0.0035, GATE_HANG = 6; // rms on the 8 kHz signal; hang in frames
const DB_STEP = 2; // loudness of each harmonic is kept in 2 dB steps

function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

const hann = (n, periodic) => Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (periodic ? n : n - 1)));

class P25Voice extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / RATE;  // input samples per 8 kHz sample
    this.inPos = 0;                 // where the next 8 kHz sample falls in the input
    this.prevIn = 0;
    this.hist = new Float32Array(WIN); // last WIN samples at 8 kHz
    this.fresh = 0;                 // new samples since the last frame
    this.win = hann(WIN, false);
    this.winPow = this.win.reduce((s, w) => s + w * w, 0);
    this.synWin = hann(SYN, true);
    this.out = new Float32Array(4096); this.outW = 0; this.outR = 0; this.started = false;
    this.ola = new Float32Array(SYN); // noise overlap-add tail
    this.outPos = 0; this.lastOut = 0; this.nextOut = 0;
    this.amps = new Float32Array(64); this.phase = new Float32Array(64); this.prevL = 0; this.prevF0 = 0;
    this.gateOpen = false; this.hang = 0; this.f0 = 120; this.lastVoiced = false;
    this.seed = 22222;
    this.re = new Float32Array(NFFT); this.im = new Float32Array(NFFT);
  }

  rand() { this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff; return this.seed / 0x7fffffff; }

  push8k(v) {
    this.hist.copyWithin(0, 1); this.hist[WIN - 1] = v;
    if (++this.fresh === HOP) { this.fresh = 0; this.frame(); }
  }

  frame() {
    const x = this.hist, N = WIN;
    let e = 0; for (let i = WIN - HOP; i < WIN; i++) e += x[i] * x[i];
    const rms = Math.sqrt(e / HOP);
    if (rms > GATE_OPEN) { this.gateOpen = true; this.hang = GATE_HANG; }
    else if (rms < GATE_CLOSE && this.gateOpen && --this.hang <= 0) this.gateOpen = false;

    // Pitch: the strongest normalised autocorrelation, preferring the shorter period
    // when a half-length one is nearly as strong (avoids dropping an octave).
    let best = 0, lag = 0; const r = new Float32Array(MAX_LAG + 2);
    let e0 = 0; for (let i = 0; i < N; i++) e0 += x[i] * x[i];
    for (let L = MIN_LAG; L <= MAX_LAG + 1; L++) {
      let s = 0, a = 0, b = 0;
      for (let i = L; i < N; i++) { s += x[i] * x[i - L]; a += x[i] * x[i]; b += x[i - L] * x[i - L]; }
      r[L] = s / (Math.sqrt(a * b) + 1e-9);
    }
    for (let L = MIN_LAG; L <= MAX_LAG; L++) if (r[L] > best && r[L] >= r[L - 1] && r[L] >= r[L + 1]) { best = r[L]; lag = L; }
    // Take a third or half of the period when that is nearly as strong, or a bit less
    // strong but the voice was just at the higher pitch (a sudden drop is nearly always
    // a multiple of the real period).
    const wasHigher = lag && this.lastVoiced && RATE / lag < 0.6 * this.f0;
    for (const d of [3, 2]) {
      const h = Math.round(lag / d);
      if (lag && h >= MIN_LAG && r[h] > (wasHigher ? 0.6 : 0.85) * best) { lag = h; best = r[h]; break; }
    }
    const voiced = best > 0.45 && e0 > 1e-6;
    this.lastVoiced = voiced;
    if (voiced) {
      // Half-sample steps of the period, as the coder sends it.
      const y0 = r[lag - 1], y1 = r[lag], y2 = r[lag + 1], d = y0 - 2 * y1 + y2;
      const exact = lag + (d < 0 ? 0.5 * (y0 - y2) / d : 0);
      this.f0 = RATE / (Math.round(exact * 2) / 2);
    }
    const f0 = this.f0;

    // Spectrum of the windowed frame.
    const re = this.re, im = this.im;
    re.fill(0); im.fill(0);
    for (let i = 0; i < N; i++) re[i] = x[i] * this.win[i];
    fft(re, im, false);
    const binHz = RATE / NFFT, pw = k => re[k] * re[k] + im[k] * im[k];

    // Loudness and voicing of each harmonic of the pitch, up to about 3.7 kHz.
    const L = Math.min(56, Math.floor(3700 / f0));
    const amp = new Float32Array(L + 1), isV = new Uint8Array(L + 1);
    const norm = 2 / (NFFT * this.winPow);
    for (let l = 1; l <= L; l++) {
      const lo = Math.max(1, Math.ceil((l - 0.5) * f0 / binHz)), hi = Math.min(NFFT / 2 - 1, Math.floor((l + 0.5) * f0 / binHz));
      const c = Math.round(l * f0 / binHz);
      let band = 0, peak = 0;
      for (let k = lo; k <= hi; k++) { const p = pw(k); band += p; if (Math.abs(k - c) <= 1) peak += p; }
      amp[l] = Math.sqrt(band * norm);
      // A harmonic counts as voiced when its energy sits on the harmonic, not spread out.
      isV[l] = voiced && band > 0 && peak / band > (l * f0 < 1500 ? 0.45 : 0.6) ? 1 : 0;
    }
    // Voicing goes by bands of three harmonics, like the coder's voiced/unvoiced bits.
    for (let l = 1; l <= L; l += 3) {
      let n = 0, v = 0; for (let k = l; k < l + 3 && k <= L; k++) { n++; v += isV[k]; }
      const on = v * 2 >= n; for (let k = l; k < l + 3 && k <= L; k++) isV[k] = on ? 1 : 0;
    }
    // Coarse, smoothed spectrum: log loudness smeared across neighbours, then stepped.
    const lg = new Float32Array(L + 2);
    for (let l = 1; l <= L; l++) lg[l] = 20 * Math.log10(amp[l] + 1e-7);
    for (let l = 1; l <= L; l++) {
      const a = lg[l - 1 >= 1 ? l - 1 : l], b = lg[l], c = lg[l + 1 <= L ? l + 1 : l];
      amp[l] = Math.pow(10, Math.round((0.25 * a + 0.5 * b + 0.25 * c) / DB_STEP) * DB_STEP / 20);
    }
    if (!this.gateOpen) amp.fill(0);

    this.synth(f0, L, amp, isV);
  }

  synth(f0, L, amp, isV) {
    // Voiced part: harmonics glide from last frame's loudness and pitch to this one's.
    const buf = new Float32Array(HOP);
    const prevF0 = this.prevF0 || f0, M = Math.max(L, this.prevL);
    const newAmps = new Float32Array(64);
    for (let l = 1; l <= M; l++) {
      const a1 = l <= L && isV[l] ? amp[l] : 0, a0 = this.amps[l];
      newAmps[l] = a1;
      if (!a0 && !a1) continue;
      // Harmonics that start up get a random phase above 1 kHz, the coder's buzzy edge.
      if (!a0) this.phase[l] = l * f0 > 1000 ? this.rand() * 2 * Math.PI : 0;
      const w0 = 2 * Math.PI * l * prevF0 / RATE, w1 = 2 * Math.PI * l * f0 / RATE;
      let ph = this.phase[l];
      for (let n = 0; n < HOP; n++) {
        const t = n / HOP;
        buf[n] += (a0 + (a1 - a0) * t) * Math.cos(ph);
        ph += w0 + (w1 - w0) * t;
      }
      this.phase[l] = ph % (2 * Math.PI);
    }
    this.amps = newAmps; this.prevL = L; this.prevF0 = f0;

    // Unvoiced part: noise shaped to each unvoiced harmonic's band, overlap-added.
    const re = this.re, im = this.im, binHz = RATE / NFFT;
    re.fill(0); im.fill(0);
    let any = false;
    for (let l = 1; l <= L; l++) {
      if (isV[l] || !amp[l]) continue;
      const lo = Math.max(1, Math.ceil((l - 0.5) * f0 / binHz)), hi = Math.min(NFFT / 2 - 1, Math.floor((l + 0.5) * f0 / binHz));
      if (hi < lo) continue;
      // Band power amp²/2, spread over its bins, scaled for the window overlap.
      const m = Math.sqrt((amp[l] * amp[l] / 2) * NFFT * NFFT / (2 * (hi - lo + 1)) / 0.75);
      for (let k = lo; k <= hi; k++) { const p = this.rand() * 2 * Math.PI; re[k] = m * Math.cos(p); im[k] = m * Math.sin(p); re[NFFT - k] = re[k]; im[NFFT - k] = -im[k]; }
      any = true;
    }
    const ola = this.ola;
    if (any) { fft(re, im, true); for (let n = 0; n < SYN; n++) ola[n] += re[n] * this.synWin[n]; }
    for (let n = 0; n < HOP; n++) buf[n] += ola[n];
    ola.copyWithin(0, HOP); ola.fill(0, SYN - HOP);

    for (let n = 0; n < HOP; n++) { this.out[this.outW] = buf[n]; this.outW = (this.outW + 1) & 4095; }
  }

  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0][0];
    if (!input || !input.length) return false; // disconnected: let the node go
    const ch = input[0];
    for (let i = 0; i < ch.length; i++) {
      // Down to 8 kHz (the filter before this node keeps out what would fold over).
      while (this.inPos <= i) { const f = this.inPos - (i - 1); this.push8k(this.prevIn + (ch[i] - this.prevIn) * Math.max(0, Math.min(1, f))); this.inPos += this.step; }
      this.prevIn = ch[i];
    }
    this.inPos -= ch.length;
    // Back up to the output rate, one frame behind so the queue never runs dry.
    const queued = (this.outW - this.outR) & 4095;
    if (!this.started && queued >= HOP + 40) this.started = true;
    for (let i = 0; i < output.length; i++) {
      if (!this.started) { output[i] = 0; continue; }
      this.outPos += 1 / this.step;
      while (this.outPos >= 1) {
        this.outPos -= 1; this.lastOut = this.nextOut;
        if (((this.outW - this.outR) & 4095) > 0) { this.nextOut = this.out[this.outR]; this.outR = (this.outR + 1) & 4095; }
        else this.nextOut = 0;
      }
      output[i] = this.lastOut + (this.nextOut - this.lastOut) * this.outPos;
    }
    return true;
  }
}

registerProcessor("p25-voice", P25Voice);
