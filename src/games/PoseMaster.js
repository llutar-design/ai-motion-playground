import { BaseGame, fillSky } from './BaseGame.js';
import { POSES, POSE_MASTER_SET } from '../core/PoseLibrary.js';
import { LM, SKELETON } from '../core/MotionEngine.js';
import { pick } from '../core/constants.js';
import { drawFigure, text, roundRect, COLORS, INK, CREAM, drawStar } from '../assets/art.js';

export class PoseMaster extends BaseGame {
  static meta = {
    id: 'pose', name: '포즈 마스터', desc: '화면의 포즈를 똑같이 따라 해요',
    howTo: ['화면 왼쪽 친구의 자세를 따라 해요', '그대로 잠깐 멈추면 성공이에요', '비슷할수록 별을 많이 받아요'],
    grade: '1~6학년', level: 2, players: [1], theme: 'bright', oneHand: true, tint: COLORS.teal,
  };

  static drawIcon(g, s) {
    fillSky(g, s, s, '#C9F5EA', '#EFFFFA');
    drawFigure(g, POSES.manse, s * 0.5, s * 0.46, s * 0.17, 'kid', COLORS.teal);
  }

  setup() {
    this.queue = [];
    this.result = null;
    this.next();
  }

  next() {
    if (!this.queue.length) this.queue = [...POSE_MASTER_SET].sort(() => Math.random() - 0.5);
    let id = this.queue.pop();
    if (id === this.poseId && this.queue.length) id = this.queue.pop();
    this.poseId = id;
    this.pose = POSES[id];
    this.limit = 9 * this.d.react;
    this.result = null;
    const hold = 700 / this.d.react;
    this.engine.watchPose(this.pose, { hold: Math.max(500, Math.min(1000, hold)), threshold: this.d.id === 'hard' ? 0.76 : 0.68, tolScale: this.d.tol });
  }

  step(dt, motion) {
    const p = motion.players[0];
    if (this.result) {
      this.result.time -= dt;
      if (this.result.time <= 0) this.next();
      return;
    }
    const ev = motion.events.find((e) => e.type === 'POSE_MATCH' && e.data.poseId === this.poseId);
    if (ev) { this.complete(ev.data.score); return; }
    this.limit -= dt;
    if (this.limit <= 0) {
      // 시간이 지나면 감점 없이 다음 포즈로 넘어간다.
      this.engine.clearPoseWatch();
      this.result = { stars: 0, label: '다음 포즈로!', time: 0.9 };
    }
    this.live = p;
  }

  complete(score) {
    const stars = score > 0.9 ? 3 : score > 0.8 ? 2 : 1;
    this.engine.clearPoseWatch();
    this.result = { stars, label: pick(['멋진 움직임!', '대단해!', '최고야!']), time: 1.1 };
    this.burst(this.W * 0.72, 520, COLORS.yellow, 30);
    this.award(Math.round(score * 100), this.W * 0.72, 300, { sound: 'correct' });
  }

  drawLive(g, p, cx, cy, size) {
    if (!p?.landmarks || !p.tracked) {
      text(g, '몸을 보여 주세요', cx, cy, 56, INK);
      return;
    }
    const lm = p.landmarks;
    const ox = (lm[LM.L_SHOULDER].x + lm[LM.R_SHOULDER].x) / 2;
    const oy = (lm[LM.L_SHOULDER].y + lm[LM.R_SHOULDER].y) / 2;
    const k = size / p.unit;
    const X = (i) => cx + (lm[i].x - ox) * k;
    const Y = (i) => cy - size * 0.7 + (lm[i].y - oy) * k;
    const color = p.poseScore >= 0.68 ? COLORS.teal : COLORS.sky;
    for (const pass of [[30, INK], [18, color]]) {
      g.lineWidth = pass[0]; g.strokeStyle = pass[1]; g.lineCap = 'round';
      for (const [a, b] of SKELETON) {
        if (lm[a].v < 0.4 || lm[b].v < 0.4) continue;
        g.beginPath(); g.moveTo(X(a), Y(a)); g.lineTo(X(b), Y(b)); g.stroke();
      }
    }
    if (lm[LM.NOSE].v > 0.4) { g.beginPath(); g.arc(X(LM.NOSE), Y(LM.NOSE), size * 0.42, 0, 7); g.fillStyle = color; g.fill(); g.lineWidth = 7; g.strokeStyle = INK; g.stroke(); }
  }

  draw(g) {
    fillSky(g, this.W, this.H, '#B8F0E2', '#F0FFF9');
    roundRect(g, 90, 220, 800, 790, 44); g.fillStyle = CREAM; g.fill(); g.lineWidth = 8; g.strokeStyle = INK; g.stroke();
    roundRect(g, 1030, 220, 800, 790, 44); g.fillStyle = '#E4F6FF'; g.fill(); g.lineWidth = 8; g.strokeStyle = INK; g.stroke();
    text(g, '따라 해 보세요', 490, 280, 44, INK);
    text(g, '나의 자세', 1430, 280, 44, INK);
    if (this.pose) {
      drawFigure(g, this.pose, 490, 530, 150, 'kid', COLORS.coral);
      text(g, this.pose.name, 490, 945, 76, INK);
    }
    g.save();
    roundRect(g, 1030, 310, 800, 700, [0, 0, 44, 44]); g.clip();
    this.drawLive(g, this.motion?.players[0], 1430, 640, 115);
    g.restore();

    const p = this.motion?.players[0];
    const prog = p?.poseProgress ?? 0;
    if (prog > 0 && !this.result) {
      g.beginPath(); g.arc(1430, 640, 320, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
      g.lineWidth = 26; g.lineCap = 'round'; g.strokeStyle = COLORS.teal; g.stroke();
    }
    if (this.motion?.mode === 'mouse' && !this.result) text(g, '마우스를 누르고 있으면 성공!', 1430, 950, 44, INK);
    if (this.result) {
      roundRect(g, 1130, 400, 600, 340, 40); g.fillStyle = 'rgba(255,248,231,.94)'; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
      for (let i = 0; i < 3; i++) drawStar(g, 1290 + i * 140, 500, 62, i < this.result.stars ? COLORS.yellow : '#D8D8E6');
      text(g, this.result.label, 1430, 650, 88, INK);
    }
  }

  finish(extra) { super.finish({ ...extra, details: [['성공한 포즈', this.success]] }); }
}
