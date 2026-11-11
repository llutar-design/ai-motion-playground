import { BaseGame, fillSky } from './BaseGame.js';
import { rand, pick } from '../core/constants.js';
import { drawBalloon, COLORS } from '../assets/art.js';

const PALETTE = [COLORS.coral, COLORS.sky, COLORS.green, COLORS.violet, COLORS.orange, COLORS.pink];

export class BalloonPop extends BaseGame {
  static meta = {
    id: 'balloon', name: '풍선 팡팡!', desc: '떠오르는 풍선을 손으로 터뜨려요',
    howTo: ['양손으로 풍선을 건드려 터뜨려요', '별이 있는 풍선은 보너스예요', '가시 달린 X 풍선은 피해요'],
    grade: '1~6학년', level: 1, players: [1, 2], theme: 'bright', oneHand: true, tint: COLORS.coral,
  };

  static drawIcon(g, s) {
    fillSky(g, s, s, '#BFE8FF', '#E9F8FF');
    drawBalloon(g, s * 0.34, s * 0.45, s * 0.17, COLORS.coral);
    drawBalloon(g, s * 0.68, s * 0.38, s * 0.15, COLORS.yellow, 'gold');
  }

  setup() {
    this.balloons = [];
    this.popped = 0;
    this.escaped = 0;
    this.hazards = 0;
  }

  spawn() {
    const roll = Math.random();
    const kind = roll < 0.12 ? 'gold' : roll < 0.28 ? 'hazard' : 'normal';
    const r = rand(70, 88) * this.d.size;
    this.balloons.push({
      x: rand(170, this.W - 170), y: this.H + r * 2.2, r, kind,
      color: kind === 'gold' ? COLORS.yellow : pick(PALETTE),
      vy: rand(210, 300) * this.d.speed * (kind === 'gold' ? 1.35 : 1),
      sway: rand(0, 6.28),
    });
  }

  step(dt) {
    if (this.tickTimer('spawn', dt, 0.8 / this.d.spawn)) this.spawn();
    const hands = this.hands();
    for (const b of this.balloons) {
      b.y -= b.vy * dt;
      b.x += Math.sin(this.t * 1.6 + b.sway) * 26 * dt;
      // 아직 화면 아래에 있는 풍선은 내린 손에 터지지 않는다.
      if (b.y > this.H - 40) continue;
      const hit = hands.find((h) => this.touching(h, b.x, b.y, b.r));
      if (hit) { this.pop(b); }
    }
    for (const b of this.balloons) {
      if (!b.gone && b.y < -b.r * 2.4) { b.gone = true; if (b.kind !== 'hazard') this.escaped += 1; }
    }
    this.balloons = this.balloons.filter((b) => !b.gone);
  }

  pop(b) {
    b.gone = true; // 같은 풍선은 단 한 번만 터진다.
    if (b.kind === 'hazard') {
      this.hazards += 1;
      this.burst(b.x, b.y, '#6D6A86', 12);
      this.penalize(15, b.x, b.y);
      return;
    }
    this.popped += 1;
    const gold = b.kind === 'gold';
    this.burst(b.x, b.y, b.color, gold ? 26 : 16);
    this.award(gold ? 50 : 10, b.x, b.y, { sound: gold ? 'gold' : 'pop', label: gold ? '황금!' : null });
  }

  draw(g) {
    fillSky(g, this.W, this.H, '#8FD8FF', '#E9F8FF');
    g.fillStyle = 'rgba(255,255,255,.75)';
    for (const [x, y, r] of [[320, 240, 70], [410, 215, 95], [510, 250, 62], [1380, 320, 62], [1480, 285, 90], [1590, 330, 58]]) {
      g.beginPath(); g.arc(x + Math.sin(this.t / 5) * 30, y, r, 0, 7); g.fill();
    }
    for (const b of this.balloons) drawBalloon(g, b.x, b.y, b.r, b.color, b.kind, this.t);
  }

  finish(extra) {
    const total = this.popped + this.escaped + this.hazards;
    const accuracy = total ? Math.round((this.popped / total) * 100) : 0;
    super.finish({ ...extra, details: [['최고 콤보', this.bestCombo], ['정확도', `${accuracy}%`]] });
  }
}
