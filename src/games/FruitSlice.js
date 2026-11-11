import { BaseGame, fillSky } from './BaseGame.js';
import { rand, pick } from '../core/constants.js';
import { drawFruit, drawBomb, text, COLORS, INK, CREAM } from '../assets/art.js';

const KINDS = ['apple', 'orange', 'lemon', 'melon', 'plum'];
const JUICE = { apple: COLORS.coral, orange: COLORS.orange, lemon: COLORS.yellow, melon: COLORS.green, plum: COLORS.violet };

export class FruitSlice extends BaseGame {
  static meta = {
    id: 'fruit', name: '과일 슥삭!', desc: '손을 움직여 날아오는 과일을 잘라요',
    howTo: ['손을 움직이며 과일 위를 지나가요', '가시 달린 X 폭탄에는 닿지 않게 조심해요', '팔을 세게 휘두르지 않아도 돼요'],
    grade: '2~6학년', level: 2, players: [1, 2], theme: 'bright', bgm: 124, oneHand: true, tint: COLORS.orange,
    options: [{ key: 'slow', label: '느린 모드', choices: [{ v: false, l: '끄기' }, { v: true, l: '켜기' }] }],
  };

  static drawIcon(g, s) {
    fillSky(g, s, s, '#FFE3B8', '#FFF4DE');
    drawFruit(g, s * 0.32, s * 0.56, s * 0.17, 'orange');
    drawFruit(g, s * 0.68, s * 0.44, s * 0.17, 'apple');
    g.beginPath(); g.moveTo(s * 0.14, s * 0.84); g.lineTo(s * 0.88, s * 0.14); g.lineWidth = s * 0.03; g.lineCap = 'round'; g.strokeStyle = '#FFF'; g.stroke();
  }

  setup() {
    this.slow = this.options.slow ?? this.settings.get('slowFruit');
    this.minSpeed = this.slow ? 0 : 320;
    this.gravity = (this.slow ? 620 : 980) * this.d.speed;
    this.items = [];
    this.halves = [];
    this.trails = new Map();
    this.warnCd = 0;
    this.missed = 0;
  }

  launch() {
    const bomb = Math.random() < 0.16;
    const x = rand(300, this.W - 300);
    const pow = (this.slow ? 0.78 : 1) * this.d.speed ** 0.5;
    this.items.push({
      x, y: this.H + 110, vx: (this.W / 2 - x) * rand(0.2, 0.42) * pow, vy: -rand(1040, 1240) * pow,
      r: rand(72, 90) * this.d.size, kind: bomb ? 'bomb' : pick(KINDS), spin: 0, vs: rand(-3, 3), rose: false,
    });
  }

  step(dt) {
    if (this.tickTimer('launch', dt, (this.slow ? 1.0 : 0.72) / this.d.spawn)) this.launch();
    this.warnCd = Math.max(0, this.warnCd - dt);
    const hands = this.hands();
    for (const h of hands) {
      const key = `${h.playerId}${h.id}`;
      const list = this.trails.get(key) ?? [];
      list.push({ x: h.x, y: h.y, life: 1 });
      if (list.length > 16) list.shift();
      this.trails.set(key, list);
      if (h.speed > 7500 && this.warnCd <= 0) { this.warnCd = 5; this.floatText(this.W / 2, 300, '천천히 움직여도 돼요!', CREAM, 60); }
    }
    for (const list of this.trails.values()) for (const p of list) p.life -= dt * 5;
    for (const [k, list] of this.trails) this.trails.set(k, list.filter((p) => p.life > 0));

    for (const f of this.items) {
      f.vy += this.gravity * dt;
      f.x += f.vx * dt; f.y += f.vy * dt; f.spin += f.vs * dt;
      if (f.y < this.H - 40) f.rose = true;
      if (f.rose && f.y > this.H + 130) { f.gone = true; if (f.kind !== 'bomb') this.missed += 1; continue; }
      if (!f.rose) continue;
      const hit = hands.find((h) => h.speed >= this.minSpeed && this.touching(h, f.x, f.y, f.r, 30));
      if (hit) this.cut(f, hit);
    }
    for (const h of this.halves) { h.vy += this.gravity * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.spin += h.vs * dt; }
    this.items = this.items.filter((f) => !f.gone);
    this.halves = this.halves.filter((h) => h.y < this.H + 200);
  }

  cut(f, hand) {
    f.gone = true;
    if (f.kind === 'bomb') {
      this.burst(f.x, f.y, '#4E4B66', 14);
      this.penalize(20, f.x, f.y);
      return;
    }
    this.burst(f.x, f.y, JUICE[f.kind], 18);
    this.award(10, f.x, f.y, { sound: 'slash' });
    for (const dir of [-1, 1]) {
      this.halves.push({ x: f.x + dir * 20, y: f.y, r: f.r * 0.72, kind: f.kind, vx: f.vx * 0.4 + dir * 240 + hand.vx * 0.05, vy: f.vy * 0.4 - 160, spin: f.spin, vs: dir * 6 });
    }
  }

  draw(g) {
    fillSky(g, this.W, this.H, '#FFD79A', '#FFF4DE');
    g.fillStyle = '#E7B277';
    g.fillRect(0, this.H - 60, this.W, 60);
    for (const h of this.halves) drawFruit(g, h.x, h.y, h.r, h.kind, h.spin);
    for (const f of this.items) {
      if (f.kind === 'bomb') drawBomb(g, f.x, f.y, f.r, f.spin); else drawFruit(g, f.x, f.y, f.r, f.kind, f.spin);
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const list of this.trails.values()) {
      for (let i = 1; i < list.length; i++) {
        g.beginPath(); g.moveTo(list[i - 1].x, list[i - 1].y); g.lineTo(list[i].x, list[i].y);
        g.lineWidth = (i / list.length) * 26;
        g.strokeStyle = `rgba(255,255,255,${Math.max(0, list[i].life)})`;
        g.stroke();
      }
    }
    if (this.slow && this.elapsed < 4) text(g, '느린 모드: 천천히 지나가도 잘려요', this.W / 2, 240, 52, INK, 'center', CREAM);
  }

  finish(extra) { super.finish({ ...extra, details: [['최고 콤보', this.bestCombo], ['자른 과일', this.success]] }); }
}
