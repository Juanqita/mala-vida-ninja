/**
 * Sonidos sintetizados con WebAudio: cero archivos que descargar, cero licencias,
 * y funcionan igual en iOS y Android. El contexto se crea en el primer toque
 * porque los navegadores móviles bloquean el audio hasta que hay interacción.
 */
let ctx: AudioContext | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function unlockAudio() {
  audio();
}

export function setMuted(value: boolean) {
  muted = value;
}

export function isMuted() {
  return muted;
}

function tone(opts: {
  freq: number;
  toFreq?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}) {
  const ac = audio();
  if (!ac) return;

  const t0 = ac.currentTime + (opts.delay ?? 0);
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.toFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.toFreq), t0 + opts.duration);

  const peak = opts.gain ?? 0.18;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration);

  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + opts.duration + 0.05);
}

function noise(duration: number, gainValue = 0.25) {
  const ac = audio();
  if (!ac) return;

  const frames = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  }

  const src = ac.createBufferSource();
  src.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1800, ac.currentTime);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(gainValue, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);

  src.connect(filter).connect(gain).connect(ac.destination);
  src.start();
}

export const sfx = {
  /** Corte de un producto: swoosh corto y agudo. */
  slice(comboLevel = 0) {
    const base = 620 + Math.min(comboLevel, 10) * 45;
    tone({ freq: base, toFreq: base * 0.45, duration: 0.12, type: 'triangle', gain: 0.14 });
    noise(0.06, 0.12);
  },

  /** Elemento negativo: nota grave y sucia. */
  bad() {
    tone({ freq: 180, toFreq: 90, duration: 0.28, type: 'sawtooth', gain: 0.16 });
  },

  /** Bomba: explosión que termina la partida. */
  bomb() {
    noise(0.55, 0.4);
    tone({ freq: 120, toFreq: 40, duration: 0.5, type: 'sawtooth', gain: 0.22 });
  },

  /** Combo alcanzado: arpegio ascendente. */
  combo(level: number) {
    const root = 520 + level * 30;
    [0, 0.07, 0.14].forEach((delay, i) => {
      tone({ freq: root * (1 + i * 0.25), duration: 0.12, type: 'square', gain: 0.1, delay });
    });
  },

  /** Cuenta regresiva de inicio. */
  countdown(final = false) {
    tone({ freq: final ? 880 : 440, duration: final ? 0.35 : 0.12, type: 'square', gain: 0.12 });
  },

  /** Últimos 5 segundos. */
  tick() {
    tone({ freq: 1200, duration: 0.05, type: 'square', gain: 0.07 });
  },

  /** Fin de partida. */
  gameOver() {
    [523, 415, 330].forEach((f, i) => tone({ freq: f, duration: 0.28, type: 'triangle', gain: 0.14, delay: i * 0.16 }));
  },
};
