import { BaseGame, fillSky } from './BaseGame.js';
import { rand } from '../core/constants.js';
import { drawOrb, drawShield, COLORS } from '../assets/art.js';

export class MagicShield extends BaseGame {
  static meta = {
    id: 'shield', name: '마법 방패 수비대', desc: '양손의 방패로 에너지 공을 막아요',
    howTo: ['양손을 움직이면 마법 방패도 따라와요', '위에서 떨어지는 공을 막아요', '별 모양 공은 보너스예요'],
    grade: '1~6학년', level: 2, players: [1, 2], theme: 'magic', bgm: 118, oneHand: true, tint: COLORS.violet,
  };

  static drawIcon(g, s) {
    fillSky(g, s, s, '#3B2C85', '#7A5CD6');
    drawOrb(g, s * 0.74, s * 0.26, s * 0.12, COLORS.pink);
    drawShield(g, s * 0.42, s * 0.56, s * 0.28, COLORS.sky);
  }

  setup() {
    this.balls = [];
    this.maxMiss = this.d.id === 'easy' ? 14 : this.d.id === 'hard' ? 6 : 10;
    this.missLeft = this.maxMiss;
    this.shieldR = 112 * this.d.size;
    this.hudExtra = `수정 ${this.missLeft}개`;
  }

  spawn() {
    const gold = Math.random() < 0.14;
    const x = rand(180, this.W - 180);
    const tx = rand(250, this.W - 250);
    const speed = rand(370, 480) * this.d.speed;
    const len = Math.hypot(tx - x, this.H);
    this.balls.push({ x, y: -60, vx: ((tx - x) / len) * speed, vy: (this.H / len) * speed, r: 42 * this.d.size, gold, color: Math.random() < 0.5 ? COLORS.pink : COLORS.sky });
  }

  step(dt) {
    if (this.tickTimer('spawn', dt, 0.9 / this.d.spawn)) this.spawn();
    const hands = this.hands();
    for (const b of this.balls) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      const hit = hands.find((h) => this.touching(h, b.x, b.y, b.r, this.shieldR * 0.85));
      if (hit) { this.block(b); continue; }
      if (b.y > this.H + 60) {
        b.gone = true;
        if (!b.gold) this.leak();
      }
    }
    this.balls = this.balls.filter((b) => !b.gone);
  }

  block(b) {
    b.gone = true;
    this.burst(b.x, b.y, b.gold ? COLORS.yellow : b.color, 18);
    this.award(b.gold ? 40 : 10, b.x, b.y, { sound: b.gold ? 'gold' : 'block' });
  }

  leak() {
    this.missLeft -= 1;
    this.combo = 0;
    this.hudExtra = `수정 ${this.missLeft}개`;
    this.audio.sfx('soft');
    if (this.missLeft <= 0) this.finish();
  }

  draw(g) {
    fillSky(g, this.W, this.H, '#2B2070', '#6B50C7');
    g.fillStyle = '#4A3AA0';
    g.beginPath(); g.ellipse(this.W / 2, this.H + 80, 1200, 210, 0, 0, 7); g.fill();
    for (const b of this.balls) drawOrb(g, b.x, b.y, b.r, b.color, this.t, b.gold);
  }

  drawCursor(g, hand, color, alpha) { drawShield(g, hand.x, hand.y, this.shieldR, color, alpha); }

  finish(extra) { super.finish({ ...extra, details: [['막은 공', this.success], ['남은 수정', Math.max(0, this.missLeft)]] }); }
}
