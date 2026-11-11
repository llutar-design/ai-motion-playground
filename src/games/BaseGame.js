// 모든 게임의 공통 기반. 공통 인터페이스 init/start/update/render/pause/resume/dispose를 구현한다.
// 게임은 setup / step / draw만 작성하면 점수, 콤보, 타이머, 효과, HUD를 그대로 쓴다.
import { STAGE_W, STAGE_H, segmentDist2, rand } from '../core/constants.js';
import { drawHand, text, roundRect, COLORS, INK, CREAM } from '../assets/art.js';

export const HAND_RADIUS = 46;
const MAX_FX = 180;

export class BaseGame {
  static meta = {};

  init(context) {
    const { finish, ...rest } = context;
    Object.assign(this, rest);
    this.finishCb = finish;
    this.W = STAGE_W;
    this.H = STAGE_H;
    this.d = context.difficulty;
    this.meta = this.constructor.meta;
    this.timed = true;
    this.timeLeft = context.timeLimit;
    this.elapsed = 0;
    this.t = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;
    this.success = 0;
    this.hudCenter = '';
    this.hudExtra = '';
    this.best = this.scores.best(this.meta.id);
    this.particles = [];
    this.floats = [];
    this.timers = {};
    this.running = false;
    this.paused = false;
    this.finished = false;
    this.large = this.settings.get('largeText');
    this.speedScale = this.settings.get('gameSpeed');
  }

  start() {
    this.running = true;
    this.setup();
    if (!this.meta.noBgm) this.audio.startBgm(this.meta.theme, this.meta.bgm ?? 112);
  }

