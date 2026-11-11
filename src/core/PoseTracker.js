import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

const BASE = import.meta.env.BASE_URL;
let filesetPromise = null;

/** WASM 런타임은 로컬 자산에서 한 번만 불러와 세 모델이 공유한다. */
export function loadVision() {
  filesetPromise ??= FilesetResolver.forVisionTasks(`${BASE}wasm`).catch((err) => { filesetPromise = null; throw err; });
  return filesetPromise;
}

/** GPU로 먼저 만들고 실패하면 CPU로 대체한다. */
export async function createWithFallback(factory, preferCPU = false) {
  if (!preferCPU) {
    try { return { task: await factory('GPU'), delegate: 'GPU' }; } catch (err) { console.warn('GPU 초기화 실패, CPU로 전환합니다.', err?.message); }
  }
  return { task: await factory('CPU'), delegate: 'CPU' };
}

export class PoseTracker {
  constructor() { this.task = null; this.delegate = null; this.numPoses = 1; this.lastTs = 0; }

  async load(preferCPU = false) {
    const vision = await loadVision();
    this.close();
    const { task, delegate } = await createWithFallback((d) => PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: `${BASE}models/pose_landmarker_lite.task`, delegate: d },
      runningMode: 'VIDEO',
      numPoses: this.numPoses,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }), preferCPU);
    this.task = task;
    this.delegate = delegate;
  }

  async setNumPoses(n) {
    if (n === this.numPoses) return;
    this.numPoses = n;
    await this.task?.setOptions({ numPoses: n });
  }

  detect(source, ts) {
    this.lastTs = Math.max(this.lastTs + 1, Math.round(ts));
    return this.task.detectForVideo(source, this.lastTs).landmarks;
  }

  close() { this.task?.close(); this.task = null; }
}
