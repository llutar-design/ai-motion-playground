// 공통 모션 인식 엔진. 모델의 원시 관절을 게임이 쓰는 표준 상태와 이벤트로 변환한다.
// DOM에 의존하지 않으므로 모의 관절 데이터로 Node에서도 그대로 테스트할 수 있다.
import { STAGE_W, STAGE_H, clamp, lerp } from './constants.js';
import { scorePose } from './PoseLibrary.js';

export const LM = {
  NOSE: 0, L_SHOULDER: 11, R_SHOULDER: 12, L_ELBOW: 13, R_ELBOW: 14, L_WRIST: 15, R_WRIST: 16,
  L_PINKY: 17, R_PINKY: 18, L_INDEX: 19, R_INDEX: 20, L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26, L_ANKLE: 27, R_ANKLE: 28,
};

export const SKELETON = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
];

/** 어깨 너비 기준 도달 범위. 팔을 편안히 뻗으면 화면 끝에 닿도록 정한 값이다. */
export const MAP = { reachX: 1.7, reachUp: 1.9, reachDown: 1.25, anchorY: 0.58, bodyFollow: 0.35 };

export const TRACK_HOLD_MS = 300;
const MAX_TRACK_HOLD_MS = 1500;
export const LOST_MS = 2000;
const HAND_CACHE_MS = 160;
const MIN_CONF = 0.5;
const DEADZONE_PX = 6;
const GLITCH_UNITS = 1.5;

// 오탐 방지 규칙: 유지 시간(hold), 재발생 간격(cooldown), 최소 신뢰도(minConf). 움직임 크기는 magnitude >= 1로 판단한다.
export const RULES = {
  LEFT_HAND_UP: { hold: 120, cooldown: 400, minConf: MIN_CONF },
  RIGHT_HAND_UP: { hold: 120, cooldown: 400, minConf: MIN_CONF },
  BOTH_HANDS_UP: { hold: 120, cooldown: 500, minConf: MIN_CONF },
  HAND_REACH_LEFT: { hold: 100, cooldown: 500, minConf: MIN_CONF },
  HAND_REACH_RIGHT: { hold: 100, cooldown: 500, minConf: MIN_CONF },
  HAND_SWING: { hold: 0, cooldown: 700, minConf: MIN_CONF },
  MOVE_LEFT: { hold: 60, cooldown: 180, minConf: 0.45 },
  MOVE_RIGHT: { hold: 60, cooldown: 180, minConf: 0.45 },
  MOVE_CENTER: { hold: 60, cooldown: 180, minConf: 0.45 },
  LEAN_LEFT: { hold: 150, cooldown: 500, minConf: 0.45 },
  LEAN_RIGHT: { hold: 150, cooldown: 500, minConf: 0.45 },
  BODY_DIP: { hold: 100, cooldown: 800, minConf: 0.45 },
  GESTURE_SELECT: { hold: 120, cooldown: 800, minConf: 0.6 },
};

class OneEuro {
  constructor(minCutoff = 1.4, beta = 0.05) { this.minCutoff = minCutoff; this.beta = beta; this.x = null; this.dx = 0; }
  static alpha(dt, cutoff) { const r = 2 * Math.PI * cutoff * dt; return r / (r + 1); }
  filter(v, dt) {
    if (this.x === null || dt <= 0) { this.x = v; this.dx = 0; return v; }
    const d = (v - this.x) / dt;
    this.dx = lerp(this.dx, d, OneEuro.alpha(dt, 1));
    this.x = lerp(this.x, v, OneEuro.alpha(dt, this.minCutoff + this.beta * Math.abs(this.dx)));
    return this.x;
  }
}

function newHand(id, playerId) {
  return {
    id, playerId, x: 0, y: 0, px: 0, py: 0, tx: 0, ty: 0, vx: 0, vy: 0, speed: 0, dirX: 0, dirY: 0,
    visible: false, active: false, resting: true, glitch: false, confidence: 0, reach: 0, extended: false,
    palm: null, fingers: null, gesture: null, gestureScore: 0, source: 'none',
    _snap: true, _lastT: 0, _glitchN: 0, _swing: { dir: 0, ext: 0, reversals: [] }, _gestureRun: 0,
  };
}