  update(dt, motion) {
    if (!this.running || this.paused || this.finished) return;
    this.elapsed += dt;
    this.motion = motion;
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    this.#updateFx(dt);
    if (this.timed) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.finish(); return; }
    }
    const scaled = dt * this.speedScale;
    this.t += scaled;
    this.step(scaled, motion);
  }

  render(g) {
    this.draw(g);
    this.#drawFx(g);
    if (this.motion) this.#drawCursors(g);
    this.drawHud(g);
  }

  pause() { this.paused = true; this.onPause?.(); }
  resume() { this.paused = false; this.onResume?.(); }

  dispose() {
    this.running = false;
    this.finished = true;
    this.onDispose?.();
    this.particles = []; this.floats = [];
    this.audio.stopAll();
    this.engine.clearTargets();
    this.engine.clearPoseWatch();
  }

  finish(extra = {}) {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.finishCb({ score: Math.round(this.score), success: this.success, playTime: Math.round(this.elapsed), cleared: false, bestCombo: this.bestCombo, ...extra });
  }

  // ───── 게임에서 쓰는 도우미 ─────

  /** 지금 점수를 낼 수 있는 손만 돌려준다. 추적이 끊긴 손은 포함되지 않는다. */
  hands() { return this.engine.allHands().filter((h) => h.active); }

  /** 이번 프레임의 손 이동 선분이 원에 닿았는지 검사한다. */
  touching(hand, x, y, r, handR = HAND_RADIUS) {
    const reach = r + handR;
    return segmentDist2(hand.px, hand.py, hand.x, hand.y, x, y) <= reach * reach;
  }

  /** 시간 누적 타이머. interval마다 true를 돌려준다. */
  tickTimer(name, dt, interval) {
    this.timers[name] = (this.timers[name] ?? 0) + dt;
    if (this.timers[name] >= interval) { this.timers[name] -= interval; return true; }
    return false;
  }

  award(points, x, y, { combo = true, color = COLORS.yellow, label = null, sound = null } = {}) {
    if (combo) {
      this.combo += 1;
      this.comboTimer = 2.5 * this.d.react;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
    }
    const mult = (combo ? 1 + Math.min(this.combo, 10) * 0.1 : 1) * this.d.bonus * this.settings.get('scoreMultiplier');
    const gained = Math.round(points * mult);
    this.score += gained;
    this.success += 1;
    this.floatText(x, y, label ? `${label} +${gained}` : `+${gained}`, color);
    if (sound) this.audio.sfx(sound);
    return gained;
  }

  /** 감점은 작고 부드럽게 처리하며 점수는 0 아래로 내려가지 않는다. */
  penalize(points, x, y, label = '앗!') {
    this.score = Math.max(0, this.score - points);
    this.combo = 0;
    this.floatText(x, y, label, CREAM);
    this.audio.sfx('soft');
  }

  floatText(x, y, str, color = COLORS.yellow, size = 54) {
    this.floats.push({ x, y, str, color, size, life: 1 });
    if (this.floats.length > 24) this.floats.shift();
  }

  burst(x, y, color, n = 14, speed = 420) {
    for (let i = 0; i < n && this.particles.length < MAX_FX; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(speed * 0.3, speed);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rand(6, 16), color, life: 1, decay: rand(1.2, 2.2) });
    }
  }

  #updateFx(dt) {
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.life -= p.decay * dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floats) { f.y -= 110 * dt; f.life -= dt * 1.1; }
    this.floats = this.floats.filter((f) => f.life > 0);
  }

  #drawFx(g) {
    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, p.life);
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fillStyle = p.color; g.fill();
    }
    g.globalAlpha = 1;
    for (const f of this.floats) {
      g.globalAlpha = Math.min(1, f.life * 2);
      text(g, f.str, f.x, f.y, f.size * (this.large ? 1.25 : 1), f.color, 'center', INK);
    }
    g.globalAlpha = 1;
  }

  #drawCursors(g) {
    const tones = [COLORS.sky, COLORS.orange];
    for (const h of this.engine.allHands()) {
      if (!h.visible || h.resting) continue;
      this.drawCursor(g, h, tones[h.playerId], h.active ? 1 : 0.4);
    }
  }

  drawCursor(g, hand, color, alpha) {
    const label = hand.source === 'mouse' ? '' : hand.id === 'left' ? '왼' : '오';
    drawHand(g, hand.x, hand.y, HAND_RADIUS, color, label, alpha);
  }

  chip(g, x, y, w, h, label, value, fill = CREAM) {
    roundRect(g, x, y, w, h, 24);
    g.fillStyle = fill; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
    const k = this.large ? 1.2 : 1;
    text(g, label, x + 26, y + h / 2 + 2, 28 * k, INK, 'left');
    text(g, String(value), x + w - 26, y + h / 2 + 2, 46 * k, INK, 'right');
  }

  drawHud(g) {
    this.chip(g, 28, 24, 340, 84, '점수', Math.round(this.score));
    if (this.combo >= 2) this.chip(g, 28, 120, 250, 72, '콤보', this.combo, COLORS.yellow);
    if (this.timed) {
      const w = 420; const x = this.W / 2 - w / 2;
      roundRect(g, x, 24, w, 84, 42); g.fillStyle = CREAM; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
      const frac = Math.max(0, this.timeLeft / this.timeLimit);
      if (frac > 0) {
        roundRect(g, x + 10, 34, Math.max(64, (w - 20) * frac), 64, 32);
        g.fillStyle = frac > 0.25 ? COLORS.teal : COLORS.orange; g.fill();
      }
      text(g, `${Math.ceil(this.timeLeft)}초`, this.W / 2, 68, this.large ? 58 : 50, INK);
    } else if (this.hudCenter) {
      const w = 520; const x = this.W / 2 - w / 2;
      roundRect(g, x, 24, w, 84, 42); g.fillStyle = CREAM; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
      text(g, this.hudCenter, this.W / 2, 68, this.large ? 54 : 46, INK);
    }
    this.chip(g, this.W - 490, 24, 340, 84, '내 최고', Math.max(this.best, Math.round(this.score)));
    if (this.hudExtra) {
      g.font = `${this.large ? 42 : 36}px Jua, sans-serif`;
      const w = g.measureText(this.hudExtra).width + 60;
      roundRect(g, this.W - 150 - w, 120, w, 66, 24);
      g.fillStyle = CREAM; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
      text(g, this.hudExtra, this.W - 150 - w / 2, 155, this.large ? 42 : 36, INK);
    }
  }

  // 하위 게임 구현
  setup() {}
  step() {}
  draw() {}
}

/** 메뉴 카드와 게임 공통 배경: 위아래 두 색의 단순한 그라디언트 */
export function fillSky(g, w, h, top, bottom) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
}
