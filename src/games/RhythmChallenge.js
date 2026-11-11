import { BaseGame, fillSky } from './BaseGame.js';
import { text, roundRect, COLORS, INK, CREAM } from '../assets/art.js';

const COLS = { L: 500, B: 960, R: 1420 };
const HIT_Y = 800;
const TOP_Y = 180;
const LEAD_S = 1.9;
const LEAD_IN_S = 2.4;
const INPUT_LATENCY_S = 0.05;
const LABEL = { L: '왼손', B: '양손', R: '오른손' };
const COLOR = { L: COLORS.sky, B: COLORS.yellow, R: COLORS.coral };
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const CHORDS = [[48, 64, 67], [45, 60, 64], [41, 57, 60], [43, 59, 62]];

export class RhythmChallenge extends BaseGame {
  static meta = {
    id: 'rhythm', name: '리듬 팡팡 챌린지', desc: '음악 박자에 맞춰 손을 들어요',
    howTo: ['표시가 선에 닿을 때 손을 들어요', '왼손, 오른손, 양손을 표시대로 들어요', '다음 박자 전에 손을 내려요'],
    grade: '2~6학년', level: 3, players: [1], noBgm: true, oneHand: true, tint: COLORS.pink,
    options: [{ key: 'wide', label: '판정 넓히기', choices: [{ v: false, l: '기본' }, { v: true, l: '넓게' }] }],
  };

  static drawIcon(g, s) {
    fillSky(g, s, s, '#FFD2E8', '#FFF0F7');
    g.lineWidth = s * 0.05; g.strokeStyle = INK; g.lineCap = 'round';
    g.beginPath(); g.moveTo(s * 0.36, s * 0.72); g.lineTo(s * 0.36, s * 0.26); g.lineTo(s * 0.74, s * 0.18); g.lineTo(s * 0.74, s * 0.64); g.stroke();
    for (const [x, y] of [[0.27, 0.72], [0.65, 0.64]]) { g.beginPath(); g.ellipse(s * x, s * y, s * 0.11, s * 0.085, -0.3, 0, 7); g.fillStyle = COLORS.coral; g.fill(); g.stroke(); }
  }

  setup() {
    this.timed = false;
    const wide = this.options.wide ?? this.settings.get('wideTiming');
    const k = wide ? 1.6 : this.d.id === 'hard' ? 0.85 : 1;
    this.perfect = 0.14 * k;
    this.good = 0.3 * k;
    this.bpm = this.d.id === 'easy' ? 84 : this.d.id === 'hard' ? 112 : 96;
    this.counts = { PERFECT: 0, GOOD: 0, MISS: 0 };
    this.lastEdge = { left: performance.now(), right: performance.now() };
    this.judge = null;
    this.buildSong();
    this.hudCenter = '준비!';
  }

  buildSong() {
    const beat = 60 / this.bpm;
    const start = this.audio.now + LEAD_IN_S;
    const beats = Math.max(16, Math.floor(this.timeLimit / beat / 4) * 4);
    const every = this.d.id === 'hard' ? 1 : 2;
    const pool = this.d.id === 'easy' ? ['L', 'R', 'L', 'R', 'B'] : ['L', 'R', 'B', 'R', 'L', 'B'];
    const notes = [];
    const song = [];
    // 박자가 어긋나지 않도록 음표와 소리를 같은 오디오 시각으로 예약한다.
    for (let b = 0; b < beats; b++) {
      const t = start + b * beat;
      song.push({ freq: 110, start: t, dur: 0.16, type: 'sine', gain: 0.5, slide: 0.45 });
      song.push({ noise: true, start: t + beat / 2, dur: 0.05, gain: 0.09, freq: 7000 });
      if (b % 2 === 1) song.push({ noise: true, start: t, dur: 0.1, gain: 0.16, freq: 1800 });
      const chord = CHORDS[Math.floor(b / 4) % CHORDS.length];
      song.push({ freq: midi(chord[0]), start: t, dur: beat * 0.8, type: 'triangle', gain: 0.24 });
      if (b % 2 === 0) { song.push({ freq: midi(chord[1]), start: t, dur: beat * 0.9, type: 'triangle', gain: 0.08 }); song.push({ freq: midi(chord[2]), start: t, dur: beat * 0.9, type: 'triangle', gain: 0.08 }); }
      if (b >= 4 && b % every === 0 && b < beats - 2) {
        let kind = pool[notes.length % pool.length];
        if (this.settings.get('oneHand') !== 'off') kind = this.settings.get('oneHand') === 'left' ? 'L' : 'R';
        notes.push({ t, kind, got: {}, done: false, y: TOP_Y });
        song.push({ freq: midi(kind === 'L' ? 79 : kind === 'R' ? 84 : 88), start: t, dur: 0.14, type: 'square', gain: 0.07 });
      }
    }
    this.notes = notes;
    this.endAt = start + beats * beat + 0.8;
    this.audio.scheduleSong(song);
    this.total = notes.length;
    this.judged = 0;
  }

