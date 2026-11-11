// 입력 소스(카메라 추론 / 마우스·터치 / 테스트용 모의 입력)를 MotionEngine으로 연결한다.
import { STAGE_W } from './constants.js';
import { PoseTracker } from './PoseTracker.js';
import { HandTracker } from './HandTracker.js';
import { GestureMapper } from './GestureMapper.js';

// 저성능 기기일수록 추론 입력 크기와 빈도를 낮춘다.
const TIERS = [
  { width: 640, hz: 30, aux: true },
  { width: 480, hz: 20, aux: true },
  { width: 320, hz: 15, aux: true },
  { width: 256, hz: 12, aux: false }, // 최저 단계: 손은 몸 관절의 손목 좌표로 대신한다.
];
const GESTURE_INTERVAL_MS = 250;

export class InputManager {
  constructor(engine, camera) {
    this.engine = engine;
    this.camera = camera;
    this.mode = 'camera';
    this.pose = new PoseTracker();
    this.hand = new HandTracker();
    this.gesture = new GestureMapper();
    this.modelState = 'idle';
    this.modelError = null;
    this.handReady = false;
    this.gestureReady = false;
    this.running = false;
    this.timer = null;
    this.tier = 0;
    this.tick = 0;
    this.errors = 0;
    this.recovering = false;
    this.lastGesture = 0;
    this.pendingHands = null;
    this.pendingGestures = null;
    this.stats = { fps: 0, ms: 0, tier: 0, delegate: '-', errors: 0 };
    this._frames = 0; this._msSum = 0; this._windowStart = 0; this._goodWindows = 0;
    this.canvas = document.createElement('canvas');
    this.c2d = this.canvas.getContext('2d', { alpha: false });
    this.pointer = { x: STAGE_W / 2, y: 540, inside: false, pressed: false };
    this.keys = new Set();
  }

  get modelsReady() { return this.modelState === 'ready'; }

  setMode(mode) {
    this.mode = mode;
    if (mode !== 'camera') this.stopLoop();
  }

  async loadModels(onProgress = () => {}) {
    if (this.modelsReady) return true;
    this.modelState = 'loading';
    this.modelError = null;
    try {
      onProgress('몸 인식 모델을 불러오는 중이에요', 1, 3);
      await this.pose.load();
      this.stats.delegate = this.pose.delegate;
    } catch (err) {
      console.error(err);
      this.modelState = 'error';
      this.modelError = err?.message ?? String(err);
      return false;
    }
    // 손·제스처 모델은 없어도 손목 관절로 플레이할 수 있어 실패해도 계속 진행한다.
    try {
      onProgress('손 인식 모델을 불러오는 중이에요', 2, 3);
      await this.hand.load();
      this.handReady = true;
    } catch (err) { console.warn('손 인식 모델 없이 진행합니다.', err?.message); }
    try {
      onProgress('제스처 모델을 불러오는 중이에요', 3, 3);
      await this.gesture.load();
      this.gestureReady = true;
    } catch (err) { console.warn('제스처 인식 없이 진행합니다.', err?.message); }
    this.modelState = 'ready';
    return true;
  }

  async setPlayerCount(n) {
    this.engine.setPlayerCount(n);
    if (this.mode !== 'camera' || !this.modelsReady) return;
    await this.pose.setNumPoses(n);
    if (this.handReady) await this.hand.setNumHands(n * 2);
    if (this.gestureReady) await this.gesture.setNumHands(n * 2);
  }

  startLoop() {
    if (this.running || this.mode !== 'camera') return;
    this.running = true;
    this.errors = 0;
    this._windowStart = performance.now();
    this.#schedule(0);
  }

  stopLoop() {
    this.running = false;
    clearTimeout(this.timer);
  }

  #schedule(delay) {
    this.timer = setTimeout(this.#step, Math.max(0, delay));
  }

  // 게임 렌더링(rAF)과 분리된 추론 루프. 사용자 기기 안에서만 실행된다.
  #step = () => {
    if (!this.running) return;
    const tier = TIERS[this.tier];
    const interval = 1000 / tier.hz;
    if (!this.camera.ready || this.recovering || document.hidden) { this.#schedule(100); return; }
    const start = performance.now();
    this.#guard(() => this.#runPose(start));
    const poseMs = performance.now() - start;
    // 손 추론은 다음 태스크로 나눠서 그 사이에 게임 화면이 그려질 수 있게 한다.
    if (tier.aux && !this.recovering) this.timer = setTimeout(() => this.#auxStep(start, interval, poseMs), 0);
    else this.#finishCycle(start, interval, poseMs);
  };

  #auxStep(start, interval, poseMs) {
    if (!this.running) return;
    const t = performance.now();
    if (this.camera.ready && !this.recovering) this.#guard(() => this.#runAux(t));
    this.#finishCycle(start, interval, poseMs + (performance.now() - t));
  }

