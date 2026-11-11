// 게임 시작 전 준비 단계. 인식 상태만 확인하고 큰 동작은 요구하지 않는다.
import { LM } from './MotionEngine.js';
import { STAGE_W, STAGE_H } from './constants.js';
import { drawCameraView, roundRect, text, drawCheck } from '../assets/art.js';

export const STEP_DEFS = [
  { id: 'camera', label: '카메라 연결', say: '카메라를 확인하고 있어요' },
  { id: 'person', label: '사람 찾기', say: '카메라 앞에 서 주세요' },
  { id: 'frame', label: '몸이 화면 안에', say: '머리부터 허리까지 화면에 보이게 해 주세요' },
  { id: 'hands', label: '양손 들기', say: '양손을 번쩍 들어 보세요' },
  { id: 'move', label: '좌우 움직이기', say: '천천히 왼쪽으로 움직여 보세요' },
  { id: 'baseline', label: '기본 자세', say: '편안하게 서서 잠깐 가만히 있어 주세요' },
  { id: 'countdown', label: '준비', say: '곧 시작해요' },
];

export class CalibrationManager {
  /**
   * @param opts { engine, camera, audio, seated, oneHand, players, quick, onDone }
   * quick: 이미 준비한 경우 손 들기와 좌우 테스트를 생략한다.
   */
  constructor(opts) {
    Object.assign(this, opts);
    this.index = 0;
    this.stepTime = 0;
    this.hold = 0;
    this.moveStage = 0;
    this.count = 3;
    this.done = false;
    this.skipped = new Set();
    if (this.quick) { this.skipped.add('hands'); this.skipped.add('move'); }
    if (this.players > 1) this.skipped.add('move'); // 2인 모드에서는 서로 부딪히지 않도록 이동을 요구하지 않는다.
  }

  get step() { return STEP_DEFS[this.index]; }
  get canSkip() { return this.stepTime > 8 && ['hands', 'move'].includes(this.step?.id); }
  get waitingSecond() { return this.players > 1 && this.stepTime > 8 && ['person', 'frame'].includes(this.step?.id); }

  message(motion) {
    const id = this.step.id;
    if (id === 'person' && this.players > 1) return `두 사람이 양쪽에 나란히 서 주세요 (${motion.players.filter((p) => p.tracked).length}/2명)`;
    if (id === 'frame' && this.seated) return '머리와 어깨가 화면에 보이게 앉아 주세요';
    if (id === 'hands' && this.oneHand !== 'off') return '손을 번쩍 들어 보세요';
    if (id === 'hands' && this.players > 1) return '두 사람 모두 손을 번쩍 들어 보세요';
    if (id === 'move' && this.seated) return this.moveStage === 0 ? '몸을 왼쪽으로 살짝 기울여 보세요' : '이번엔 오른쪽으로 살짝 기울여 보세요';
    if (id === 'move' && this.moveStage === 1) return '이번엔 오른쪽으로 움직여 보세요';
    if (id === 'countdown') return String(this.count);
    return this.step.say;
  }

