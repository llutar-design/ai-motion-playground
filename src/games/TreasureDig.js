import { BaseGame } from './BaseGame.js';
import { TREASURE_THEMES } from '../data/treasureThemes.js';
import { shuffle } from '../data/mathQuestions.js';
import { rand } from '../core/constants.js';
import { drawArtifact, text, roundRect, COLORS, INK, CREAM } from '../assets/art.js';

const SLOTS = [[420, 340], [960, 340], [1500, 340], [420, 740], [960, 740], [1500, 740]];
const CELL = 20;
const ITEM_R = 118;
const BOX = ITEM_R + 30;
const SCALE = 0.5;

export class TreasureDig extends BaseGame {
  static meta = {
    id: 'treasure', name: '보물 발굴 탐험대', desc: '손으로 흙을 쓸어 숨은 보물을 찾아요',
    howTo: ['손을 움직여 흙을 쓸어 내요', '보물이 드러나면 점수를 얻어요', '보물을 모두 찾으면 성공이에요'],
    grade: '1~6학년', level: 1, players: [1, 2], theme: 'dig', bgm: 92, oneHand: true, tint: COLORS.orange,
    options: [{ key: 'theme', label: '주제', choices: TREASURE_THEMES.map((t) => ({ v: t.id, l: t.name })) }],
  };

  static drawIcon(g, s) {
    g.fillStyle = '#E2B97F'; g.fillRect(0, 0, s, s);
    drawArtifact(g, 'crown', s * 0.5, s * 0.5, s * 0.26);
    g.fillStyle = '#9A6B3C';
    for (const [x, y, r] of [[0.08, 0.12, 0.3], [0.96, 0.96, 0.34], [0.1, 0.98, 0.22]]) { g.beginPath(); g.arc(s * x, s * y, s * r, 0, 7); g.fill(); }
  }

  setup() {
    const theme = TREASURE_THEMES.find((t) => t.id === this.options.theme) ?? TREASURE_THEMES[0];
    const n = this.d.id === 'easy' ? 3 : this.d.id === 'hard' ? 6 : 4;
    const slots = shuffle(SLOTS).slice(0, n);
    const items = shuffle(theme.items).slice(0, n);
    const side = (BOX * 2) / CELL;
    this.items = items.map((item, i) => ({ ...item, x: slots[i][0], y: slots[i][1], cells: new Uint8Array(side * side), side, cleared: 0, found: false }));
    this.needed = this.d.id === 'easy' ? 0.6 : 0.72;
    this.radius = 64 * this.d.size;
    this.found = 0;
    this.banner = null;
    this.hudExtra = `보물 0 / ${n}`;
    this.dirt = document.createElement('canvas');
    this.dirt.width = this.W * SCALE;
    this.dirt.height = this.H * SCALE;
    this.dirtG = this.dirt.getContext('2d');
    this.#paintDirt();
  }

  #paintDirt() {
    const g = this.dirtG;
    g.fillStyle = '#9A6B3C';
    g.fillRect(0, 0, this.dirt.width, this.dirt.height);
    const tones = ['#8A5E33', '#AB7B48', '#7C5329', '#B98A56'];
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = tones[i % tones.length];
      g.beginPath(); g.arc(rand(0, this.dirt.width), rand(0, this.dirt.height), rand(2, 15), 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'destination-out';
    g.lineCap = 'round';
  }

  #erase(hand) {
    const g = this.dirtG;
    g.lineWidth = this.radius * 2 * SCALE;
    g.beginPath(); g.moveTo(hand.px * SCALE, hand.py * SCALE); g.lineTo(hand.x * SCALE, hand.y * SCALE + 0.01); g.stroke();
    const len = Math.hypot(hand.x - hand.px, hand.y - hand.py);
    const steps = Math.max(1, Math.ceil(len / CELL));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.#markCells(hand.px + (hand.x - hand.px) * t, hand.py + (hand.y - hand.py) * t);
    }
  }

  #markCells(x, y) {
    const r2 = this.radius * this.radius;
    for (const item of this.items) {
      if (item.found) continue;
      if (Math.abs(x - item.x) > BOX + this.radius || Math.abs(y - item.y) > BOX + this.radius) continue;
      for (let j = 0; j < item.side; j++) {
        for (let i = 0; i < item.side; i++) {
          const idx = j * item.side + i;
          if (item.cells[idx]) continue;
          const cx = item.x - BOX + (i + 0.5) * CELL;
          const cy = item.y - BOX + (j + 0.5) * CELL;
          if ((cx - x) ** 2 + (cy - y) ** 2 <= r2) { item.cells[idx] = 1; item.cleared += 1; }
        }
      }
      if (item.cleared / item.cells.length >= this.needed) this.discover(item);
    }
  }

  discover(item) {
    item.found = true;
    this.found += 1;
    this.hudExtra = `보물 ${this.found} / ${this.items.length}`;
    this.burst(item.x, item.y, COLORS.yellow, 34, 560);
    this.award(200, item.x, item.y - 120, { combo: false, sound: 'found' });
    // 발견한 보물은 남은 흙까지 깨끗하게 치운다.
    const g = this.dirtG;
    g.fillRect((item.x - BOX) * SCALE, (item.y - BOX) * SCALE, BOX * 2 * SCALE, BOX * 2 * SCALE);
    this.banner = { item, time: 2.6 };
    if (this.found === this.items.length) this.clearAt = this.elapsed + 1.6;
  }

  step(dt) {
    for (const h of this.hands()) {
      if (h.px !== h.x || h.py !== h.y) this.#erase(h);
    }
    if (this.banner) { this.banner.time -= dt; if (this.banner.time <= 0) this.banner = null; }
    if (this.clearAt && this.elapsed >= this.clearAt) {
      this.score += Math.round(this.timeLeft) * 5 * this.settings.get('scoreMultiplier');
      this.finish({ cleared: true });
    }
  }

  draw(g) {
    g.fillStyle = '#E2B97F';
    g.fillRect(0, 0, this.W, this.H);
    for (const item of this.items) {
      g.beginPath(); g.arc(item.x, item.y + 8, ITEM_R * 1.1, 0, 7); g.fillStyle = '#CFA268'; g.fill();
      drawArtifact(g, item.kind, item.x, item.y, ITEM_R * 0.92);
    }
    g.drawImage(this.dirt, 0, 0, this.W, this.H);
    for (const item of this.items) {
      if (!item.found) continue;
      text(g, item.name, item.x, item.y + ITEM_R + 40, 46, INK, 'center', CREAM);
    }
    if (this.banner) {
      const w = 1160;
      roundRect(g, this.W / 2 - w / 2, 930, w, 110, 40); g.fillStyle = CREAM; g.fill(); g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
      text(g, `${this.banner.item.name}: ${this.banner.item.fact}`, this.W / 2, 986, 46, INK);
    }
  }

  onDispose() { if (this.dirt) { this.dirt.width = 0; this.dirt = null; } }

  finish(extra) { super.finish({ ...extra, success: this.found, details: [['찾은 보물', `${this.found} / ${this.items.length}`]] }); }
}
