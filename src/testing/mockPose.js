// 카메라 없는 환경의 자동 테스트용 모의 관절 생성기. 실제 카메라 테스트를 대체하지 않는다.
import { LM, MAP } from '../core/MotionEngine.js';
import { STAGE_W, STAGE_H } from '../core/constants.js';

const rad = (d) => (d * Math.PI) / 180;
const DEFAULT = { x: 0.5, y: 0.5, z: 0, visibility: 0.95 };

/**
 * MediaPipe 형식(카메라 원본 좌표, 0~1)의 관절 33개를 만든다.
 * @param o.cx,o.cy  어깨 중심(거울 화면 기준 0~aspect, 0~1)
 * @param o.unit     어깨 너비(화면 높이 대비)
 * @param o.L,o.R    화면 왼쪽/오른쪽 팔의 [위팔, 아래팔] 상승 각도
 * @param o.handL,o.handR  팔 각도 대신 무대 좌표 {x,y}로 손목을 놓는다
 * @param o.visibility     전체 관절 신뢰도
 */
export function makePose(o = {}) {
  const { aspect = 16 / 9, cx = aspect / 2, cy = 0.35, unit = 0.2, L = [8, 4], R = [8, 4], lean = 0, mirror = true, visibility = 0.95, handL = null, handR = null, zone = { x: 0, w: STAGE_W } } = o;
  const pts = Array.from({ length: 33 }, () => ({ ...DEFAULT, visibility }));
  const put = (i, x, y) => {
    pts[i] = { x: (mirror ? aspect - x : x) / aspect, y, z: 0, visibility };
  };
  const armU = unit * 0.75;
  const armF = unit * 0.7;
  const li = Math.sin(rad(lean));
  const torso = unit * 1.45;
  const hipX = cx - li * torso;
  const hipY = cy + Math.cos(rad(lean)) * torso;
  put(LM.NOSE, cx, cy - unit * 0.8);
  put(LM.L_SHOULDER, cx - unit / 2, cy);
  put(LM.R_SHOULDER, cx + unit / 2, cy);
  put(LM.L_HIP, hipX - unit * 0.3, hipY);
  put(LM.R_HIP, hipX + unit * 0.3, hipY);
  put(LM.L_KNEE, hipX - unit * 0.3, hipY + unit);
  put(LM.R_KNEE, hipX + unit * 0.3, hipY + unit);
  put(LM.L_ANKLE, hipX - unit * 0.3, hipY + unit * 2);
  put(LM.R_ANKLE, hipX + unit * 0.3, hipY + unit * 2);

  const stageToBody = (hand) => {
    const rx = (hand.x - (zone.x + zone.w / 2)) / (zone.w / 2);
    const anchor = STAGE_H * MAP.anchorY;
    const dy = hand.y < anchor
      ? ((hand.y - anchor) / anchor) * unit * MAP.reachUp
      : ((hand.y - anchor) / (STAGE_H - anchor)) * unit * MAP.reachDown;
    return { x: cx + rx * unit * MAP.reachX, y: cy + dy };
  };
  const arm = (s, e, w, idx, pk, dir, ang, hand) => {
    const sx = cx + (dir * unit) / 2;
    let ex; let ey; let wx; let wy;
    if (hand) {
      const b = stageToBody(hand);
      wx = b.x; wy = b.y;
      ex = (sx + wx) / 2; ey = (cy + wy) / 2;
    } else {
      ex = sx + dir * Math.sin(rad(ang[0])) * armU;
      ey = cy + Math.cos(rad(ang[0])) * armU;
      wx = ex + dir * Math.sin(rad(ang[1])) * armF;
      wy = ey + Math.cos(rad(ang[1])) * armF;
    }
    put(e, ex, ey); put(w, wx, wy); put(idx, wx, wy); put(pk, wx, wy);
  };
  arm(LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST, LM.L_INDEX, LM.L_PINKY, -1, L, handL);
  arm(LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST, LM.R_INDEX, LM.R_PINKY, 1, R, handR);
  return pts;
}

/** 엔진에 일정 시간 동안 프레임을 입력하고 발생한 이벤트를 모은다. */
export function feed(engine, makeFrame, { from = 0, ms = 500, hz = 30 } = {}) {
  const events = [];
  const step = 1000 / hz;
  let t = from;
  while (t < from + ms) {
    engine.ingest({ time: t, ...makeFrame(t) });
    events.push(...engine.tick(step / 1000, t).events);
    t += step;
  }
  return { events, time: t };
}
