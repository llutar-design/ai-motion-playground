import { GestureRecognizer } from '@mediapipe/tasks-vision';
import { loadVision, createWithFallback } from './PoseTracker.js';

const BASE = import.meta.env.BASE_URL;

export const GESTURE_LABELS = {
  Closed_Fist: '주먹', Open_Palm: '손바닥', Pointing_Up: '검지 위로', Thumb_Up: '엄지 척',
  Thumb_Down: '엄지 아래', Victory: '브이', ILoveYou: '사랑해',
};

/** MediaPipe 제스처를 낮은 빈도로 인식한다. 주먹·엄지 척은 엔진에서 GESTURE_SELECT가 된다. */
export class GestureMapper {
  constructor() { this.task = null; this.lastTs = 0; this.numHands = 2; }

  async load(preferCPU = false) {
    const vision = await loadVision();
    this.close();
    const { task } = await createWithFallback((d) => GestureRecognizer.createFromOptions(vision, {
      baseOptions: { modelAssetPath: `${BASE}models/gesture_recognizer.task`, delegate: d },
      runningMode: 'VIDEO',
      numHands: this.numHands,
    }), preferCPU);
    this.task = task;
  }

  async setNumHands(n) {
    if (n === this.numHands) return;
    this.numHands = n;
    await this.task?.setOptions({ numHands: n });
  }

  detect(source, ts) {
    this.lastTs = Math.max(this.lastTs + 1, Math.round(ts));
    const r = this.task.recognizeForVideo(source, this.lastTs);
    const out = [];
    r.gestures.forEach((list, i) => {
      const top = list[0];
      if (!top || top.categoryName === 'None') return;
      const lms = r.landmarks[i];
      const point = [0, 5, 17].reduce((s, j) => ({ x: s.x + lms[j].x / 3, y: s.y + lms[j].y / 3 }), { x: 0, y: 0 });
      out.push({ name: top.categoryName, score: top.score, point });
    });
    return out;
  }

  close() { this.task?.close(); this.task = null; }
}
