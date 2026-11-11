import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionEngine, LOST_MS } from '../../src/core/MotionEngine.js';
import { POSES, scorePose } from '../../src/core/PoseLibrary.js';
import { makePose, feed } from '../../src/testing/mockPose.js';

const aspect = 16 / 9;
const pose = (o) => ({ poses: [makePose(o)], aspect });

function ready(cfg) {
  const e = new MotionEngine(cfg);
  const r = feed(e, () => pose({}), { ms: 400 });
  e.calibrate();
  return { e, t: r.time };
}
const count = (events, type) => events.filter((v) => v.type === type).length;

test('왼손을 들면 LEFT_HAND_UP이 한 번만 발생하고 필수 필드를 포함한다', () => {
  const { e, t } = ready();
  const { events } = feed(e, () => pose({ L: [172, 176] }), { from: t, ms: 2000 });
  assert.equal(count(events, 'LEFT_HAND_UP'), 1);
  assert.equal(count(events, 'RIGHT_HAND_UP'), 0);
  const ev = events.find((v) => v.type === 'LEFT_HAND_UP');
  assert.equal(ev.playerId, 0);
  assert.ok(ev.confidence > 0.5);
  assert.equal(typeof ev.time, 'number');
  assert.equal(typeof ev.position.x, 'number');
});

test('손을 내렸다 다시 들어야 이벤트가 재발생한다', () => {
  const { e, t } = ready();
  const a = feed(e, () => pose({ R: [172, 176] }), { from: t, ms: 800 });
  const b = feed(e, () => pose({}), { from: a.time, ms: 600 });
  const c = feed(e, () => pose({ R: [172, 176] }), { from: b.time, ms: 800 });
  assert.equal(count(a.events, 'RIGHT_HAND_UP'), 1);
  assert.equal(count(c.events, 'RIGHT_HAND_UP'), 1);
});

test('유지 시간보다 짧은 깜빡임은 이벤트가 되지 않는다', () => {
  const { e, t } = ready();
  const { events } = feed(e, (now) => pose({ L: now - t < 66 ? [172, 176] : [8, 4] }), { from: t, ms: 800 });
  assert.equal(count(events, 'LEFT_HAND_UP'), 0);
});

test('신뢰도가 낮으면 손이 비활성이고 이벤트가 없다', () => {
  const { e, t } = ready();
  const { events } = feed(e, () => pose({ L: [172, 176], R: [172, 176], visibility: 0.45 }), { from: t, ms: 800 });
  assert.equal(e.players[0].hands.left.active, false);
  assert.equal(events.filter((v) => /HAND_UP/.test(v.type)).length, 0);
});

test('체형이 달라도 같은 자세는 같은 무대 좌표로 변환된다', () => {
  const at = (unit) => {
    const e = new MotionEngine();
    const make = () => pose({ unit, handL: { x: 400, y: 300 }, handR: { x: 1500, y: 300 } });
    const r = feed(e, make, { ms: 300 });
    e.calibrate();
    feed(e, make, { from: r.time, ms: 700 });
    return e.players[0].hands;
  };
  const small = at(0.12);
  const large = at(0.26);
  assert.ok(Math.abs(small.left.x - large.left.x) < 30, `${small.left.x} vs ${large.left.x}`);
  assert.ok(Math.abs(small.right.y - large.right.y) < 30);
});

test('거울 모드에서 플레이어의 왼손은 화면 왼쪽에 나타난다', () => {
  const e = new MotionEngine({ mirror: true });
  feed(e, () => pose({ handL: { x: 300, y: 300 }, handR: { x: 1600, y: 300 } }), { ms: 700 });
  const { left, right } = e.players[0].hands;
  assert.ok(left.x < 960 && right.x > 960, `L=${left.x} R=${right.x}`);
  assert.ok(Math.abs(left.x - 300) < 40);
});

test('거울을 끄면 원본 카메라 좌표 방향을 그대로 사용한다', () => {
  const e = new MotionEngine({ mirror: false });
  feed(e, () => pose({ mirror: false, handL: { x: 300, y: 300 }, handR: { x: 1600, y: 300 } }), { ms: 700 });
  assert.ok(e.players[0].hands.left.x < 960);
});

test('작은 흔들림은 레인을 바꾸지 않고 큰 이동은 레인을 바꾼다', () => {
  const { e, t } = ready();
  const a = feed(e, (n) => pose({ cx: aspect / 2 + Math.sin(n / 90) * 0.03 }), { from: t, ms: 1200 });
  assert.equal(e.players[0].body.lane, 0);
  assert.equal(count(a.events, 'MOVE_LEFT') + count(a.events, 'MOVE_RIGHT'), 0);
  const b = feed(e, () => pose({ cx: aspect / 2 - 0.2 }), { from: a.time, ms: 700 });
  assert.equal(e.players[0].body.lane, -1);
  assert.equal(count(b.events, 'MOVE_LEFT'), 1);
});

test('추적이 끊기면 손이 비활성화되고 일정 시간 후 lost가 된다', () => {
  const { e, t } = ready();
  feed(e, () => pose({ handL: { x: 400, y: 300 } }), { from: t, ms: 500 });
  const start = t + 500;
  let st = e.tick(0.016, start + 400);
  assert.equal(st.players[0].tracked, false);
  assert.equal(st.players[0].hands.left.active, false);
  assert.equal(st.anyLost, false);
  st = e.tick(0.016, start + LOST_MS + 100);
  assert.equal(st.anyLost, true);
});