  /** 손을 든 순간의 시각을 음악 시각으로 바꿔 가장 가까운 음표와 비교한다. */
  handleEdge(side, perfTime) {
    const at = this.audio.perfToAudio(perfTime) - INPUT_LATENCY_S;
    const key = side === 'left' ? 'L' : 'R';
    const oneHand = this.settings.get('oneHand') !== 'off';
    let best = null; let bestD = this.good;
    for (const n of this.notes) {
      if (n.done || n.got[key] !== undefined) continue;
      if (!oneHand && n.kind !== key && n.kind !== 'B') continue;
      const d = Math.abs(at - n.t);
      if (d <= bestD) { bestD = d; best = n; }
    }
    if (!best) return;
    best.got[key] = at;
    if (best.kind !== 'B' || oneHand) { this.mark(best, bestD); return; }
    if (best.got.L !== undefined && best.got.R !== undefined) {
      this.mark(best, Math.max(Math.abs(best.got.L - best.t), Math.abs(best.got.R - best.t)));
    }
  }

  mark(n, delta) {
    n.done = true;
    this.judged += 1;
    const x = COLS[n.kind];
    if (delta <= this.perfect) {
      this.counts.PERFECT += 1;
      this.burst(x, HIT_Y, COLOR[n.kind], 22);
      this.award(30, x, HIT_Y - 130, { label: 'PERFECT', sound: 'correct' });
      this.judge = { text: 'PERFECT', color: COLORS.yellow, time: 0.5 };
    } else {
      this.counts.GOOD += 1;
      this.burst(x, HIT_Y, COLOR[n.kind], 10);
      this.award(15, x, HIT_Y - 130, { label: 'GOOD', sound: 'pop' });
      this.judge = { text: 'GOOD', color: COLORS.teal, time: 0.5 };
    }
  }

  miss(n) {
    n.done = true;
    n.missed = true;
    this.judged += 1;
    this.counts.MISS += 1;
    this.combo = 0;
    this.judge = { text: 'MISS', color: CREAM, time: 0.45 };
  }

  step(dt, motion) {
    const now = this.audio.perfToAudio(performance.now());
    this.now = now;
    const p = motion.players[0];
    for (const side of ['left', 'right']) {
      const key = side === 'left' ? 'leftUp' : 'rightUp';
      if (p.edges[key] > this.lastEdge[side]) { this.lastEdge[side] = p.edges[key]; this.handleEdge(side, p.edges[key]); }
    }
    for (const n of this.notes) {
      if (!n.done && now > n.t + this.good + 0.05) this.miss(n);
    }
    if (this.judge) { this.judge.time -= dt; if (this.judge.time <= 0) this.judge = null; }
    this.hudCenter = `${Math.min(this.total, this.judged)} / ${this.total}`;
    if (now >= this.endAt) this.finish({ cleared: true });
  }

  draw(g) {
    fillSky(g, this.W, this.H, '#FFC6E2', '#FFF0F7');
    const now = this.now ?? this.audio.now;
    for (const k of ['L', 'B', 'R']) {
      const x = COLS[k];
      roundRect(g, x - 130, 170, 260, 790, 40); g.fillStyle = 'rgba(255,255,255,.55)'; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.arc(x, HIT_Y, 112, 0, 7); g.fillStyle = CREAM; g.fill(); g.lineWidth = 10; g.strokeStyle = INK; g.stroke();
      text(g, LABEL[k], x, 1010, 56, INK);
    }
    for (const n of this.notes) {
      if (n.done && !n.missed) continue;
      const remain = n.t - now;
      if (remain > LEAD_S || remain < -0.5) continue;
      const y = HIT_Y - (remain / LEAD_S) * (HIT_Y - TOP_Y);
      this.#drawNote(g, COLS[n.kind], y, n);
    }
    if (this.judge) text(g, this.judge.text, this.W / 2, 500, 120, this.judge.color, 'center', INK);
    if (now < (this.notes[0]?.t ?? 0) - LEAD_S) text(g, '음악이 곧 시작돼요', this.W / 2, 500, 90, INK, 'center', CREAM);
    if (this.motion?.mode === 'mouse') text(g, '클릭 위치(왼쪽/가운데/오른쪽) 또는 A, D, 스페이스', this.W / 2, 130, 40, INK, 'center', CREAM);
  }

  #drawNote(g, x, y, n) {
    g.save();
    g.globalAlpha = n.missed ? 0.3 : 1;
    g.beginPath();
    if (n.kind === 'B') { g.moveTo(x, y - 92); g.lineTo(x + 92, y); g.lineTo(x, y + 92); g.lineTo(x - 92, y); g.closePath(); }
    else if (n.kind === 'L') { g.moveTo(x - 96, y); g.lineTo(x + 66, y - 88); g.lineTo(x + 66, y + 88); g.closePath(); }
    else { g.moveTo(x + 96, y); g.lineTo(x - 66, y - 88); g.lineTo(x - 66, y + 88); g.closePath(); }
    g.fillStyle = COLOR[n.kind]; g.fill(); g.lineWidth = 8; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke();
    g.restore();
  }

  onDispose() { this.audio.stopSong(); }

  finish(extra) {
    super.finish({ ...extra, success: this.counts.PERFECT + this.counts.GOOD, details: [['PERFECT', this.counts.PERFECT], ['GOOD', this.counts.GOOD], ['MISS', this.counts.MISS], ['최고 콤보', this.bestCombo]] });
  }
}
