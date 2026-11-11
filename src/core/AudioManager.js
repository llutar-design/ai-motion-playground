// 모든 소리는 Web Audio로 직접 합성한다(외부 음원 없음).
const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

const SCALES = {
  bright: [60, 62, 64, 67, 69, 72],
  sea: [57, 60, 62, 64, 67, 69],
  magic: [62, 65, 67, 69, 72, 74],
  dig: [55, 58, 60, 62, 65, 67],
};

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.bgmTimer = null;
    this.scheduled = new Set();
    settings.subscribe(() => this.#applyVolumes());
  }

  /** 브라우저 정책상 첫 클릭 이후에 호출해야 소리가 난다. */
  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.#applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  #applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings.data;
    this.master.gain.value = s.sound ? 1 : 0;
    this.sfxBus.gain.value = s.sfxVolume;
    this.musicBus.gain.value = s.musicVolume;
  }

  get now() { return this.ctx?.currentTime ?? 0; }

  /** performance.now() 시각을 "그때 들리던 오디오 시각"으로 변환한다. 리듬 판정의 공통 기준이다. */
  perfToAudio(perfMs) {
    if (!this.ctx) return 0;
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts && ts.performanceTime > 0) return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    return this.ctx.currentTime - (performance.now() - perfMs) / 1000 - (this.ctx.outputLatency || 0);
  }

  suspend() { if (this.ctx?.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }

  tone({ freq, start = this.now, dur = 0.12, type = 'sine', gain = 0.3, bus = this.sfxBus, slide = 0 }) {
    if (!this.ctx) return null;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(bus);
    o.start(start);
    o.stop(start + dur + 0.02);
    return o;
  }

  noise({ start = this.now, dur = 0.08, gain = 0.2, bus = this.sfxBus, freq = 2000 }) {
    if (!this.ctx) return null;
    this._noise ??= (() => {
      const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return b;
    })();
    const s = this.ctx.createBufferSource();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    s.buffer = this._noise;
    f.type = 'bandpass';
    f.frequency.value = freq;
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(start);
    s.stop(start + dur + 0.02);
    return s;
  }

  sfx(name) {
    if (!this.ctx) return;
    const t = this.now;
    const up = (notes, gap = 0.07, type = 'triangle', gain = 0.28) => notes.forEach((n, i) => this.tone({ freq: NOTE(n), start: t + i * gap, dur: 0.16, type, gain }));
    switch (name) {
      case 'pop': this.tone({ freq: 700, dur: 0.1, slide: 0.3, gain: 0.35 }); this.noise({ dur: 0.05, gain: 0.15, freq: 3000 }); break;
      case 'gold': up([76, 79, 84, 88], 0.06); break;
      case 'soft': this.tone({ freq: 240, dur: 0.22, slide: 0.7, type: 'sine', gain: 0.22 }); break;
      case 'slash': this.noise({ dur: 0.12, gain: 0.3, freq: 3500 }); break;
      case 'block': this.tone({ freq: 520, dur: 0.14, type: 'square', gain: 0.12, slide: 1.4 }); break;
      case 'splash': this.noise({ dur: 0.2, gain: 0.25, freq: 900 }); this.tone({ freq: 500, dur: 0.15, slide: 2 }); break;
      case 'correct': up([72, 76, 79]); break;
      case 'tick': this.tone({ freq: 880, dur: 0.06, gain: 0.15 }); break;
      case 'go': up([72, 79, 84], 0.09, 'square', 0.14); break;
      case 'door': up([60, 67, 72, 79, 84], 0.09); break;
      case 'found': up([67, 71, 74, 79, 83], 0.08); break;
      case 'win': up([72, 76, 79, 84, 88, 91], 0.1); break;
      default: this.tone({ freq: 440 });
    }
  }

  /** 앞을 내다보며 예약하는 짧은 배경 음악. 게임을 멈추면 함께 정지한다. */
  startBgm(theme = 'bright', bpm = 112) {
    this.stopBgm();
    if (!this.ctx) return;
    const scale = SCALES[theme] ?? SCALES.bright;
    const beat = 60 / bpm / 2;
    let step = 0;
    let next = this.now + 0.1;
    let idx = 2;
    const run = () => {
      if (this.ctx.state !== 'running') return;
      while (next < this.now + 0.3) {
        if (step % 2 === 0 && (step % 16 !== 14)) {
          idx = Math.max(0, Math.min(scale.length - 1, idx + [-2, -1, 1, 2, 0][Math.floor(Math.random() * 5)]));
          this.tone({ freq: NOTE(scale[idx] + 12), start: next, dur: beat * 1.5, type: 'triangle', gain: 0.16, bus: this.musicBus });
        }
        if (step % 4 === 0) this.tone({ freq: NOTE(scale[[0, 3, 1, 4][(step / 16) % 4 | 0]] - 24), start: next, dur: beat * 3, type: 'sine', gain: 0.3, bus: this.musicBus });
        if (step % 8 === 4) this.noise({ start: next, dur: 0.05, gain: 0.08, bus: this.musicBus, freq: 5000 });
        step += 1;
        next += beat;
      }
    };
    this.bgmTimer = setInterval(run, 100);
    run();
  }

  stopBgm() { clearInterval(this.bgmTimer); this.bgmTimer = null; }

  /** 리듬 게임용 트랙을 절대 시각으로 예약한다. stopSong으로 취소할 수 있다. */
  scheduleSong(events) {
    for (const ev of events) {
      const node = ev.noise ? this.noise({ ...ev, bus: this.musicBus }) : this.tone({ ...ev, bus: this.musicBus });
      if (node) { this.scheduled.add(node); node.onended = () => this.scheduled.delete(node); }
    }
  }

  stopSong() {
    for (const n of this.scheduled) { n.onended = null; try { n.stop(); } catch { /* 이미 끝난 노드 */ } }
    this.scheduled.clear();
  }

  stopAll() { this.stopBgm(); this.stopSong(); this.resume(); }
}