function newPlayer(id) {
  return {
    id, seen: false, tracked: false, lost: true, fresh: false, confidence: 0, lastSeen: -1e9, filters: [], lastT: 0,
    landmarks: null, center: null, unit: 0, calib: null,
    hands: { left: newHand('left', id), right: newHand('right', id) },
    body: { x: STAGE_W / 2, offset: 0, lean: 0, lane: 0, dip: 0 },
    flags: { leftUp: false, rightUp: false, bothUp: false },
    edges: { leftUp: -1e9, rightUp: -1e9 },
    features: { arms: { L: null, R: null }, lean: 0, wristDist: 9 },
    gates: {}, poseScore: 0, poseProgress: 0, poseSince: 0, poseDone: false,
  };
}

export class MotionEngine {
  constructor(config = {}) {
    this.cfg = { mirror: true, sensitivity: 1, smallMotion: false, seated: false, oneHand: 'off', difficultyScale: 1, ...config };
    this.pending = [];
    this.targets = [];
    this.poseWatch = null;
    this.lastHands = null;
    this.lastGestures = null;
    this.virtualPress = false;
    this.lastIngest = null;
    this.frameGap = 33;
    this.state = { time: 0, mode: 'camera', players: [newPlayer(0)], events: [], anyLost: true, allTracked: false };
  }

  get players() { return this.state.players; }

  configure(partial) { Object.assign(this.cfg, partial); }

  setPlayerCount(n) {
    if (this.players.length === n) return;
    this.state.players = Array.from({ length: n }, (_, i) => this.players[i] ?? newPlayer(i));
  }

  /** 게임 전환 시 호출한다. 카메라와 모델은 유지하고 이전 게임의 이벤트와 목표만 지운다. */
  resetForGame() {
    this.pending = [];
    this.state.events = [];
    this.targets = [];
    this.poseWatch = null;
    for (const p of this.players) {
      p.gates = {};
      p.poseProgress = 0; p.poseScore = 0; p.poseSince = 0; p.poseDone = false;
      p.edges = { leftUp: -1e9, rightUp: -1e9 };
      p.hands.left._snap = p.hands.right._snap = true;
    }
  }

  /** 현재 자세를 기본 자세로 저장한다. 이후 이동량은 어깨 너비 단위로 측정된다. */
  calibrate() {
    let ok = true;
    for (const p of this.players) {
      if (!p.tracked || !p.center) { ok = false; continue; }
      p.calib = { baseX: p.center.x, baseY: p.center.y, unit: p.unit, lean0: p.features.lean, time: this.state.time };
      p.body.lane = 0;
    }
    return ok;
  }

  clearCalibration() { for (const p of this.players) p.calib = null; }

  setTargets(list) { this.targets = list.map((t) => Object.assign(t, { progress: 0, done: false })); return this.targets; }
  clearTargets() { this.targets = []; }

  watchPose(pose, opts = {}) {
    this.poseWatch = { pose, hold: opts.hold ?? 700, threshold: opts.threshold ?? 0.72, tolScale: opts.tolScale ?? 1 };
    for (const p of this.players) { p.poseSince = 0; p.poseProgress = 0; p.poseDone = false; }
  }
  clearPoseWatch() { this.poseWatch = null; }

  zoneOf(id) {
    const n = this.players.length;
    return { x: (STAGE_W / n) * id, w: STAGE_W / n };
  }

  get reachScale() {
    const { sensitivity, smallMotion, difficultyScale } = this.cfg;
    return ((smallMotion ? 0.5 : 1) * difficultyScale) / sensitivity;
  }

  // ───── 입력 ─────

