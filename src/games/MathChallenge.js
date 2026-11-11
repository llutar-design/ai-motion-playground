import { BaseGame, fillSky } from './BaseGame.js';
import { generateQuestion, shuffle } from '../data/mathQuestions.js';
import { pick } from '../core/constants.js';
import { text, roundRect, COLORS, INK, CREAM } from '../assets/art.js';

const SLOT_X = [370, 960, 1550];

export class MathChallenge extends BaseGame {
  static meta = {
    id: 'math', name: '숫자 천재 대작전', desc: '손을 뻗어 수학 문제의 정답을 골라요',
    howTo: ['정답 칸에 손을 대고 있으면 선택돼요', '틀려도 괜찮아요. 다시 도전할 수 있어요', '주먹이나 엄지 척을 하면 바로 선택돼요'],
    grade: '1~6학년', level: 2, players: [1], theme: 'bright', bgm: 100, oneHand: true, tint: COLORS.yellow,
    options: [
      { key: 'op', label: '문제 종류', choices: [{ v: 'mixed', l: '섞어서' }, { v: 'add', l: '덧셈' }, { v: 'sub', l: '뺄셈' }, { v: 'mul', l: '곱셈' }, { v: 'custom', l: '선생님 문제' }] },
      { key: 'level', label: '학년 수준', choices: [{ v: 'low', l: '1~2학년' }, { v: 'mid', l: '3~4학년' }, { v: 'high', l: '5~6학년' }] },
      { key: 'goal', label: '진행 방식', choices: [{ v: '10', l: '10문제' }, { v: '20', l: '20문제' }, { v: 'time', l: '제한시간' }] },
    ],
  };

  static drawIcon(g, s) {
    fillSky(g, s, s, '#FFF0B3', '#FFE07A');
    text(g, '1+2', s * 0.5, s * 0.34, s * 0.3, INK);
    roundRect(g, s * 0.3, s * 0.56, s * 0.4, s * 0.28, s * 0.07); g.fillStyle = COLORS.teal; g.fill(); g.lineWidth = s * 0.03; g.strokeStyle = INK; g.stroke();
    text(g, '3', s * 0.5, s * 0.71, s * 0.22, INK);
  }

  setup() {
    this.op = this.options.op ?? 'mixed';
    this.level = this.options.level ?? 'low';
    const goal = this.options.goal ?? '10';
    this.timed = goal === 'time';
    this.total = this.timed ? Infinity : Number(goal);
    this.custom = this.op === 'custom' ? shuffle(this.settings.get('customMath')) : [];
    this.customIndex = 0;
    this.noCustom = this.op === 'custom' && !this.custom.length;
    this.done = 0;
    this.tries = 0;
    this.feedback = null;
    this.next();
  }

  makeQuestion() {
    if (this.custom.length) {
      const q = this.custom[this.customIndex % this.custom.length];
      this.customIndex += 1;
      return { q: q.q, choices: shuffle(q.choices), answer: q.answer };
    }
    const q = generateQuestion(this.noCustom ? 'mixed' : this.op, this.level);
    return { q: q.q, choices: q.choices.map(String), answer: String(q.answer) };
  }

  next() {
    this.current = this.makeQuestion();
    this.tries = 0;
    this.feedback = null;
    const w = Math.min(540, 460 * this.d.size);
    const h = Math.min(400, 320 * this.d.size);
    this.targets = this.engine.setTargets(this.current.choices.map((value, i) => ({
      id: `c${i}`, value, x: SLOT_X[i], y: 640, w, h, dwell: 900 * this.d.react,
    })));
    this.hudCenter = this.timed ? '' : `${this.done + 1} / ${this.total} 문제`;
  }

  step(dt, motion) {
    if (this.feedback) {
      this.feedback.time -= dt;
      if (this.feedback.time <= 0 && this.feedback.advance) {
        if (this.done >= this.total) { this.finish({ cleared: true }); return; }
        this.next();
      } else if (this.feedback.time <= 0) this.feedback = null;
      return;
    }
    const ev = motion.events.find((e) => e.type === 'REACH_TARGET');
    if (!ev) return;
    const t = this.targets.find((x) => x.id === ev.targetId);
    if (t) this.choose(t);
  }

  choose(t) {
    if (t.value === this.current.answer) {
      this.done += 1;
      const pts = this.tries === 0 ? 100 : this.tries === 1 ? 50 : 20;
      this.burst(t.x, t.y, COLORS.yellow, 30);
      this.award(pts, t.x, t.y - 180, { sound: 'correct' });
      t.correct = true;
      for (const o of this.targets) o.disabled = true;
      this.feedback = { text: pick(['최고야!', '대단해!', '정답이에요!', '도전 성공!']), time: 1.1, advance: true, good: true };
    } else {
      this.tries += 1;
      t.disabled = true;
      t.wrong = true;
      this.audio.sfx('soft');
      this.feedback = { text: '다시 도전!', time: 0.8, advance: false, good: false };
      for (const o of this.targets) if (!o.disabled) o.progress = 0;
    }
  }

  draw(g) {
    fillSky(g, this.W, this.H, '#FFEFA8', '#FFF9E3');
    roundRect(g, 310, 170, 1300, 220, 50); g.fillStyle = CREAM; g.fill(); g.lineWidth = 9; g.strokeStyle = INK; g.stroke();
    text(g, this.current.q, this.W / 2, 282, 130, INK);
    for (const t of this.targets ?? []) {
      const x = t.x - t.w / 2; const y = t.y - t.h / 2;
      roundRect(g, x, y, t.w, t.h, 44);
      g.fillStyle = t.correct ? COLORS.teal : t.wrong ? '#DAD8E6' : t.hover ? '#FFE27A' : '#FFFFFF';
      g.fill(); g.lineWidth = 9; g.strokeStyle = INK; g.stroke();
      if (t.progress > 0 && !t.disabled) {
        g.save(); roundRect(g, x, y, t.w, t.h, 44); g.clip();
        g.fillStyle = 'rgba(63,208,178,.65)';
        g.fillRect(x, y + t.h * (1 - t.progress), t.w, t.h * t.progress);
        g.restore();
      }
      text(g, t.value, t.x, t.y + 2, t.value.length > 5 ? 72 : 130, t.wrong ? '#8A93B5' : INK);
      if (t.wrong) { g.lineWidth = 12; g.strokeStyle = '#8A93B5'; g.lineCap = 'round'; g.beginPath(); g.moveTo(x + 50, y + 50); g.lineTo(x + t.w - 50, y + t.h - 50); g.stroke(); }
    }
    if (this.feedback) text(g, this.feedback.text, this.W / 2, 930, 96, this.feedback.good ? '#128A70' : INK, 'center', CREAM);
    else if (this.noCustom) text(g, '등록된 선생님 문제가 없어서 기본 문제로 진행해요', this.W / 2, 930, 44, INK);
    else if (this.motion?.mode === 'mouse') text(g, '정답 칸 위에 마우스를 올려 두세요', this.W / 2, 930, 44, INK);
  }

  finish(extra) { super.finish({ ...extra, success: this.done, details: [['맞힌 문제', this.done]] }); }
}
