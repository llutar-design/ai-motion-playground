import { HandLandmarker } from '@mediapipe/tasks-vision';
import { loadVision, createWithFallback } from './PoseTracker.js';

const BASE = import.meta.env.BASE_URL;

/** 양손의 손가락 관절을 추적한다. 몸에서 멀면 손목 관절이 대신 쓰이므로 실패해도 게임은 동작한다. */
export class HandTracker {
  constructor() { this.task = null; this.delegate = null; this.numHands = 2; this.lastTs = 0; }

  async load(preferCPU = false) {
    const vision = await loadVision();
    this.close();
    const { task, delegate } = await createWithFallback((d) => HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: `${BASE}models/hand_landmarker.task`, delegate: d },
      runningMode: 'VIDEO',
      numHands: this.numHands,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }), preferCPU);
    this.task = task;
    this.delegate = delegate;
  }

  async setNumHands(n) {
    if (n === this.numHands) return;
    this.numHands = n;
    await this.task?.setOptions({ numHands: n });
  }

  detect(source, ts) {
    this.lastTs = Math.max(this.lastTs + 1, Math.round(ts));
    const r = this.task.detectForVideo(source, this.lastTs);
    return r.landmarks.map((landmarks, i) => ({ landmarks, score: r.handedness[i]?.[0]?.score ?? 0.8 }));
  }

  close() { this.task?.close(); this.task = null; }
}