  /** 모델 결과 한 프레임을 처리한다. poses는 정규화 랜드마크(0~1) 배열의 배열이다. */
  ingest({ time, poses = [], hands = null, gestures = null, aspect = 16 / 9 }) {
    this.state.time = time;
    this.state.mode = 'camera';
    if (this.lastIngest !== null) this.frameGap = lerp(this.frameGap, Math.min(2000, time - this.lastIngest), 0.2);
    this.lastIngest = time;
    if (hands) { this.lastHands = { time, list: hands.map((h) => this.#prepHand(h, aspect)) }; }
    if (gestures) { this.lastGestures = { time, list: gestures.map((g) => ({ ...g, ...this.#prepPoint(g.point, aspect) })) }; }
    const dets = poses.map((lms) => this.#prepPose(lms, aspect)).filter(Boolean);
    const assigned = this.#assign(dets, time);
    const handWindow = Math.max(HAND_CACHE_MS, this.frameGap * 2.5);
    const handDets = this.lastHands && time - this.lastHands.time <= handWindow ? this.lastHands.list : [];
    this.players.forEach((p, i) => {
      if (assigned[i]) this.#updatePlayer(p, assigned[i], time, handDets);
      else p.fresh = false;
    });
  }

  /** 마우스·터치·키보드 입력을 카메라와 같은 상태로 변환한다. */
  ingestVirtual({ time, x, y, inside, pressed, zone, keyLeft, keyRight, keyBoth }) {
    this.state.time = time;
    this.state.mode = 'mouse';
    const p = this.players[0];
    p.seen = true; p.tracked = true; p.lost = false; p.fresh = true; p.confidence = 1; p.lastSeen = time;
    p.body.offset = (x / STAGE_W - 0.5) * 3;
    p.body.x = x;
    const prevLane = p.body.lane;
    p.body.lane = keyLeft ? -1 : keyRight ? 1 : x < STAGE_W / 3 ? -1 : x > (STAGE_W * 2) / 3 ? 1 : 0;
    if (p.body.lane !== prevLane) {
      const t = p.body.lane < 0 ? 'MOVE_LEFT' : p.body.lane > 0 ? 'MOVE_RIGHT' : 'MOVE_CENTER';
      this.#emit(t, p, 1, { x, y });
    }
    const hand = p.hands.right;
    hand.tx = x; hand.ty = y;
    if (hand._snap) { hand.x = hand.px = x; hand.y = hand.py = y; hand._snap = false; }
    hand.glitch = false;
    hand.visible = inside; hand.resting = false; hand.confidence = 1; hand.source = 'mouse';
    p.hands.left.visible = false;
    const leftNow = keyLeft || (pressed && zone === 'left');
    const rightNow = keyRight || (pressed && zone === 'right');
    const bothNow = keyBoth || (pressed && zone === 'center');
    if ((leftNow || bothNow) && !p.flags.leftUp) p.edges.leftUp = time;
    if ((rightNow || bothNow) && !p.flags.rightUp) p.edges.rightUp = time;
    p.flags.leftUp = leftNow || bothNow;
    p.flags.rightUp = rightNow || bothNow;
    p.flags.bothUp = bothNow;
    this.virtualPress = pressed || keyBoth;
    if (this.poseWatch) {
      p.poseScore = this.virtualPress ? 0.9 : 0;
      this.#stepPoseWatch(p, time);
    }
  }

  /** 렌더링 프레임마다 호출한다. 15~30Hz 추론 결과를 60Hz 화면 움직임으로 보간한다. */
  tick(dt, now) {
    const st = this.state;
    st.time = now;
    let anyLost = false;
    let allTracked = true;
    // 추론이 느린 기기에서는 프레임 간격만큼 유지 시간을 늘려야 추적이 깜빡이지 않는다.
    const hold = clamp(this.frameGap * 2.5, TRACK_HOLD_MS, MAX_TRACK_HOLD_MS);
    for (const p of this.players) {
      p.tracked = p.seen && now - p.lastSeen < hold;
      p.lost = !p.seen || now - p.lastSeen > LOST_MS;
      if (p.lost) anyLost = true;
      if (!p.tracked) allTracked = false;
      for (const hand of [p.hands.left, p.hands.right]) this.#tickHand(hand, p, dt);
    }
    st.anyLost = anyLost;
    st.allTracked = allTracked;
    this.#stepTargets(dt, now);
    st.events = this.pending;
    this.pending = [];
    return st;
  }

  allHands() {
    const out = [];
    for (const p of this.players) out.push(p.hands.left, p.hands.right);
    return out;
  }

  // ───── 내부 처리 ─────

  #prepPose(lms, aspect) {
    if (!lms || lms.length < 29) return null;
    const pts = lms.map((l) => ({ x: (this.cfg.mirror ? 1 - l.x : l.x) * aspect, y: l.y, v: l.visibility ?? 0 }));
    const ls = pts[LM.L_SHOULDER];
    const rs = pts[LM.R_SHOULDER];
    const score = Math.min(ls.v, rs.v);
    if (score < 0.4) return null;
    return { pts, score, aspect, cx: (ls.x + rs.x) / 2, cy: (ls.y + rs.y) / 2 };
  }

  #prepPoint(point, aspect) {
    return point ? { x: (this.cfg.mirror ? 1 - point.x : point.x) * aspect, y: point.y } : { x: 0, y: 0 };
  }

  #prepHand(h, aspect) {
    const lms = h.landmarks.map((l) => ({ x: (this.cfg.mirror ? 1 - l.x : l.x) * aspect, y: l.y }));
    const palm = [0, 5, 9, 13, 17].reduce((s, i) => ({ x: s.x + lms[i].x / 5, y: s.y + lms[i].y / 5 }), { x: 0, y: 0 });
    return { lms, palm, score: h.score ?? 0.9 };
  }

  // 위치 기반으로 사람과 플레이어 슬롯을 연결해 프레임마다 ID가 뒤바뀌지 않게 한다.
  #assign(dets, time) {
    const n = this.players.length;
    const out = new Array(n).fill(null);
    if (!dets.length) return out;
    const aspect = dets[0].aspect;
    const cost = (slot, d) => {
      const p = this.players[slot];
      if (p.center && time - p.lastSeen < LOST_MS) return Math.hypot(p.center.x - d.cx, p.center.y - d.cy);
      const expected = ((slot + 0.5) / n) * aspect;
      return Math.abs(expected - d.cx) * 0.5 + 0.2;
    };
    if (n === 1) {
      out[0] = dets.reduce((best, d) => (cost(0, d) < cost(0, best) ? d : best));
      return out;
    }
    const a = dets[0];
    const b = dets[1];
    if (!b) {
      if (cost(0, a) <= cost(1, a)) out[0] = a; else out[1] = a;
      return out;
    }
    if (cost(0, a) + cost(1, b) <= cost(0, b) + cost(1, a)) { out[0] = a; out[1] = b; } else { out[0] = b; out[1] = a; }
    return out;
  }

  // 사람이 낼 수 없는 속도의 손목 순간 이동은 인식 오류로 보고 이전 위치를 유지한다.
  // 2프레임을 넘게 이어지면 실제 위치로 받아들인다.
  #rejectGlitches(p, pts, gap) {
    const sides = [
      [p.hands.left, LM.L_WRIST, LM.L_INDEX, LM.L_PINKY],
      [p.hands.right, LM.R_WRIST, LM.R_INDEX, LM.R_PINKY],
    ];
    for (const [hand, wrist, idx, pk] of sides) {
      hand.glitch = false;
      if (!p.landmarks || gap > 150) { hand._glitchN = 0; continue; }
      const prev = p.landmarks[wrist];
      const limit = GLITCH_UNITS * p.unit * Math.max(1, gap / 33);
      const jumped = pts[wrist].v >= MIN_CONF && Math.hypot(pts[wrist].x - prev.x, pts[wrist].y - prev.y) > limit;
      if (jumped && hand._glitchN < 2) {
        hand._glitchN += 1;
        hand.glitch = true;
        for (const i of [wrist, idx, pk]) pts[i] = { ...p.landmarks[i] };
      } else {
        if (jumped) hand._snap = true;
        hand._glitchN = 0;
      }
    }
  }

  #updatePlayer(p, det, time, handDets) {
    const gap = time - p.lastSeen;
    const dt = gap > 500 ? 0 : gap / 1000;
    if (gap > 500) { p.filters = []; p.hands.left._snap = p.hands.right._snap = true; }
    this.#rejectGlitches(p, det.pts, gap);
    if (!p.filters.length) p.filters = det.pts.map(() => [new OneEuro(), new OneEuro()]);
    const lm = det.pts.map((pt, i) => ({ x: p.filters[i][0].filter(pt.x, dt), y: p.filters[i][1].filter(pt.y, dt), v: pt.v }));
    p.landmarks = lm;
    p.seen = true; p.lastSeen = time; p.fresh = true; p.tracked = true; p.lost = false; p.confidence = det.score;

    const ls = lm[LM.L_SHOULDER]; const rs = lm[LM.R_SHOULDER];
    const lh = lm[LM.L_HIP]; const rh = lm[LM.R_HIP];
    const cx = (ls.x + rs.x) / 2; const cy = (ls.y + rs.y) / 2;
    p.center = { x: cx, y: cy };
    const shoulderW = Math.hypot(ls.x - rs.x, ls.y - rs.y);
    const hipsOk = Math.min(lh.v, rh.v) >= 0.4 && !this.cfg.seated;
    const hipX = (lh.x + rh.x) / 2; const hipY = (lh.y + rh.y) / 2;
    const torso = hipsOk ? Math.hypot(cx - hipX, cy - hipY) : 0;
    // 몸을 돌리면 어깨 너비가 줄어든다. 상체 길이로 보완하고 천천히만 갱신해 안정화한다.
    const raw = Math.max(shoulderW, torso * 0.62, 1e-3);
    p.unit = p.unit ? lerp(p.unit, raw, gap > 500 ? 1 : 0.08) : raw;
    if (p.calib) p.unit = Math.max(p.unit, p.calib.unit * 0.7);

    this.#computeFeatures(p, lm, hipsOk, hipX, hipY);
    this.#updateBody(p);
    this.#updateHands(p, lm, time, handDets);
    this.#detect(p, time);
    if (this.poseWatch) {
      p.poseScore = scorePose(p.features, this.poseWatch.pose, { tolScale: this.poseWatch.tolScale, oneHand: this.cfg.oneHand });
      this.#stepPoseWatch(p, time);
    }
  }

  #computeFeatures(p, lm, hipsOk, hipX, hipY) {
    const arm = (s, e, w, other) => {
      const sh = lm[s]; const el = lm[e]; const wr = lm[w];
      const out = Math.sign(sh.x - lm[other].x) || 1;
      const elev = (a, b) => (Math.atan2((b.x - a.x) * out, b.y - a.y) * 180) / Math.PI;
      return { upper: elev(sh, el), fore: elev(el, wr), ok: Math.min(sh.v, el.v, wr.v) >= 0.35 };
    };
    const left = arm(LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST, LM.R_SHOULDER);
    const right = arm(LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST, LM.L_SHOULDER);
    // 포즈의 L/R은 화면 기준이다. 거울 모드에서는 플레이어의 왼팔이 화면 왼쪽에 보인다.
    const leftOnScreenLeft = lm[LM.L_SHOULDER].x <= lm[LM.R_SHOULDER].x;
    p.features.arms.L = leftOnScreenLeft ? left : right;
    p.features.arms.R = leftOnScreenLeft ? right : left;
    const a = leftOnScreenLeft ? lm[LM.L_SHOULDER] : lm[LM.R_SHOULDER];
    const b = leftOnScreenLeft ? lm[LM.R_SHOULDER] : lm[LM.L_SHOULDER];
    const lean = hipsOk
      ? (Math.atan2((a.x + b.x) / 2 - hipX, hipY - (a.y + b.y) / 2) * 180) / Math.PI
      : (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    p.features.lean = lean - (p.calib?.lean0 ?? 0);
    p.features.wristDist = Math.hypot(lm[LM.L_WRIST].x - lm[LM.R_WRIST].x, lm[LM.L_WRIST].y - lm[LM.R_WRIST].y) / p.unit;
  }

  #updateBody(p) {
    const c = p.calib;
    const body = p.body;
    body.lean = p.features.lean;
    body.offset = c ? (p.center.x - c.baseX) / p.unit : 0;
    body.dip = c ? (p.center.y - c.baseY) / p.unit : 0;
    const zone = this.zoneOf(p.id);
    body.x = clamp(zone.x + zone.w / 2 + (body.offset / 1.5) * (zone.w / 2), zone.x, zone.x + zone.w);
    // 데드존과 이력(hysteresis): 작은 흔들림으로 레인이 바뀌지 않는다.
    const scale = this.reachScale * (this.cfg.seated ? 0.6 : 1);
    const enter = 0.6 * scale;
    const exit = 0.35 * scale;
    let lane = body.lane;
    if (lane === 0) { if (body.offset <= -enter) lane = -1; else if (body.offset >= enter) lane = 1; }
    else if (lane < 0 && body.offset > -exit) lane = body.offset >= enter ? 1 : 0;
    else if (lane > 0 && body.offset < exit) lane = body.offset <= -enter ? -1 : 0;
    body.lane = lane;
  }

  #stageFor(p, px, py) {
    const k = this.reachScale;
    const c = p.calib;
    const ax = c ? lerp(p.center.x, c.baseX, MAP.bodyFollow) : p.center.x;
    const ay = c ? lerp(p.center.y, c.baseY, MAP.bodyFollow) : p.center.y;
    const rx = (px - ax) / (p.unit * MAP.reachX * k);
    const dy = py - ay;
    const anchor = STAGE_H * MAP.anchorY;
    const normDown = dy / (p.unit * MAP.reachDown * k);
    const y = dy < 0 ? anchor + (dy / (p.unit * MAP.reachUp * k)) * anchor : anchor + normDown * (STAGE_H - anchor);
    const zone = this.zoneOf(p.id);
    return { x: clamp(zone.x + zone.w / 2 + (rx * zone.w) / 2, zone.x + 16, zone.x + zone.w - 16), y: clamp(y, 16, STAGE_H - 16), resting: normDown > 0.93 };
  }

  #updateHands(p, lm, time, handDets) {
    const sides = [
      { hand: p.hands.left, wr: lm[LM.L_WRIST], el: lm[LM.L_ELBOW], sh: lm[LM.L_SHOULDER], idx: lm[LM.L_INDEX], pk: lm[LM.L_PINKY] },
      { hand: p.hands.right, wr: lm[LM.R_WRIST], el: lm[LM.R_ELBOW], sh: lm[LM.R_SHOULDER], idx: lm[LM.R_INDEX], pk: lm[LM.R_PINKY] },
    ];
    // 모델의 좌우 손 라벨은 영상 반전에 따라 뒤집히므로 쓰지 않고 손목과의 거리로 연결한다.
    const used = new Set();
    for (const s of sides) {
      let best = null; let bestD = 1.2 * p.unit;
      for (const h of handDets) {
        if (used.has(h)) continue;
        const d = Math.hypot(h.palm.x - s.wr.x, h.palm.y - s.wr.y);
        if (d < bestD) { bestD = d; best = h; }
      }
      s.det = s.wr.v >= 0.3 ? best : null;
      if (s.det) used.add(s.det);
    }
    for (const s of sides) this.#updateHand(p, s, time);
  }

