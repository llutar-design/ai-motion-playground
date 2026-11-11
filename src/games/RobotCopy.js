import { BaseGame, fillSky } from './BaseGame.js';
import { POSES, ROBOT_SET } from '../core/PoseLibrary.js';
import { lerp, pick } from '../core/constants.js';
import { drawFigure, text, roundRect, COLORS, INK, CREAM } from '../assets/art.js';

const LEVELS = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4];
const DANCE = [POSES.both_up, POSES.arms_out, POSES.manse, POSES.robot];

export class RobotCopy extends BaseGame {
  static meta = {
    id: 'robot', name: '로봇 따라잡기', desc: '로봇이 보여 주는 자세를 따라 해요',
    howTo: ['로봇의 자세를 잘 봐요', '같은 자세로 잠깐 멈추면 성공이에요', '단계가 올라가면 자세가 늘어나요'],
    grade: '2~6학년', level: 3, players: [1], theme: 'magic', bgm: 104, oneHand: true, tint: '#8FA3C7',
  };

  static drawIcon(g, s) {
    fillSky(g, s, s, '#DCE6F7', '#F4F8FF');
    drawFigure(g, POSES.robot, s * 0.5, s * 0.46, s * 0.17, 'robot', COLORS.sky);
  }

  setup() {
    this.levelIndex = 0;
    this.shown = { L: [8, 4], R: [8, 4], lean: 0 };
    this.startLevel();
  }

  startLevel() {
    const n = LEVELS[this.levelIndex];
    const pool = ROBOT_SET.filter((id) => id !== 'stand').sort(() => Math.random() - 0.5);
    this.sequence = pool.slice(0, n).map((id) => POSES[id]);
    this.cursor = 0;
    this.phase = 'demo';
    this.phaseTime = 0;
    this.engine.clearPoseWatch();
    this.hudCenter = '';
    this.hudExtra = `${this.levelIndex + 1}단계`;
  }

  get currentPose() { return this.sequence[this.cursor]; }

  watch() {
    this.engine.watchPose(this.currentPose, { hold: 700, threshold: this.d.id === 'hard' ? 0.76 : 0.68, tolScale: this.d.tol });
    this.limit = 10 * this.d.react;
  }

  step(dt, motion) {
    this.phaseTime += dt;
    if (this.phase === 'demo') this.stepDemo();
    else if (this.phase === 'copy') this.stepCopy(dt, motion);
    else if (this.phaseTime >= 2) this.afterDance();
    this.animate(dt);
  }

  stepDemo() {
    const each = 1.3 * this.d.react;
    this.cursor = Math.min(this.sequence.length - 1, Math.floor(this.phaseTime / each));
    if (this.phaseTime >= each * this.sequence.length) {
      this.cursor = 0;
      this.phase = 'copy';
      this.phaseTime = 0;
      this.watch();
    }
  }

  stepCopy(dt, motion) {
    const ev = motion.events.find((e) => e.type === 'POSE_MATCH' && e.data.poseId === this.currentPose.id);
    if (ev) {
      this.award(Math.round(ev.data.score * 80), this.W * 0.72, 300, { sound: 'correct' });
      this.cursor += 1;
      if (this.cursor >= this.sequence.length) this.celebrate();
      else this.watch();
      return;
    }
    this.limit -= dt;
    if (this.limit <= 0) {
      // 시간이 지나면 멈추지 않고 로봇이 다시 시범을 보인다.
      this.floatText(this.W * 0.72, 300, '다시 볼까요?', CREAM);
      this.engine.clearPoseWatch();
      this.cursor = 0;
      this.phase = 'demo';
      this.phaseTime = 0;
    }
  }

  celebrate() {
    this.phase = 'dance';
    this.phaseTime = 0;
    this.engine.clearPoseWatch();
    this.audio.sfx('win');
    this.burst(this.W * 0.3, 500, COLORS.yellow, 36, 620);
    this.floatText(this.W * 0.3, 240, pick(['최고야!', '대단해!', '도전 성공!']), COLORS.yellow, 90);
  }

  afterDance() {
    this.levelIndex += 1;
    if (this.levelIndex >= LEVELS.length) { this.finish({ cleared: true }); return; }
    this.startLevel();
  }

  animate(dt) {
    const target = this.phase === 'dance' ? DANCE[Math.floor(this.phaseTime * 4) % DANCE.length] : this.currentPose;
    const a = 1 - Math.exp(-dt * 12);
    for (const side of ['L', 'R']) {
      this.shown[side] = [lerp(this.shown[side][0], target[side][0], a), lerp(this.shown[side][1], target[side][1], a)];
    }
    this.shown.lean = lerp(this.shown.lean, target.lean ?? 0, a);
  }

  draw(g) {
    fillSky(g, this.W, this.H, '#D3DFF5', '#F4F8FF');
    g.fillStyle = '#B9C6DE'; g.fillRect(0, 940, this.W, 140);
    drawFigure(g, this.shown, 580, 520, 195, 'robot', this.phase === 'dance' ? COLORS.yellow : COLORS.sky);
    roundRect(g, 1100, 230, 720, 650, 44); g.fillStyle = CREAM; g.fill(); g.lineWidth = 8; g.strokeStyle = INK; g.stroke();
    const title = this.phase === 'demo' ? '잘 보세요' : this.phase === 'copy' ? '따라 해 보세요!' : '춤추는 로봇!';
    text(g, title, 1460, 310, 66, INK);
    if (this.phase !== 'dance') text(g, this.currentPose.name, 1460, 450, 62, '#2A6FA8');
    // 자세 순서를 칸으로 보여 준다.
    const n = this.sequence.length;
    for (let i = 0; i < n; i++) {
      const x = 1460 + (i - (n - 1) / 2) * 130;
      g.beginPath(); g.arc(x, 590, 50, 0, 7);
      const passed = this.phase === 'copy' && i < this.cursor;
      g.fillStyle = passed ? COLORS.teal : i === this.cursor && this.phase !== 'dance' ? COLORS.yellow : '#E4E0D2'; g.fill();
      g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
      text(g, String(i + 1), x, 592, 50, INK);
    }
    const p = this.motion?.players[0];
    if (this.phase === 'copy' && p) {
      roundRect(g, 1190, 700, 540, 54, 27); g.fillStyle = '#E4E0D2'; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
      if (p.poseProgress > 0) { roundRect(g, 1196, 706, Math.max(40, 528 * p.poseProgress), 42, 21); g.fillStyle = COLORS.teal; g.fill(); }
      text(g, this.motion.mode === 'mouse' ? '마우스를 누르고 있어요' : '자세를 유지해요', 1460, 810, 44, INK);
    }
  }

  finish(extra) { super.finish({ ...extra, details: [['도달한 단계', Math.min(this.levelIndex + 1, LEVELS.length)], ['성공한 자세', this.success]] }); }
}
