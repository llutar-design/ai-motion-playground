import { BaseGame, fillSky } from './BaseGame.js';
import { rand, lerp, clamp } from '../core/constants.js';
import { drawStar, COLORS } from '../assets/art.js';

export class StarCatch extends BaseGame {
  static meta = {
    id: 'star', name: '반짝반짝 별잡기', desc: '양팔을 뻗어 날아오는 별을 잡아요',
    howTo: ['왼손과 오른손으로 별을 잡아요', '금색 큰 별은 점수가 높아요', '팔을 쭉 뻗어 잡으면 추가 점수!'],
    grade: '1~6학년', level: 1, players: [1, 2], theme: 'magic', oneHand: true, tint: COLORS.violet,
  };

  static drawIcon(g, s) {
    fillSky(g, s, s, '#2B2A6B', '#5D4BB0');
    drawStar(g, s * 0.5, s * 0.46, s * 0.26, COLORS.yellow, 0.2);
    drawStar(g, s * 0.2, s * 0.24, s * 0.09, CREAM_STAR);
    drawStar(g, s * 0.8, s * 0.74, s * 0.1, CREAM_STAR);
  }

  setup() {
    this.stars = [];
    this.bg = Array.from({ length: 70 }, () => ({ x: rand(0, this.W), y: rand(0, this.H), r: rand(1.5, 4), p: rand(0, 6) }));
  }

  spawn() {
    const gold = Math.random() < 0.15;
    // 팔을 뻗게 유도하도록 바깥쪽 영역에 더 자주 나타난다.
    const side = Math.random() < 0.5 ? -1 : 1;
    const outer = Math.random() < 0.65;
    const x = outer ? this.W / 2 + side * rand(480, 820) : this.W / 2 + side * rand(100, 480);
    const y = rand(210, 800);
    this.stars.push({ sx: this.W / 2, sy: 420, tx: x, ty: y, x: this.W / 2, y: 420, r: 0, full: rand(62, 78) * this.d.size * (gold ? 1.15 : 1), gold, fly: 0, life: 2.6 * this.d.react, spin: rand(0, 6) });
  }

  step(dt) {
    if (this.tickTimer('spawn', dt, 0.75 / this.d.spawn)) this.spawn();
    const hands = this.hands();
    for (const s of this.stars) {
      s.fly = clamp(s.fly + (dt * 1.3 * this.d.speed), 0, 1);
      const e = 1 - (1 - s.fly) ** 3;
      s.x = lerp(s.sx, s.tx, e); s.y = lerp(s.sy, s.ty, e);
      s.r = s.full * (0.25 + 0.75 * e);
      s.spin += dt * 1.5;
      if (s.fly >= 1) { s.life -= dt; if (s.life <= 0) s.gone = true; }
      if (s.gone || s.fly < 0.45) continue;
      const hit = hands.find((h) => this.touching(h, s.x, s.y, s.r));
      if (hit) this.collect(s, hit);
    }
    this.stars = this.stars.filter((s) => !s.gone);
  }

  collect(s, hand) {
    s.gone = true;
    const stretched = hand.extended || hand.reach > 0.85;
    const pts = (s.gold ? 40 : 10) + (stretched ? 5 : 0);
    this.burst(s.x, s.y, s.gold ? COLORS.yellow : '#FFF3B0', 18);
    this.award(pts, s.x, s.y, { sound: s.gold ? 'gold' : 'pop', label: stretched ? '쭉 뻗기!' : null });
  }

  draw(g) {
    fillSky(g, this.W, this.H, '#1F1E58', '#4F3FA3');
    g.fillStyle = '#FFF';
    for (const b of this.bg) { g.globalAlpha = 0.45 + 0.45 * Math.sin(this.t * 2 + b.p); g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    for (const s of this.stars) {
      g.globalAlpha = s.fly >= 1 ? Math.min(1, s.life * 2) : 1;
      if (s.gold) drawStar(g, s.x, s.y, s.r * 1.45, COLORS.orange, -s.spin * 0.5);
      drawStar(g, s.x, s.y, s.r, s.gold ? COLORS.yellow : '#FFF3B0', s.spin * 0.4);
    }
    g.globalAlpha = 1;
  }

  finish(extra) { super.finish({ ...extra, details: [['최고 콤보', this.bestCombo]] }); }
}

const CREAM_STAR = '#FFF3B0';
