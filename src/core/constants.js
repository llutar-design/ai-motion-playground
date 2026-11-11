// 모든 게임은 1920x1080 논리 좌표에서 동작한다. 실제 화면에는 비율을 유지해 맞춘다.
export const STAGE_W = 1920;
export const STAGE_H = 1080;

export const DIFFICULTY = {
  easy: { id: 'easy', label: '쉬움', size: 1.3, speed: 0.7, spawn: 0.7, tol: 1.3, react: 1.4, bonus: 1, motion: 0.85 },
  normal: { id: 'normal', label: '보통', size: 1, speed: 1, spawn: 1, tol: 1, react: 1, bonus: 1.2, motion: 1 },
  hard: { id: 'hard', label: '어려움', size: 0.8, speed: 1.35, spawn: 1.4, tol: 0.85, react: 0.75, bonus: 1.5, motion: 1.1 },
};

export const PRAISE = {
  great: ['최고야!', '대단해!', '멋진 움직임!', '도전 성공!'],
  retry: ['다시 한번 도전!', '멋진 움직임!'],
  team: ['환상의 팀워크!'],
};

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** 점 (cx,cy)와 선분 (ax,ay)-(bx,by) 사이 거리의 제곱. 빠른 손이 목표를 뛰어넘는 일을 막는다. */
export function segmentDist2(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? clamp(((cx - ax) * dx + (cy - ay) * dy) / len2, 0, 1) : 0;
  const ex = ax + dx * t - cx;
  const ey = ay + dy * t - cy;
  return ex * ex + ey * ey;
}
