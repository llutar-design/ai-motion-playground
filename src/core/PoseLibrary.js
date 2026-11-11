// 포즈는 팔의 "상승 각도"로 정의한다. 관절 좌표 대신 각도를 쓰므로 키와 체형에 영향을 받지 않는다.
// 각도: 0 = 아래로 내림, 90 = 몸 바깥쪽 수평, 180 = 위로 듦, 음수 = 몸 안쪽으로 향함.
// L은 화면 왼쪽 팔(거울 화면에서 플레이어의 왼팔), upper는 위팔, fore는 아래팔이다.

const DOWN = [8, 4];

export const POSES = {
  both_up: { id: 'both_up', name: '양손 번쩍', L: [172, 176], R: [172, 176], tol: 32 },
  left_up: { id: 'left_up', name: '왼손 올리기', L: [168, 174], R: DOWN, tol: 32, restTol: 60 },
  right_up: { id: 'right_up', name: '오른손 올리기', L: DOWN, R: [168, 174], tol: 32, restTol: 60 },
  manse: { id: 'manse', name: '만세', L: [138, 142], R: [138, 142], tol: 26 },
  arms_out: { id: 'arms_out', name: '양팔 벌리기', L: [90, 90], R: [90, 90], tol: 26 },
  side_left: { id: 'side_left', name: '왼팔 옆으로 뻗기', L: [90, 90], R: DOWN, tol: 26, restTol: 60 },
  side_right: { id: 'side_right', name: '오른팔 옆으로 뻗기', L: DOWN, R: [90, 90], tol: 26, restTol: 60 },
  robot: { id: 'robot', name: '로봇 자세', L: [85, 172], R: [85, 172], tol: 34 },
  heart: { id: 'heart', name: '하트 포즈', L: [135, -120], R: [135, -120], tol: 42, wristsClose: true },
  lean_left: { id: 'lean_left', name: '왼쪽으로 기울이기', L: DOWN, R: [150, 160], tol: 42, restTol: 65, lean: -14 },
  lean_right: { id: 'lean_right', name: '오른쪽으로 기울이기', L: [150, 160], R: DOWN, tol: 42, restTol: 65, lean: 14 },
  stand: { id: 'stand', name: '바른 자세', L: DOWN, R: DOWN, tol: 45, restTol: 60, lean: 0 },
  left_out_right_up: { id: 'left_out_right_up', name: '왼팔 옆, 오른팔 위', L: [90, 90], R: [168, 174], tol: 32 },
  right_out_left_up: { id: 'right_out_left_up', name: '오른팔 옆, 왼팔 위', L: [168, 174], R: [90, 90], tol: 32 },
};

export const POSE_MASTER_SET = ['both_up', 'left_up', 'right_up', 'manse', 'arms_out', 'side_left', 'side_right', 'robot', 'heart'];
export const ROBOT_SET = ['stand', 'both_up', 'left_up', 'right_up', 'arms_out', 'robot', 'lean_left', 'lean_right', 'left_out_right_up', 'right_out_left_up'];

function angleDiff(a, b) {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

const term = (delta, tol) => Math.max(0, Math.min(1, 1 - Math.max(0, delta - tol) / 40));

/**
 * 플레이어 특징값과 포즈를 비교해 0~1 유사도를 돌려준다.
 * @param features MotionEngine이 계산한 { arms:{L,R}, lean, wristDist }
 * @param opts { tolScale, oneHand:'off'|'left'|'right', hasTorso }
 */
export function scorePose(features, pose, opts = {}) {
  const scale = opts.tolScale ?? 1;
  const terms = [];
  const evalArm = (arm, target) => {
    if (!arm?.ok) { terms.push(0, 0); return; }
    const isRest = target === DOWN;
    const tol = (isRest ? pose.restTol ?? pose.tol : pose.tol) * scale;
    terms.push(term(angleDiff(arm.upper, target[0]), tol), term(angleDiff(arm.fore, target[1]), tol));
  };
  // 한 손 모드에서는 사용할 수 있는 팔만 평가한다.
  if (opts.oneHand !== 'right') evalArm(features.arms.L, pose.L);
  if (opts.oneHand !== 'left') evalArm(features.arms.R, pose.R);
  if (pose.lean !== undefined && pose.lean !== 0) {
    terms.push(term(Math.abs(features.lean - pose.lean), 8 * scale));
  }
  if (pose.wristsClose && !opts.oneHand?.match?.(/left|right/)) {
    terms.push(Math.max(0, Math.min(1, 1 - Math.max(0, features.wristDist - 1.1 * scale) / 1.2)));
  }
  if (!terms.length) return 0;
  const mean = terms.reduce((s, t) => s + t, 0) / terms.length;
  // 평균만 쓰면 한 팔이 틀려도 통과하므로 가장 나쁜 항목을 함께 반영한다.
  return 0.6 * mean + 0.4 * Math.min(...terms);
}

const rad = (d) => (d * Math.PI) / 180;

/** 포즈 각도에서 시범용 관절 위치를 계산한다. 게임 화면의 시범 캐릭터가 사용한다. */
export function poseSkeleton(pose, cx, cy, size) {
  const sw = size * 0.42;
  const armU = size * 0.56;
  const armF = size * 0.52;
  const leanRad = rad(pose.lean ?? 0);
  const hip = { x: cx, y: cy + size * 1.1 };
  const neck = { x: hip.x + Math.sin(leanRad) * size * 1.1, y: hip.y - Math.cos(leanRad) * size * 1.1 };
  const arm = (dir, ang) => {
    const shoulder = { x: neck.x + dir * sw, y: neck.y };
    const elbow = { x: shoulder.x + dir * Math.sin(rad(ang[0])) * armU, y: shoulder.y + Math.cos(rad(ang[0])) * armU };
    const wrist = { x: elbow.x + dir * Math.sin(rad(ang[1])) * armF, y: elbow.y + Math.cos(rad(ang[1])) * armF };
    return { shoulder, elbow, wrist };
  };
  return { hip, neck, L: arm(-1, pose.L), R: arm(1, pose.R), head: { x: neck.x + Math.sin(leanRad) * size * 0.45, y: neck.y - Math.cos(leanRad) * size * 0.45 } };
}
