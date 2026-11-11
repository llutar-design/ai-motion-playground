import { BaseGame, fillSky, HAND_RADIUS } from './BaseGame.js';
import { rand } from '../core/constants.js';
import { drawStar, drawHand, text, roundRect, COLORS, INK, CREAM } from '../assets/art.js';

const PAD_R = 130;
const HOLD_S = 0.6;
const SYNC_S = 0.5;

export class CoopChallenge extends BaseGame {
  static meta = {
    id: 'coop', name: '둘이서 힘을 합쳐!', desc: '둘이 함께 별을 모으고 문을 열어요',
    howTo: ['각자 자기 쪽의 별을 모아요', '양쪽 버튼을 동시에 누르면 문이 열려요', '서로 부딪히지 않게 자기 자리에서 해요'],
    grade: '2~6학년', level: 2, players: [2, 1], theme: 'bright', bgm: 116, oneHand: false, tint: COLORS.teal,
  };

  static drawIcon(g, s) {
    fillSky(g, s, s, '#CFE8FF', '#FFE3C2');
    drawHand(g, s * 0.3, s * 0.56, s * 0.17, COLORS.sky, '');
    drawHand(g, s * 0.7, s * 0.56, s * 0.17, COLORS.orange, '');
    drawStar(g, s * 0.5, s * 0.22, s * 0.13, COLORS.yellow);
  }

  setup() {
    this.goal = this.d.id === 'easy' ? 3 : this.d.id === 'hard' ? 7 : 5;
    this.doors = 0;
    this.stars = [[], []];
    this.starsToDoor = 0;
    this.need = this.d.id === 'easy' ? 3 : 4;
    this.pads = null;
    this.teamHits = 0;
    this.doorAnim = 0;
    this.latch = this.motion?.mode === 'mouse' || this.settings.get('oneHand') !== 'off' ? 4 : 0;
    this.hudExtra = `문 0 / ${this.goal}`;
    for (const side of [0, 1]) for (let i = 0; i < 2; i++) this.addStar(side);
  }

  setPlayers() { /* 양쪽 구역을 손의 화면 위치로 나누므로 1인 전환 시에도 그대로 동작한다. */ }

  addStar(side) {
    const zone = side === 0 ? [140, 860] : [1060, 1780];
    this.stars[side].push({ x: rand(zone[0], zone[1]), y: rand(260, 820), r: 66 * this.d.size, spin: rand(0, 6), life: 7 * this.d.react, born: 0 });
  }

  openPads() {
    this.pads = [0, 1].map((side) => ({ side, x: side === 0 ? 560 : 1360, y: 470, on: 0, latched: 0, firstAt: null }));
    this.padTime = 0;
    this.audio.sfx('tick');
  }

  step(dt) {
    if (this.motion?.mode === 'mouse' && !this.latch) this.latch = 4;
    const hands = this.hands();
    this.doorAnim = Math.max(0, this.doorAnim - dt);
    for (const side of [0, 1]) {
      for (const s of this.stars[side]) {
        s.born = Math.min(1, s.born + dt * 3);
        s.spin += dt;
        s.life -= dt;
        if (s.life <= 0) s.gone = true;
        const hit = hands.find((h) => (h.x < this.W / 2 ? 0 : 1) === side && this.touching(h, s.x, s.y, s.r));
        if (hit && !s.gone) {
          s.gone = true;
          this.burst(s.x, s.y, COLORS.yellow, 16);
          this.award(10, s.x, s.y, { sound: 'pop' });
          this.starsToDoor += 1;
        }
      }
      this.stars[side] = this.stars[side].filter((s) => !s.gone);
      if (this.stars[side].length < 2 && this.tickTimer(`star${side}`, dt, 0.5 / this.d.spawn)) this.addStar(side);
    }
    if (!this.pads && this.starsToDoor >= this.need) { this.starsToDoor = 0; this.openPads(); }
    if (this.pads) this.stepPads(dt, hands);
  }

  stepPads(dt, hands) {
    for (const p of this.pads) {
      const touching = hands.some((h) => (h.x < this.W / 2 ? 0 : 1) === p.side && Math.hypot(h.x - p.x, h.y - p.y) <= PAD_R + HAND_RADIUS * 0.5);
      if (touching) { p.on += dt; p.latched = this.latch; if (p.firstAt === null) p.firstAt = this.elapsed; }
      else { p.latched = Math.max(0, p.latched - dt); if (p.latched <= 0) { p.on = 0; p.firstAt = null; } }
    }
    const ready = this.pads.every((p) => p.on >= HOLD_S || (this.latch && p.latched > 0 && p.on > 0));
    if (ready) this.openDoor();
  }