  #finishCycle(start, interval, used) {
    this.#adapt(used, interval);
    this.#schedule(interval - (performance.now() - start));
  }

  #guard(fn) {
    try {
      fn();
      this.errors = 0;
    } catch (err) {
      this.stats.errors += 1;
      this.errors += 1;
      console.warn('추론 오류', err?.message);
      if (this.errors >= 3) this.#recover();
    }
  }

  #runPose(now) {
    const { video, aspect } = this.camera;
    const width = TIERS[this.tier].width;
    const height = Math.round(width / aspect);
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    this.c2d.drawImage(video, 0, 0, width, height);
    const poses = this.pose.detect(this.canvas, now);
    this.engine.ingest({ time: now, poses, hands: this.pendingHands, gestures: this.pendingGestures, aspect });
    this.pendingHands = null;
    this.pendingGestures = null;
  }

  // 포즈는 매번, 손은 격회로 추론하고 제스처는 남는 차례에 낮은 빈도로 추론한다.
  #runAux(now) {
    this.tick += 1;
    if (this.handReady && this.tick % 2 === 0) this.pendingHands = this.hand.detect(this.canvas, now);
    else if (this.gestureReady && now - this.lastGesture >= GESTURE_INTERVAL_MS) {
      this.lastGesture = now;
      this.pendingGestures = this.gesture.detect(this.canvas, now);
    }
  }

  #adapt(used, interval) {
    this._frames += 1;
    this._msSum += used;
    const now = performance.now();
    const elapsed = now - this._windowStart;
    if (elapsed < 2000) return;
    const avg = this._msSum / this._frames;
    this.stats.fps = (this._frames * 1000) / elapsed;
    this.stats.ms = avg;
    this._frames = 0; this._msSum = 0; this._windowStart = now;
    if (avg > interval * 0.75 && this.tier < TIERS.length - 1) {
      this.tier += 1; this._goodWindows = 0;
    } else if (avg < interval * 0.35 && this.tier > 0) {
      this._goodWindows += 1;
      if (this._goodWindows >= 4) { this.tier -= 1; this._goodWindows = 0; }
    } else this._goodWindows = 0;
    this.stats.tier = this.tier;
  }

  // 반복 오류가 나면 CPU로 다시 만든다(GPU 컨텍스트 손실 등).
  async #recover() {
    if (this.recovering) return;
    this.recovering = true;
    this.errors = 0;
    try {
      await this.pose.load(true);
      if (this.handReady) await this.hand.load(true);
      if (this.gestureReady) await this.gesture.load(true);
      this.stats.delegate = this.pose.delegate;
    } catch (err) {
      console.error('모델 복구 실패', err);
      this.modelState = 'error';
      this.modelError = err?.message ?? String(err);
      this.stopLoop();
    } finally { this.recovering = false; }
  }

  // ───── 마우스·터치·키보드 대체 조작 ─────

  attachPointer(canvas, toStage) {
    const move = (e) => {
      const p = toStage(e.clientX, e.clientY);
      this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.inside = true;
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', (e) => { move(e); this.pointer.pressed = true; });
    window.addEventListener('pointerup', () => { this.pointer.pressed = false; });
    canvas.addEventListener('pointerleave', () => { this.pointer.inside = false; });
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  /** 렌더링 프레임마다 호출해 마우스 입력을 엔진으로 전달한다. */
  frame(now) {
    if (this.mode !== 'mouse') return;
    const { x, y, inside, pressed } = this.pointer;
    const k = this.keys;
    this.engine.ingestVirtual({
      time: now, x, y, inside, pressed,
      zone: x < STAGE_W * 0.36 ? 'left' : x > STAGE_W * 0.64 ? 'right' : 'center',
      keyLeft: k.has('ArrowLeft') || k.has('KeyA'),
      keyRight: k.has('ArrowRight') || k.has('KeyD'),
      keyBoth: k.has('Space') || k.has('ArrowUp'),
    });
  }
}
