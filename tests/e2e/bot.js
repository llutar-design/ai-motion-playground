// 브라우저 안에서 실행되는 모의 플레이어. 게임 상태를 읽어 관절 좌표를 만들어 MotionEngine에 넣는다.
// 실제 카메라 테스트를 대체하지 않으며, 엔진-게임-점수 경로를 검증하기 위한 것이다.
export async function installBot() {
  const { makePose } = await import('/src/testing/mockPose.js');
  const amp = window.__amp;
  const aspect = 16 / 9;
  const REST = { L: [8, 4], R: [8, 4] };
  const nearest = (list, x = 960) => list.reduce((b, o) => (!b || Math.abs(o.x - x) < Math.abs(b.x - x) ? o : b), null);
  const oneHand = (t, jitter = 0, now = 0) => (t ? { handR: { x: t.x + Math.sin(now / 35) * jitter, y: t.y + Math.cos(now / 45) * jitter } } : REST);

  const bots = {
    balloon: (g) => oneHand(nearest(g.balloons.filter((b) => b.kind !== 'hazard' && b.y < 950 && b.y > 120))),
    star: (g) => oneHand(nearest(g.stars.filter((s) => s.fly > 0.6))),
    dodge(g) {
      const danger = [-1, 0, 1].filter((l) => g.objects.some((o) => o.kind === 'rock' && o.lane === l && o.z > 0.45 && o.z < 1.02));
      const safe = [0, -1, 1].find((l) => !danger.includes(l)) ?? 0;
      return { cx: aspect / 2 + safe * 0.26 };
    },
    pose: (g) => (g.pose ? { L: g.pose.L, R: g.pose.R, lean: g.pose.lean ?? 0 } : REST),
    robot: (g) => { const p = g.currentPose; return p ? { L: p.L, R: p.R, lean: p.lean ?? 0 } : REST; },
    fruit: (g, now) => oneHand(nearest(g.items.filter((f) => f.kind !== 'bomb' && f.rose && f.y < 1000)), 90, now),
    shield: (g) => oneHand(g.balls.reduce((b, o) => (!b || o.y > b.y ? o : b), null)),
    fish: (g) => oneHand(nearest(g.creatures.filter((c) => c.kind !== 'jelly' && c.x > 60 && c.x < 1860))),
    math(g) {
      const t = g.targets?.find((x) => x.value === g.current.answer && !x.disabled);
      return t && !g.feedback ? { handR: { x: t.x, y: t.y } } : REST;
    },
    treasure(g, now) {
      const item = g.items.find((i) => !i.found);
      return item ? { handR: { x: item.x + Math.sin(now / 130) * 130, y: item.y + Math.cos(now / 90) * 130 } } : REST;
    },
    rhythm(g) {
      const now = g.now ?? 0;
      const n = g.notes.find((x) => !x.done && now > x.t - 0.08 && now < x.t + 0.25);
      if (!n) return REST;
      const UP = [172, 176];
      return { L: n.kind !== 'R' ? UP : REST.L, R: n.kind !== 'L' ? UP : REST.R };
    },
  };

  const coop = (g, side) => {
    const pad = g.pads?.[side];
    if (pad) return { x: pad.x, y: pad.y };
    return g.stars[side][0] ?? null;
  };

  const state = { mode: 'auto', visibility: 0.95, override: null, frames: 0 };
  window.__bot = state;

  function calibFrame(c, aspectX) {
    const id = c.step?.id;
    if (id === 'hands') return { L: [172, 176], R: [172, 176] };
    if (id === 'move') return { cx: aspectX + (c.moveStage === 0 ? -0.26 : 0.26) };
    return {};
  }

  setInterval(() => {
    if (state.mode === 'silent') return;
    const { gm, engine } = amp;
    const now = performance.now();
    const twoPlayers = engine.players.length === 2;
    const poses = [];
    if (twoPlayers) {
      const unit = 0.15;
      const calib = gm.state === 'calibrating' ? calibFrame(gm.calib, 0) : {};
      const g = gm.game;
      const handsFor = (side) => {
        if (!(g?.meta.id === 'coop') || gm.state !== 'playing') return calib.L ? { L: calib.L, R: calib.R } : REST;
        const t = coop(g, side);
        return t ? { handR: { x: t.x, y: t.y } } : REST;
      };
      poses.push(makePose({ cx: 0.45, unit, zone: { x: 0, w: 960 }, visibility: state.visibility, ...handsFor(0) }));
      poses.push(makePose({ cx: 1.33, unit, zone: { x: 960, w: 960 }, visibility: state.visibility, ...handsFor(1) }));
    } else {
      let spec = {};
      if (state.override) spec = state.override;
      else if (gm.state === 'calibrating') spec = calibFrame(gm.calib, aspect / 2);
      else if (gm.game && gm.state === 'playing') spec = bots[gm.game.meta.id]?.(gm.game, now) ?? {};
      poses.push(makePose({ visibility: state.visibility, ...spec }));
    }
    engine.ingest({ time: now, poses, aspect });
    state.frames += 1;
  }, 33);
}