  openDoor() {
    const [a, b] = this.pads;
    const synced = Math.abs(a.firstAt - b.firstAt) <= SYNC_S;
    this.doors += 1;
    this.doorAnim = 1.2;
    this.pads = null;
    this.hudExtra = `문 ${this.doors} / ${this.goal}`;
    this.burst(this.W / 2, 540, COLORS.yellow, 40, 620);
    this.award(synced ? 150 : 100, this.W / 2, 400, { combo: false, sound: 'door', label: synced ? '동시에 성공!' : '문 열림!' });
    if (synced) this.teamHits += 1;
    if (this.doors >= this.goal) this.clearAt = this.elapsed + 1.2;
  }

  update(dt, motion) {
    super.update(dt, motion);
    if (this.running && !this.paused && this.clearAt && this.elapsed >= this.clearAt) this.finish({ cleared: true });
  }

  draw(g) {
    fillSky(g, this.W / 2, this.H, '#CFE8FF', '#EAF5FF');
    g.save(); g.translate(this.W / 2, 0); fillSky(g, this.W / 2, this.H, '#FFE3C2', '#FFF3E2'); g.restore();
    g.fillStyle = INK; g.fillRect(this.W / 2 - 6, 0, 12, this.H);
    text(g, '플레이어 1', this.W * 0.25, 220, 44, '#2A6FA8');
    text(g, '플레이어 2', this.W * 0.75, 220, 44, '#B55D1E');
    for (const list of this.stars) for (const s of list) {
      g.globalAlpha = s.life < 1 ? Math.max(0.3, s.life) : 1;
      drawStar(g, s.x, s.y, s.r * s.born, COLORS.yellow, s.spin * 0.4);
    }
    g.globalAlpha = 1;
    this.#drawDoor(g);
    if (this.pads) {
      for (const p of this.pads) {
        g.beginPath(); g.arc(p.x, p.y, PAD_R, 0, 7);
        g.fillStyle = p.on > 0 ? COLORS.teal : CREAM; g.fill(); g.lineWidth = 10; g.strokeStyle = INK; g.stroke();
        const prog = Math.min(1, p.on / HOLD_S);
        if (prog > 0) { g.beginPath(); g.arc(p.x, p.y, PAD_R + 22, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); g.lineWidth = 20; g.strokeStyle = COLORS.yellow; g.lineCap = 'round'; g.stroke(); }
        text(g, '함께!', p.x, p.y + 2, 66, INK);
      }
      roundRect(g, this.W / 2 - 500, 930, 1000, 96, 40); g.fillStyle = CREAM; g.fill(); g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
      text(g, '양쪽 버튼을 동시에 눌러 문을 열어요!', this.W / 2, 980, 50, INK);
    } else {
      const left = this.need - this.starsToDoor;
      text(g, `별 ${left}개 더 모으면 버튼이 나타나요`, this.W / 2, 980, 48, INK, 'center', CREAM);
    }
  }

  #drawDoor(g) {
    const open = this.doorAnim > 0 ? Math.sin((1 - this.doorAnim / 1.2) * Math.PI) : 0;
    const x = this.W / 2; const y = 760; const w = 200; const h = 280;
    roundRect(g, x - w / 2 - 14, y - h / 2 - 14, w + 28, h + 14, [100, 100, 0, 0]); g.fillStyle = INK; g.fill();
    g.save(); roundRect(g, x - w / 2, y - h / 2, w, h, [86, 86, 0, 0]); g.clip();
    g.fillStyle = '#FFF2B0'; g.fillRect(x - w / 2, y - h / 2, w, h);
    g.fillStyle = COLORS.violet;
    g.fillRect(x - w / 2 - (w / 2) * open, y - h / 2, w / 2, h);
    g.fillRect(x + (w / 2) * open, y - h / 2, w / 2, h);
    g.restore();
  }

  finish(extra) { super.finish({ ...extra, details: [['함께 연 문', `${this.doors} / ${this.goal}`], ['동시 성공', this.teamHits]] }); }
}