test('비정상적인 순간 이동은 활성 손 궤적으로 쓰이지 않는다', () => {
  const { e, t } = ready();
  const a = feed(e, () => pose({ handL: { x: 300, y: 300 } }), { from: t, ms: 500 });
  e.ingest({ time: a.time, ...pose({ handL: { x: 1800, y: 200 } }) });
  const h = e.tick(0.033, a.time).players[0].hands.left;
  assert.equal(h.glitch, true);
  assert.equal(h.active, false);
  assert.ok(Math.abs(h.x - 300) < 60, `jumped to ${h.x}`);
});

test('2인 추적: 교차 프레임 순서가 바뀌어도 ID가 유지된다', () => {
  const e = new MotionEngine();
  e.setPlayerCount(2);
  const a = () => makePose({ cx: 0.45, unit: 0.15 });
  const b = () => makePose({ cx: 1.3, unit: 0.15 });
  let t = 0;
  for (let i = 0; i < 40; i++, t += 33) {
    e.ingest({ time: t, poses: i % 2 ? [a(), b()] : [b(), a()], aspect });
    e.tick(0.033, t);
    assert.ok(e.players[0].center.x < e.players[1].center.x, `frame ${i}`);
  }
});

test('2인 추적: 한 명이 잠시 사라져도 슬롯이 유지된다', () => {
  const e = new MotionEngine();
  e.setPlayerCount(2);
  let t = 0;
  for (let i = 0; i < 20; i++, t += 33) {
    e.ingest({ time: t, poses: [makePose({ cx: 0.45, unit: 0.15 }), makePose({ cx: 1.3, unit: 0.15 })], aspect });
    e.tick(0.033, t);
  }
  for (let i = 0; i < 15; i++, t += 33) {
    e.ingest({ time: t, poses: [makePose({ cx: 1.3, unit: 0.15 })], aspect });
    e.tick(0.033, t);
  }
  assert.ok(e.players[1].tracked);
  assert.equal(e.players[0].tracked, false);
  assert.ok(e.players[1].center.x > 1);
});

test('대상 위에 머무르면 REACH_TARGET이 한 번만 발생한다', () => {
  const { e, t } = ready();
  e.setTargets([{ id: 'a', x: 500, y: 300, r: 120, dwell: 400 }]);
  const { events } = feed(e, () => pose({ handL: { x: 500, y: 300 } }), { from: t, ms: 1500 });
  assert.equal(count(events, 'REACH_TARGET'), 1);
  assert.equal(events.find((v) => v.type === 'REACH_TARGET').targetId, 'a');
});

test('POSE_MATCH는 유지 시간을 채워야 하고 틀린 포즈로는 발생하지 않는다', () => {
  const { e, t } = ready();
  e.watchPose(POSES.arms_out, { hold: 600 });
  const wrong = feed(e, () => pose({ L: [172, 176], R: [172, 176] }), { from: t, ms: 1200 });
  assert.equal(count(wrong.events, 'POSE_MATCH'), 0);
  const right = feed(e, () => pose({ L: [90, 90], R: [90, 90] }), { from: wrong.time, ms: 1200 });
  assert.equal(count(right.events, 'POSE_MATCH'), 1);
});

test('포즈 라이브러리: 각 포즈는 자기 각도에서 높은 점수를 받는다', () => {
  for (const p of Object.values(POSES)) {
    const e = new MotionEngine();
    const r = feed(e, () => pose({}), { ms: 300 });
    e.calibrate();
    feed(e, () => pose({ L: p.L, R: p.R, lean: p.lean ?? 0 }), { from: r.time, ms: 700 });
    const f = e.players[0].features;
    if (p.wristsClose) f.wristDist = 0.5;
    assert.ok(scorePose(f, p) > 0.85, `${p.id}: ${scorePose(f, p)}`);
  }
});

test('한 손 모드는 지정한 손만 활성화한다', () => {
  const e = new MotionEngine({ oneHand: 'right' });
  feed(e, () => pose({ handL: { x: 400, y: 300 }, handR: { x: 1500, y: 300 } }), { ms: 700 });
  assert.equal(e.players[0].hands.left.active, false);
  assert.equal(e.players[0].hands.right.active, true);
});

test('작은 움직임 모드는 같은 동작을 더 크게 매핑한다', () => {
  const run = (smallMotion) => {
    const e = new MotionEngine({ smallMotion });
    feed(e, () => pose({ handR: { x: 1200, y: 400 } }), { ms: 700 });
    return e.players[0].hands.right.x;
  };
  assert.ok(run(true) > run(false) + 100);
});

test('손 흔들기는 왕복 후 HAND_SWING을 발생시킨다', () => {
  const { e, t } = ready();
  const { events } = feed(e, (n) => pose({ handR: { x: 1400 + Math.sin(n / 110) * 300, y: 350 } }), { from: t, ms: 1400 });
  assert.ok(count(events, 'HAND_SWING') >= 1);
});

test('양손 들기는 BOTH_HANDS_UP으로 인식되고 한손 이벤트로 중복되지 않는다', () => {
  const { e, t } = ready();
  const { events } = feed(e, () => pose({ L: [172, 176], R: [172, 176] }), { from: t, ms: 900 });
  assert.equal(count(events, 'BOTH_HANDS_UP'), 1);
  assert.equal(count(events, 'LEFT_HAND_UP'), 0);
});

test('resetForGame은 이전 게임의 이벤트와 목표를 지우지만 보정값은 유지한다', () => {
  const { e, t } = ready();
  e.setTargets([{ id: 'x', x: 1, y: 1, r: 1 }]);
  feed(e, () => pose({ L: [172, 176] }), { from: t, ms: 300 });
  e.resetForGame();
  assert.equal(e.targets.length, 0);
  assert.equal(e.pending.length, 0);
  assert.ok(e.players[0].calib);
});