  #updateHand(p, { hand, wr, el, sh, idx, pk, det }, time) {
    const disabled = this.cfg.oneHand !== 'off' && this.cfg.oneHand !== hand.id;
    let conf = wr.v;
    let palm = { x: wr.x + ((idx.x + pk.x) / 2 - wr.x) * 0.9, y: wr.y + ((idx.y + pk.y) / 2 - wr.y) * 0.9 };
    hand.source = 'pose';
    hand.fingers = null;
    if (det) { palm = det.palm; conf = Math.max(conf, det.score); hand.source = 'hand'; hand.fingers = det.lms; }
    hand.confidence = conf;
    hand.palm = palm;
    hand.visible = !disabled && conf >= MIN_CONF;
    const dist = Math.hypot(wr.x - sh.x, wr.y - sh.y);
    const len = Math.hypot(el.x - sh.x, el.y - sh.y) + Math.hypot(wr.x - el.x, wr.y - el.y);
    hand.reach = clamp(dist / (p.unit * 1.5), 0, 1.2);
    hand.extended = len > 0 && dist / len > 0.9 && dist / p.unit > 0.9;

    const gest = this.lastGestures && time - this.lastGestures.time < 400
      ? this.lastGestures.list.find((g) => Math.hypot(g.x - palm.x, g.y - palm.y) < p.unit) : null;
    hand.gesture = gest?.name ?? null;
    hand.gestureScore = gest?.score ?? 0;

