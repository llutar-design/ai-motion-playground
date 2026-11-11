import { BaseGame, fillSky } from './BaseGame.js';
import { lerp, rand } from '../core/constants.js';
import { drawRock, drawStar, drawRunner, COLORS, INK, text } from '../assets/art.js';

const PLAYER_Z = 0.92;

export class DodgeRunner extends BaseGame {
  static meta = {
    id: 'dodge', name: '좌우로 슝슝!', desc: '몸을 좌우로 옮겨 장애물을 피해요',
    howTo: ['몸을 왼쪽·오른쪽으로 옮기면 캐릭터도 움직여요', '바위를 피하고 별을 모아요', '뛰거나 점프하지 않아도 돼요'],
    grade: '1~6학년', level: 2, players: [1], theme: 'bright', bgm: 128, oneHand: true, tint: COLORS.sky,
  };

  static drawIcon(g, s) {
    fillSky(g, s, s, '#9FE0FF', '#CFF3B4');
    drawRock(g, s * 0.26, s * 0.38, s * 0.14);
    drawStar(g, s * 0.76, s * 0.34, s * 0.12, COLORS.yellow);
    drawRunner(g, s * 0.5, s * 0.74, s * 0.2);
  }

  setup() {
    this.lives = this.d.id === 'easy' ? 5 : this.d.id === 'hard' ? 3 : 4;
    this.objects = [];
    this.lane = 0;
    this.visualLane = 0;
    this.invuln = 0;
    this.dodged = 0;
    this.hudExtra = `남은 생명 ${this.lives}`;
  }

  spawnRow() {
    const lanes = [-1, 0, 1].sort(() => Math.random() - 0.5);
    const blockers = this.d.id === 'hard' && Math.random() < 0.45 ? 2 : 1;
    for (let i = 0; i < blockers; i++) this.objects.push({ lane: lanes[i], z: 0, kind: 'rock' });
    if (Math.random() < 0.6) this.objects.push({ lane: lanes[2], z: rand(-0.12, 0), kind: 'star' });
  }

  posOf(lane, z) {
    const k = Math.max(0, z) ** 1.5;
    return { x: this.W / 2 + lane * lerp(90, 470, k), y: lerp(220, 980, k), scale: lerp(0.28, 1.15, k) };
  }

  step(dt, motion) {
    this.lane = motion.players[0].body.lane;
    this.visualLane = lerp(this.visualLane, this.lane, 1 - Math.exp(-dt * 14));
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.tickTimer('spawn', dt, 1.15 / this.d.spawn)) this.spawnRow();
    const speed = 0.42 * this.d.speed;
    const tracked = motion.players[0].tracked;
    for (const o of this.objects) {
      const before = o.z;
      o.z += speed * dt;
      if (before < PLAYER_Z && o.z >= PLAYER_Z) {
        const sameLane = o.lane === this.lane;
        if (o.kind === 'star' && sameLane && tracked) {
          o.gone = true;
          const p = this.posOf(o.lane, o.z);
          this.burst(p.x, p.y - 80, COLORS.yellow, 16);
          this.award(25, p.x, p.y - 140, { sound: 'gold' });
        } else if (o.kind === 'rock') {
          if (sameLane && tracked && this.invuln <= 0) this.hit(o);
          else if (!sameLane) { this.dodged += 1; this.award(5, this.W / 2, 800, { combo: false }); }
        }
      }
      if (o.z > 1.15) o.gone = true;
    }
    this.objects = this.objects.filter((o) => !o.gone);
  }

  hit(o) {
    this.lives -= 1;
    this.invuln = 1.2;
    this.hudExtra = `남은 생명 ${this.lives}`;
    const p = this.posOf(o.lane, o.z);
    this.penalize(0, p.x, p.y - 200, '쿵!');
    this.burst(p.x, p.y - 60, '#8E8BA6', 14);
    if (this.lives <= 0) this.finish();
  }

  draw(g) {
    fillSky(g, this.W, 240, '#8FD8FF', '#D9F4FF');
    g.fillStyle = '#A8E08A';
    g.fillRect(0, 220, this.W, this.H);
    g.beginPath();
    g.moveTo(this.W / 2 - 150, 220); g.lineTo(this.W / 2 + 150, 220); g.lineTo(this.W / 2 + 900, this.H); g.lineTo(this.W / 2 - 900, this.H); g.closePath();
    g.fillStyle = '#F3D9A8'; g.fill();
    g.lineWidth = 8; g.strokeStyle = INK; g.stroke();
    g.setLineDash([46, 40]);
    g.lineDashOffset = -this.t * 340;
    g.lineWidth = 7; g.strokeStyle = 'rgba(255,255,255,.9)';
    for (const dir of [-1, 1]) {
      g.beginPath(); g.moveTo(this.W / 2 + dir * 50, 220); g.lineTo(this.W / 2 + dir * 300, this.H); g.stroke();
    }
    g.setLineDash([]);
    const sorted = [...this.objects].sort((a, b) => a.z - b.z);
    for (const o of sorted) {
      if (o.z < 0) continue;
      const p = this.posOf(o.lane, o.z);
      if (o.kind === 'rock') drawRock(g, p.x, p.y - 95 * p.scale, 115 * p.scale);
      else drawStar(g, p.x, p.y - 130 * p.scale, 72 * p.scale, COLORS.yellow, this.t);
    }
    const p = this.posOf(this.visualLane, PLAYER_Z);
    drawRunner(g, p.x, p.y - 80, 88, this.t, this.invuln > 0);
    if (this.motion?.mode !== 'mouse' && this.elapsed < 4) text(g, '몸을 옮겨서 피해요!', this.W / 2, 320, 64, INK, 'center', '#FFF8E7');
  }

  finish(extra) { super.finish({ ...extra, details: [['피한 장애물', this.dodged], ['남은 생명', Math.max(0, this.lives)]] }); }
}