  #advance() {
    this.index += 1;
    this.stepTime = 0;
    this.hold = 0;
    this.moveStage = 0;
    while (this.step && this.skipped.has(this.step.id)) this.index += 1;
    this.audio?.sfx('tick');
    if (this.step?.id === 'move') this.engine.calibrate();
  }

  skip() {
    if (this.canSkip) { this.skipped.add(this.step.id); this.#advance(); }
  }

  /** 두 번째 사람을 찾지 못했을 때 1인으로 낮춘다. */
  downgradeToSolo() {
    this.players = 1;
    this.skipped.delete('move');
    if (this.quick) this.skipped.add('move');
    this.stepTime = 0;
  }

  update(dt, motion) {
    if (this.done) return;
    this.stepTime += dt;
    const need = motion.players;
    const allTracked = need.every((p) => p.tracked && p.landmarks);
    const passHold = (cond, seconds) => {
      this.hold = cond ? this.hold + dt : Math.max(0, this.hold - dt * 2);
      if (this.hold >= seconds) this.#advance();
    };
    switch (this.step.id) {
      case 'camera':
        passHold(this.camera ? this.camera.connected : true, 0.2);
        break;
      case 'person':
        passHold(allTracked, 0.4);
        break;
      case 'frame':
        passHold(allTracked && need.every((p) => this.#inFrame(p)), 0.4);
        break;
      case 'hands':
        passHold(allTracked && need.every((p) => {
          if (this.oneHand === 'left') return p.flags.leftUp;
          if (this.oneHand === 'right') return p.flags.rightUp;
          return p.flags.bothUp;
        }), 0.4);
        break;
      case 'move': {
        const p = need[0];
        if (this.moveStage === 0 && p.body.lane < 0) { this.moveStage = 1; this.audio?.sfx('tick'); }
        else if (this.moveStage === 1 && p.body.lane > 0) this.#advance();
        break;
      }
      case 'baseline': {
        passHold(allTracked && need.every((p) => this.#still(p)), 0.8);
        if (this.step.id !== 'baseline') {
          this.engine.calibrate();
        }
        break;
      }
      case 'countdown': {
        const remaining = 3 - Math.floor(this.stepTime);
        if (remaining !== this.count) { this.count = remaining; if (remaining > 0) this.audio?.sfx('tick'); }
        if (this.stepTime >= 3) { this.done = true; this.audio?.sfx('go'); this.onDone(); }
        break;
      }
      default:
    }
  }

  #inFrame(p) {
    const lm = p.landmarks;
    const aspect = this.camera?.aspect ?? 16 / 9;
    const inside = (i) => lm[i].x > 0 && lm[i].x < aspect && lm[i].y > 0 && lm[i].y < 1;
    const upper = lm[LM.NOSE].v > 0.4 && inside(LM.NOSE) && inside(LM.L_SHOULDER) && inside(LM.R_SHOULDER);
    if (this.seated) return upper;
    return upper && lm[LM.L_HIP].v > 0.4 && lm[LM.R_HIP].v > 0.4 && inside(LM.L_HIP) && inside(LM.R_HIP);
  }

  #still(p) {
    const { left, right } = p.hands;
    return (!left.visible || left.speed < 500) && (!right.visible || right.speed < 500);
  }

  render(g, motion) {
    drawCameraView(g, this.camera, motion, this.engine.cfg.mirror, 0, 0, STAGE_W, STAGE_H, { dim: 0.35 });

    roundRect(g, 40, 40, 420, 620, 32);
    g.fillStyle = 'rgba(255,248,231,.96)';
    g.fill();
    text(g, '카메라 준비', 250, 100, 46, '#23305E');
    const list = STEP_DEFS;
    list.forEach((s, i) => {
      const y = 170 + i * 68;
      const isDone = i < this.index;
      const skip = this.skipped.has(s.id) && !isDone;
      const current = i === this.index;
      if (current) { roundRect(g, 60, y - 30, 380, 60, 20); g.fillStyle = '#FFD84D'; g.fill(); }
      g.save();
      drawCheck(g, 96, y, 18, isDone || skip, current);
      g.restore();
      text(g, `${i + 1}. ${s.label}`, 130, y + 2, 32, skip ? '#8A93B5' : '#23305E', 'left');
    });

    if (this.step) {
      const msg = this.message(motion);
      const isCount = this.step.id === 'countdown';
      if (isCount) {
        g.beginPath(); g.arc(STAGE_W / 2, STAGE_H / 2, 170, 0, Math.PI * 2);
        g.fillStyle = '#FFD84D'; g.fill(); g.lineWidth = 10; g.strokeStyle = '#23305E'; g.stroke();
        text(g, msg, STAGE_W / 2, STAGE_H / 2 + 4, 200, '#23305E');
      } else {
        roundRect(g, 500, 40, 1380, 130, 36);
        g.fillStyle = '#23305E'; g.fill();
        text(g, msg, 1190, 106, 56, '#FFF8E7');
        if (this.step.id === 'move') this.#drawArrow(g);
        if (this.hold > 0 && this.step.id !== 'move') {
          roundRect(g, 620, 190, 1140, 22, 11); g.fillStyle = 'rgba(255,255,255,.6)'; g.fill();
          roundRect(g, 620, 190, Math.min(1140, 1140 * (this.hold / 0.8)), 22, 11); g.fillStyle = '#3FD0B2'; g.fill();
        }
      }
    }
  }

  #drawArrow(g) {
    const dir = this.moveStage === 0 ? -1 : 1;
    const x = 1190 + dir * 360 + Math.sin(this.stepTime * 5) * 20 * dir;
    const y = 560;
    g.beginPath();
    g.moveTo(x + dir * 130, y);
    g.lineTo(x, y - 110); g.lineTo(x, y - 50); g.lineTo(x - dir * 140, y - 50);
    g.lineTo(x - dir * 140, y + 50); g.lineTo(x, y + 50); g.lineTo(x, y + 110);
    g.closePath();
    g.fillStyle = '#FFD84D'; g.fill(); g.lineWidth = 10; g.strokeStyle = '#23305E'; g.stroke();
  }
}
