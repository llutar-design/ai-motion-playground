import { BaseGame, fillSky } from './BaseGame.js';
import { rand, pick } from '../core/constants.js';
import { drawFish, drawJelly, COLORS } from '../assets/art.js';

const FISH = [COLORS.orange, COLORS.sky, COLORS.green, COLORS.pink, COLORS.coral];

export class FishCatch extends BaseGame {
  static meta = {
    id: 'fish', name: '바닷속 물고기 잡기', desc: '손으로 움직이는 물고기를 잡아요',
    howTo: ['손을 물고기에 닿게 해서 잡아요', '별이 있는 황금 물고기는 보너스예요', 'X 표시 해파리는 피해요'],
    grade: '1~4학년', level: 1, players: [1, 2], theme: 'sea', bgm: 96, oneHand: true, tint: COLORS.sky,
  };

  static drawIcon(g, s) {
    fillSky(g, s, s, '#5BC8F0', '#1E7FBF');
    drawFish(g, s * 0.52, s * 0.42, s * 0.24, COLORS.orange, 1);
    drawJelly(g, s * 0.24, s * 0.72, s * 0.12);
  }

  setup() {
    this.creatures = [];
    this.bubbles = Array.from({ length: 26 }, () => ({ x: rand(0, this.W), y: rand(0, this.H), r: rand(6, 20), v: rand(40, 110) }));
    this.weeds = Array.from({ length: 16 }, (_, i) => ({ x: 60 + i * 124 + rand(-30, 30), h: rand(90, 200), p: rand(0, 6) }));
  }

  spawn() {
    const roll = Math.random();
    const dir = Math.random() < 0.5 ? 1 : -1;
    if (roll < 0.18) {
      this.creatures.push({ kind: 'jelly', x: rand(280, this.W - 280), y: this.H + 80, r: 74 * this.d.size, vy: -rand(90, 150) * this.d.speed });
      return;
    }
    const gold = roll > 0.86;
    this.creatures.push({
      kind: gold ? 'gold' : 'fish', dir, x: dir > 0 ? -160 : this.W + 160, y: rand(240, 900), y0: 0,
      r: (gold ? 72 : rand(66, 88)) * this.d.size, vx: dir * rand(240, 360) * this.d.speed * (gold ? 1.4 : 1),
      color: gold ? COLORS.yellow : pick(FISH), phase: rand(0, 6),
    });
    const c = this.creatures[this.creatures.length - 1];
    c.y0 = c.y;
  }

  step(dt) {
    if (this.tickTimer('spawn', dt, 0.72 / this.d.spawn)) this.spawn();
    for (const b of this.bubbles) { b.y -= b.v * dt; if (b.y < -30) { b.y = this.H + 30; b.x = rand(0, this.W); } }
    const hands = this.hands();
    for (const c of this.creatures) {
      if (c.kind === 'jelly') {
        c.y += c.vy * dt;
        c.x += Math.sin(this.t * 1.5 + c.r) * 40 * dt;
        if (c.y < -160) c.gone = true;
      } else {
        c.x += c.vx * dt;
        c.y = c.y0 + Math.sin(this.t * 2.2 + c.phase) * 44;
        if ((c.dir > 0 && c.x > this.W + 180) || (c.dir < 0 && c.x < -180)) c.gone = true;
      }
      if (c.gone || c.touched) continue;
      if (hands.some((h) => this.touching(h, c.x, c.y, c.r * 0.86))) this.catch(c);
    }
    this.creatures = this.creatures.filter((c) => !c.gone);
  }

  catch(c) {
    if (c.kind === 'jelly') {
      c.touched = true; // 같은 해파리로 여러 번 감점되지 않는다.
      this.penalize(15, c.x, c.y);
      return;
    }
    c.gone = true;
    const gold = c.kind === 'gold';
    this.burst(c.x, c.y, c.color, gold ? 24 : 14);
    this.award(gold ? 50 : 10, c.x, c.y, { sound: gold ? 'gold' : 'splash', label: gold ? '황금!' : null });
  }

  draw(g) {
    fillSky(g, this.W, this.H, '#4FC3EF', '#135A9A');
    g.fillStyle = '#E8D29A';
    g.beginPath(); g.ellipse(this.W / 2, this.H + 80, 1300, 190, 0, 0, 7); g.fill();
    g.lineCap = 'round'; g.lineWidth = 22; g.strokeStyle = '#2FA36B';
    for (const w of this.weeds) {
      g.beginPath(); g.moveTo(w.x, this.H);
      g.quadraticCurveTo(w.x + Math.sin(this.t + w.p) * 50, this.H - w.h / 2, w.x + Math.sin(this.t + w.p) * 30, this.H - w.h);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.3)';
    for (const b of this.bubbles) { g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.fill(); }
    for (const c of this.creatures) {
      if (c.kind === 'jelly') {
        g.globalAlpha = c.touched ? 0.5 : 1;
        drawJelly(g, c.x, c.y, c.r, this.t);
        g.globalAlpha = 1;
      } else drawFish(g, c.x, c.y, c.r, c.color, c.dir, this.t, c.kind === 'gold');
    }
  }

  finish(extra) { super.finish({ ...extra, details: [['잡은 물고기', this.success], ['최고 콤보', this.bestCombo]] }); }
}