    if (!hand.visible) { hand._snap = true; return; }
    const stage = this.#stageFor(p, palm.x, palm.y);
    hand.resting = stage.resting;
    const dt = (time - hand._lastT) / 1000;
    if (hand._snap || dt > 0.5) {
      hand.tx = stage.x; hand.ty = stage.y;
      hand.x = hand.px = stage.x; hand.y = hand.py = stage.y;
      hand.vx = hand.vy = hand.speed = 0;
      hand._snap = false; hand._lastT = time;
      return;
    }
    const dx = stage.x - hand.tx; const dy = stage.y - hand.ty;
    const moved = Math.hypot(dx, dy);
    if (hand.glitch) return;
    if (dt > 0) {
      hand.vx = lerp(hand.vx, dx / dt, 0.5);
      hand.vy = lerp(hand.vy, dy / dt, 0.5);
      hand.speed = Math.hypot(hand.vx, hand.vy);
      if (hand.speed > 1) { hand.dirX = hand.vx / hand.speed; hand.dirY = hand.vy / hand.speed; }
    }
    if (moved >= DEADZONE_PX) { hand.tx = stage.x; hand.ty = stage.y; }
    hand._lastT = time;
    this.#trackSwing(p, hand, palm.x, time);
  }

  #trackSwing(p, hand, x, time) {
    const s = hand._swing;
    const amp = 0.3 * p.unit * this.reachScale;
    if (s.dir === 0) { s.dir = 1; s.ext = x; return; }
    if ((x - s.ext) * s.dir > 0) s.ext = x;
    else if (Math.abs(x - s.ext) > amp) { s.reversals.push(time); s.dir = -s.dir; s.ext = x; }
    s.reversals = s.reversals.filter((t) => time - t < 1400);
  }

  #tickHand(hand, p, dt) {
    hand.px = hand.x; hand.py = hand.y;
    if (hand.visible && p.tracked) {
      const a = this.state.mode === 'mouse' ? 1 : 1 - Math.exp(-dt * 24);
      hand.x = lerp(hand.x, hand.tx, a);
      hand.y = lerp(hand.y, hand.ty, a);
    }
    // 추적이 끊기면 비활성으로 전환되어 어떤 충돌도 점수로 이어지지 않는다.
    hand.active = hand.visible && p.tracked && !hand.resting && !hand.glitch && !hand._snap;
  }

  #stepTargets(dt, now) {
    if (!this.targets.length) return;
    const hands = this.allHands().filter((h) => h.active);
    for (const t of this.targets) {
      if (t.done || t.disabled) continue;
      const inside = hands.find((h) => {
        if (t.playerId !== undefined && h.playerId !== t.playerId) return false;
        if (t.side && h.id !== t.side) return false;
        return t.w ? h.x >= t.x - t.w / 2 && h.x <= t.x + t.w / 2 && h.y >= t.y - t.h / 2 && h.y <= t.y + t.h / 2
          : Math.hypot(h.x - t.x, h.y - t.y) <= t.r;
      });
      t.hover = !!inside;
      if (inside) {
        const dwell = t.dwell ?? 800;
        t.progress = dwell <= 0 ? 1 : Math.min(1, t.progress + (dt * 1000) / dwell);
        const gestureOk = inside.gesture && ['Closed_Fist', 'Thumb_Up'].includes(inside.gesture) && inside.gestureScore >= 0.6;
        if (gestureOk && t.progress > 0.15) t.progress = 1;
        if (t.progress >= 1 && !t.hold) {
          t.done = true;
          this.pending.push({ type: 'REACH_TARGET', time: now, confidence: inside.confidence, playerId: inside.playerId, position: { x: inside.x, y: inside.y }, hand: inside.id, targetId: t.id, data: { viaGesture: !!gestureOk } });
        }
      } else {
        t.progress = t.hold ? 0 : Math.max(0, t.progress - dt * 1.6);
      }
    }
  }

  #stepPoseWatch(p, time) {
    const w = this.poseWatch;
    if (p.poseDone) return;
    if (p.poseScore >= w.threshold) {
      if (!p.poseSince) p.poseSince = time;
      p.poseProgress = clamp((time - p.poseSince) / w.hold, 0, 1);
      if (p.poseProgress >= 1) {
        p.poseDone = true;
        this.#emit('POSE_MATCH', p, p.confidence, this.#bodyPos(p), { poseId: w.pose.id, score: p.poseScore });
      }
    } else { p.poseSince = 0; p.poseProgress = Math.max(0, p.poseProgress - 0.12); }
  }

  #bodyPos(p) { return { x: p.body.x, y: STAGE_H * MAP.anchorY }; }

  #emit(type, p, confidence, position, data) {
    this.pending.push({ type, time: this.state.time, confidence, playerId: p.id, position, data });
  }

  /** 신뢰도·유지 시간·움직임 크기·쿨다운을 모두 통과해야 이벤트가 한 번 발생한다. */
  #gate(p, type, magnitude, confidence, position, data, now) {
    const rule = RULES[type];
    const g = (p.gates[type] ??= { since: 0, armed: true, last: -1e9 });
    if (magnitude < 1 || confidence < rule.minConf) { g.since = 0; g.armed = true; return; }
    if (!g.since) g.since = now;
    if (g.armed && now - g.since >= rule.hold && now - g.last >= rule.cooldown) {
      g.armed = false;
      g.last = now;
      this.#emit(type, p, confidence, position, { magnitude, ...data });
    }
  }

  #detect(p, now) {
    const lm = p.landmarks;
    const sh = (lm[LM.L_SHOULDER].y + lm[LM.R_SHOULDER].y) / 2;
    const thr = 0.3 * p.unit * this.reachScale;
    const lower = thr - 0.2 * p.unit * this.reachScale;
    const { left, right } = p.hands;
    const lift = (w) => sh - lm[w].y;
    const lUp = left.visible && lift(LM.L_WRIST) > (p.flags.leftUp ? lower : thr);
    const rUp = right.visible && lift(LM.R_WRIST) > (p.flags.rightUp ? lower : thr);
    if (lUp && !p.flags.leftUp) p.edges.leftUp = now;
    if (rUp && !p.flags.rightUp) p.edges.rightUp = now;
    p.flags.leftUp = lUp; p.flags.rightUp = rUp; p.flags.bothUp = lUp && rUp;

    const magL = lift(LM.L_WRIST) / thr;
    const magR = lift(LM.R_WRIST) / thr;
    const handPos = (h) => ({ x: h.tx, y: h.ty });
    this.#gate(p, 'LEFT_HAND_UP', lUp && !rUp ? Math.max(1, magL) : 0, left.confidence, handPos(left), { hand: 'left' }, now);
    this.#gate(p, 'RIGHT_HAND_UP', rUp && !lUp ? Math.max(1, magR) : 0, right.confidence, handPos(right), { hand: 'right' }, now);
    this.#gate(p, 'BOTH_HANDS_UP', lUp && rUp ? Math.max(1, Math.min(magL, magR)) : 0, Math.min(left.confidence, right.confidence), this.#bodyPos(p), {}, now);
    this.#gate(p, 'HAND_REACH_LEFT', left.visible && left.extended ? 1 + left.reach : 0, left.confidence, handPos(left), { hand: 'left' }, now);
    this.#gate(p, 'HAND_REACH_RIGHT', right.visible && right.extended ? 1 + right.reach : 0, right.confidence, handPos(right), { hand: 'right' }, now);

    for (const h of [left, right]) {
      if (!h.visible) continue;
      this.#gate(p, 'HAND_SWING', h._swing.reversals.length >= 2 ? 2 : 0, h.confidence, handPos(h), { hand: h.id }, now);
      if (h._swing.reversals.length >= 2 && p.gates.HAND_SWING?.last === now) h._swing.reversals = [];
      const selecting = h.gesture === 'Closed_Fist' || h.gesture === 'Thumb_Up';
      this.#gate(p, 'GESTURE_SELECT', selecting ? 1 : 0, h.gestureScore, handPos(h), { hand: h.id, gesture: h.gesture }, now);
    }

    const { lane, lean, dip } = p.body;
    const pos = this.#bodyPos(p);
    if (p.calib) {
      this.#gate(p, 'MOVE_LEFT', lane < 0 ? 2 : 0, p.confidence, pos, {}, now);
      this.#gate(p, 'MOVE_RIGHT', lane > 0 ? 2 : 0, p.confidence, pos, {}, now);
      this.#gate(p, 'MOVE_CENTER', lane === 0 ? 2 : 0, p.confidence, pos, {}, now);
      const leanThr = 11 * this.reachScale;
      this.#gate(p, 'LEAN_LEFT', -lean / leanThr, p.confidence, pos, {}, now);
      this.#gate(p, 'LEAN_RIGHT', lean / leanThr, p.confidence, pos, {}, now);
      this.#gate(p, 'BODY_DIP', dip / (0.4 * this.reachScale), p.confidence, pos, {}, now);
    }
  }
}
