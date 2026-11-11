// 실제 Chrome에서 실행하는 통합 테스트.
// [MOCK]  : 모의 관절 데이터. 엔진→게임→점수→UI 경로 검증. 실제 카메라 테스트가 아니다.
// [CAMERA]: Chrome 가상 카메라에 실제 인물 사진을 넣어 getUserMedia + MediaPipe 추론 경로를 검증한다.
//           사람이 실제로 움직이는 웹캠 테스트는 자동화할 수 없어 별도로 수행해야 한다.
import { createServer, preview } from 'vite';
import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installBot } from './bot.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = resolve(root, 'tests/e2e/output');
await mkdir(outDir, { recursive: true });
const only = process.argv[2];

const results = [];
function report(group, name, ok, detail = '') {
  results.push({ group, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${group}] ${name}${detail ? ` - ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// E2E_GPU=1이면 소프트웨어 렌더링 대신 이 PC의 실제 GPU로 측정한다.
const BASE_ARGS = [...(process.env.E2E_GPU ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--autoplay-policy=no-user-gesture-required'];

function watchConsole(page) {
  const errors = [];
  // MediaPipe WASM은 정보성 로그도 stderr(console.error)로 출력하므로 "INFO:" 로그는 오류에서 제외한다.
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('INFO:')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function waitFor(page, fn, arg, timeout = 30000) {
  await page.waitForFunction(fn, arg, { timeout, polling: 100 });
}

const GAME_OPTS = {
  math: { goal: '10', op: 'mixed', level: 'low' },
};

async function launchGame(page, id, extra = {}) {
  await page.evaluate(([gameId, ex, opts]) => {
    const { GAMES, startGame } = window.__amp;
    const G = GAMES.find((x) => x.meta.id === gameId);
    return startGame(G, { difficulty: 'easy', timeLimit: 60, players: G.meta.players[0], nickname: '테스트', options: opts ?? {}, ...ex });
  }, [id, extra, GAME_OPTS[id]]);
  await waitFor(page, () => window.__amp.gm.state === 'playing' && window.__amp.gm.game);
}

async function mockSuite(browser, port) {
  const G = 'MOCK';
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errors = watchConsole(page);
  await page.goto(`http://localhost:${port}/?mock=1`);
  await page.waitForSelector('.card');
  await page.evaluate(() => document.fonts.ready);
  report(G, '메인 화면에 12개 게임 카드 표시', (await page.locator('.card').count()) === 12);
  await page.screenshot({ path: `${outDir}/menu-1920.png` });
  const clipped = await page.evaluate(() => {
    const box = document.querySelector('.menu-foot').getBoundingClientRect();
    return box.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth;
  });
  report(G, '1920x1080에서 잘림 없음', clipped);
  for (const [w, h] of [[1366, 768], [1280, 720]]) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(200);
    const ok = await page.evaluate(() => {
      const overflow = [...document.querySelectorAll('.card')].filter((c) => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1).length;
      return document.querySelector('.menu-foot').getBoundingClientRect().bottom <= innerHeight && overflow === 0;
    });
    report(G, `${w}x${h}에서 메뉴 카드 넘침 없음`, ok);
    await page.screenshot({ path: `${outDir}/menu-${w}.png` });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(installBot);

  const games = await page.evaluate(() => window.__amp.GAMES.map((g) => g.meta.id));
  const filtered = only ? games.filter((g) => g === only) : games;
  for (const id of filtered) {
    const before = errors.length;
    if (id === 'balloon') {
      // 준비 화면 캡처를 위해 첫 게임은 캘리브레이션 중간 모습을 저장한다.
      page.evaluate(() => { window.__calibShot = true; });
    }
    await launchGame(page, id);
    await page.evaluate((gid) => {
      const g = window.__amp.gm.game;
      if (gid === 'math') g.total = 3;
      if (gid === 'rhythm') { g.notes = g.notes.slice(0, 5); g.total = 5; g.endAt = g.notes[4].t + 1; }
      if (gid === 'robot') g.levelIndex = 8;
    }, id);
    await sleep(id === 'rhythm' ? 2800 : 3500);
    await page.screenshot({ path: `${outDir}/game-${id}.png` });
    await page.evaluate((gid) => {
      const g = window.__amp.gm.game;
      if (g && g.timed && !['treasure', 'coop', 'math'].includes(gid)) g.timeLeft = Math.min(g.timeLeft, 4);
    }, id);
    try {
      const limit = { rhythm: 20000, coop: 45000, robot: 30000, treasure: 40000, math: 25000 }[id] ?? 15000;
      await waitFor(page, () => document.querySelector('[data-testid=results]'), undefined, limit);
    } catch {
      const st = await page.evaluate(() => ({ state: window.__amp.gm.state, score: window.__amp.gm.game?.score }));
      report(G, `${id}: 끝까지 플레이`, false, JSON.stringify(st));
      await page.evaluate(() => window.__amp.gm.exitToMenu());
      continue;
    }
    const score = Number(await page.locator('[data-testid=final-score]').textContent());
    const saved = await page.evaluate((gid) => JSON.parse(localStorage.getItem('amp.scores.v1'))[gid]?.best ?? 0, id);
    const clean = await page.evaluate(() => window.__amp.engine.targets.length === 0 && window.__amp.engine.poseWatch === null && window.__amp.gm.game === null);
    report(G, `${id}: 플레이 후 점수 획득`, score > 0, `score=${score}`);
    report(G, `${id}: 최고 기록 저장`, saved === score || saved > 0, `best=${saved}`);
    report(G, `${id}: 종료 후 리소스 정리`, clean);
    report(G, `${id}: 콘솔 오류 없음`, errors.length === before, errors.slice(before).join(' | '));
    await page.screenshot({ path: `${outDir}/result-${id}.png` });
    await page.evaluate(() => window.__amp.gm.ui.showMenu());
  }
  if (only) { await ctx.close(); return; }

  // 인식 손실 시 점수 방지와 안전 일시정지
  await launchGame(page, 'balloon');
  const lostResult = await page.evaluate(async () => {
    const { gm } = window.__amp;
    const bot = window.__bot;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(800);
    bot.visibility = 0.42; // 손목 신뢰도가 기준 미달
    bot.override = { handR: { x: 960, y: 500 } };
    await wait(300);
    const s0 = gm.game.score;
    const p0 = gm.game.popped;
    gm.game.timers.spawn = -1000; // 새 풍선이 끼어들지 않게 한다.
    gm.game.balloons = [];
    for (let i = 0; i < 8; i++) gm.game.balloons.push({ x: 960, y: 500, r: 90, kind: 'normal', color: '#f00', vy: 0, sway: 0 });
    await wait(700);
    const lowConfScore = gm.game.score - s0;
    bot.visibility = 0.95;
    await wait(900);
    const popped = gm.game.popped - p0;
    bot.override = null;
    return { lowConfScore, popped, left: gm.game.balloons.length };
  });
  report(G, '신뢰도 낮은 손은 점수를 내지 않음', lostResult.lowConfScore === 0, JSON.stringify(lostResult));
  report(G, '풍선 8개를 손에 계속 대도 각 1회씩만 터짐', lostResult.popped === 8 && lostResult.left === 0, JSON.stringify(lostResult));

  const lost = await page.evaluate(async () => {
    const { gm } = window.__amp;
    const bot = window.__bot;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    bot.mode = 'silent';
    await wait(2500);
    const state = gm.state;
    const shown = !!document.querySelector('[data-testid=lost]');
    const scoreAtLost = gm.game.score;
    const timeAtLost = gm.game.timeLeft;
    await wait(600);
    const frozen = gm.game.timeLeft === timeAtLost && gm.game.score === scoreAtLost;
    bot.mode = 'auto';
    await wait(1500);
    const resuming = gm.state;
    await wait(3200);
    return { state, shown, frozen, resuming, after: gm.state };
  });
  report(G, '추적 끊김 시 안전 일시정지', lost.state === 'lost' && lost.shown, JSON.stringify(lost));
  report(G, '일시정지 중 시간과 점수 고정', lost.frozen);
  report(G, '재인식 시 이어하기', lost.resuming === 'resuming' && lost.after === 'playing');

  await page.click('[data-testid=pause-btn]');
  const paused = await page.evaluate(() => [window.__amp.gm.state, !!document.querySelector('[data-testid=pause]')]);
  report(G, '일시정지 버튼 동작', paused[0] === 'paused' && paused[1]);
  await page.click('[data-testid=pause] button.go');
  await waitFor(page, () => window.__amp.gm.state === 'playing', undefined, 6000);
  report(G, '일시정지 후 재개', true);
  await page.evaluate(() => window.__amp.gm.exitToMenu());
  await page.waitForSelector('.card');

  // 난이도 반영
  const diff = {};
  for (const d of ['easy', 'hard']) {
    await launchGame(page, 'balloon', { difficulty: d });
    diff[d] = await page.evaluate(async () => {
      const g = window.__amp.gm.game;
      g.spawn();
      return { r: g.balloons[0].r, vy: g.balloons[0].vy, d: g.d.id };
    });
    await page.evaluate(() => window.__amp.gm.exitToMenu());
    await page.waitForSelector('.card');
  }
  report(G, '난이도: 쉬움은 크고 느리다', diff.easy.r > diff.hard.r && diff.easy.vy < diff.hard.vy, JSON.stringify(diff));

  // 2인 추적
  await launchGame(page, 'balloon', { players: 2 });
  const two = await page.evaluate(async () => {
    const { engine } = window.__amp;
    await new Promise((r) => setTimeout(r, 500));
    return { n: engine.players.length, a: engine.players[0].center.x, b: engine.players[1].center.x, tracked: engine.players.every((p) => p.tracked) };
  });
  report(G, '2인 모드 슬롯 유지(P1 왼쪽, P2 오른쪽)', two.n === 2 && two.a < two.b && two.tracked, JSON.stringify(two));
  await page.evaluate(() => window.__amp.gm.exitToMenu());
  await page.waitForSelector('.card');
  await page.evaluate(() => window.__amp.engine.setPlayerCount(1));

  // 2인 게임 중 한 명을 놓쳤을 때 1인으로 이어하기
  await launchGame(page, 'coop', { players: 2 });
  await page.evaluate(() => { window.__bot.mode = 'silent'; });
  await page.waitForSelector('[data-testid=lost]', { timeout: 6000 });
  await page.screenshot({ path: `${outDir}/lost-overlay.png` });
  await page.locator('[data-testid=lost] button.primary').click();
  await page.evaluate(() => { window.__bot.mode = 'auto'; });
  await waitFor(page, () => window.__amp.gm.state === 'playing', undefined, 9000);
  const solo = await page.evaluate(() => window.__amp.engine.players.length);
  report(G, '2인 추적 실패 시 1인으로 전환 후 이어하기', solo === 1, `players=${solo}`);
  await page.evaluate(() => window.__amp.gm.exitToMenu());
  await page.waitForSelector('.card');

  // 접근성 모드로 준비 단계를 통과하는지 확인
  await page.evaluate(() => { const { settings, gm } = window.__amp; settings.patch({ seated: true, smallMotion: true, oneHand: 'right' }); gm.lastCalibAt = -Infinity; });
  await page.evaluate(() => window.__amp.engine.clearCalibration());
  await launchGame(page, 'balloon');
  const access = await page.evaluate(async () => {
    const { engine } = window.__amp;
    await new Promise((r) => setTimeout(r, 300));
    return { cfg: engine.cfg, leftActive: engine.players[0].hands.left.visible };
  });
  report(G, '앉아서·작은 움직임·한 손 모드로 시작', access.cfg.seated && access.cfg.smallMotion && !access.leftActive, JSON.stringify(access.cfg));
  await page.evaluate(() => { const { settings, gm } = window.__amp; settings.patch({ seated: false, smallMotion: false, oneHand: 'off' }); gm.exitToMenu(); });
  await page.waitForSelector('.card');

  // 패널 UI, 관리자 설정 저장
  await page.getByRole('button', { name: '관리자 설정' }).click();
  await page.waitForSelector('[data-testid=admin]');
  await page.screenshot({ path: `${outDir}/admin.png` });
  await page.getByLabel('풍선 팡팡! 활성화').uncheck();
  await page.getByRole('button', { name: '예시 넣기' }).click();
  await page.getByRole('button', { name: '문제 저장' }).click();
  await page.locator('[data-testid=admin] .panel-head button').click();
  const cards = await page.locator('.card').count();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('amp.settings.v1')));
  report(G, '관리자: 게임 비활성화가 메뉴에 반영', cards === 11, `cards=${cards}`);
  report(G, '관리자: localStorage에 저장', stored.perGame.balloon.enabled === false && stored.customMath.length === 2);
  await page.reload();
  await page.waitForSelector('.card');
  report(G, '관리자: 새로고침 후 유지', (await page.locator('.card').count()) === 11);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('amp.settings.v1')); delete s.perGame.balloon; localStorage.setItem('amp.settings.v1', JSON.stringify(s)); });
  await page.reload();
  await page.waitForSelector('.card');

  for (const name of ['게임 방법', '사운드 설정', '안전 안내']) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForSelector('.modal-bg .panel');
    await page.screenshot({ path: `${outDir}/panel-${name.replace(' ', '')}.png` });
    await page.locator('.panel-head button').click();
  }
  report(G, '게임 방법·사운드·안전 안내 패널 열림', true);

  await page.getByRole('button', { name: '전체 화면' }).click();
  await sleep(500);
  const fs = await page.evaluate(() => !!document.fullscreenElement);
  report(G, '전체 화면 전환', fs);
  if (fs) await page.evaluate(() => document.exitFullscreen());

  const audio = await page.evaluate(async () => {
    const { audio: a, settings } = window.__amp;
    a.unlock();
    await a.ctx.resume();
    const t0 = a.ctx.currentTime;
    a.sfx('pop');
    await new Promise((r) => setTimeout(r, 1200));
    settings.set('sound', false);
    const off = a.master.gain.value;
    settings.set('sound', true);
    return { state: a.ctx.state, advanced: a.ctx.currentTime > t0, off, on: a.master.gain.value };
  });
  report(G, '오디오 재생 및 소리 끄기', audio.state === 'running' && audio.advanced && audio.off === 0 && audio.on === 1, JSON.stringify(audio));

  // 마우스 대체 조작
  await page.evaluate(() => { window.__amp.settings.set('inputMode', 'mouse'); });
  await page.locator('.card[data-game=star] button').click();
  await page.click('[data-testid=go]');
  await waitFor(page, () => window.__amp.gm.state === 'playing' && window.__amp.input.mode === 'mouse', undefined, 8000);
  await page.evaluate(() => { window.__amp.gm.game.stars.push({ sx: 960, sy: 500, tx: 960, ty: 500, x: 960, y: 500, r: 100, full: 100, gold: false, fly: 1, life: 5, spin: 0 }); });
  const box = await page.locator('#stage').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5 - 40, box.y + box.height * 0.463);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.463, { steps: 4 });
  await sleep(400);
  const mouseScore = await page.evaluate(() => window.__amp.gm.game.score);
  report(G, '마우스 대체 조작으로 점수 획득', mouseScore > 0, `score=${mouseScore}`);
  await page.evaluate(() => window.__amp.gm.exitToMenu());

  report(G, '전체 흐름 콘솔 오류 없음', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

async function cameraSuite(port, label, opts = {}) {
  const fixture = resolve(outDir, 'person.mjpeg');
  const jpg = await readFile(resolve(root, 'tests/fixtures/person-720p.jpg'));
  await writeFile(fixture, Buffer.concat(Array(30).fill(jpg)));
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [...BASE_ARGS, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${fixture}`],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const errors = watchConsole(page);
  const external = [];
  page.on('request', (r) => { if (!r.url().startsWith(`http://localhost:${port}`) && !/^(data|blob):/.test(r.url())) external.push(r.url()); });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('.card');

  await page.getByRole('button', { name: '몸동작 테스트' }).click();
  await page.waitForSelector('[data-testid=privacy]');
  report(label, '권한 요청 전 안내 표시', true);
  await page.getByRole('button', { name: '알겠어요, 카메라 켜기' }).click();
  await page.waitForSelector('[data-testid=test-panel]', { timeout: 120000 });
  report(label, '카메라 연결 및 MediaPipe 모델 3종 로드', true);
  report(label, '카메라 켜짐 표시', await page.locator('[data-testid=cam-pill].on').isVisible());
  try {
    await page.waitForFunction(() => document.querySelector('[data-testid=stats]')?.textContent.includes('인식 중'), undefined, { timeout: 45000, polling: 200 });
    report(label, '실제 인물 사진에서 MediaPipe가 사람을 인식', true);
  } catch { report(label, '실제 인물 사진에서 MediaPipe가 사람을 인식', false); }
  await sleep(6000);
  const stats = await page.locator('[data-testid=stats]').textContent();
  console.log(`  측정값(${process.env.E2E_GPU ? '이 PC의 GPU' : '소프트웨어 렌더링'}, 헤드리스): ${stats}`);
  await page.screenshot({ path: `${outDir}/camera-test-${label}.png` });

  if (opts.devHooks) {
    const real = await page.evaluate(() => {
      const { engine } = window.__amp;
      const p = engine.players[0];
      return { conf: p.confidence, lms: p.landmarks?.length, delegate: window.__amp.input.stats.delegate, track: window.__amp.camera.stream?.getVideoTracks()[0].readyState };
    });
    report(label, '실제 관절 33개 수신', real.lms === 33 && real.conf > 0.4, JSON.stringify(real));
    // 테스트 사진의 인물은 양팔을 수평으로 벌리고 있다. 실제 모델 출력이 엔진의 포즈 판정까지 이어지는지 확인한다.
    const photo = await page.evaluate(async () => {
      const { POSES } = await import('/src/core/PoseLibrary.js');
      const { engine } = window.__amp;
      engine.calibrate();
      engine.watchPose(POSES.arms_out, { hold: 300 });
      await new Promise((r) => setTimeout(r, 5000));
      const p = engine.players[0];
      const out = { armsOut: p.poseScore, done: p.poseDone, lx: p.hands.left.tx, rx: p.hands.right.tx, lVis: p.hands.left.visible, rVis: p.hands.right.visible, tracked: p.tracked };
      engine.watchPose(POSES.both_up, { hold: 300 });
      await new Promise((r) => setTimeout(r, 3000));
      out.bothUp = engine.players[0].poseScore;
      out.bothDone = engine.players[0].poseDone;
      engine.clearPoseWatch();
      return out;
    });
    report(label, '실제 추론: 양팔 벌리기 포즈 판정 성공', photo.done && photo.armsOut >= 0.68, JSON.stringify(photo));
    report(label, '실제 추론: 다른 포즈(양손 번쩍)는 불일치', !photo.bothDone);
    report(label, '실제 추론: 양손이 화면 좌우 바깥으로 매핑', photo.lVis && photo.rVis && Math.abs(photo.lx - photo.rx) > 900);
    const devices = await page.evaluate(() => window.__amp.camera.listDevices());
    report(label, '카메라 목록 조회', devices.length > 0, `${devices.length}개`);
    const reconnect = await page.evaluate(async () => {
      const { camera } = window.__amp;
      const track = camera.stream.getVideoTracks()[0];
      camera.disconnect();
      const stopped = track.readyState === 'ended' && camera.video.srcObject === null;
      const ok = await camera.connect({ resolution: '640x480' });
      return { stopped, ok, live: camera.stream.getVideoTracks()[0].readyState };
    });
    report(label, '연결 해제 시 영상 트랙 정지', reconnect.stopped, JSON.stringify(reconnect));
    report(label, '카메라 재연결', reconnect.ok && reconnect.live === 'live');
    const framesCheck = await page.evaluate(async () => {
      const { engine } = window.__amp;
      const a = engine.players[0].lastSeen;
      await new Promise((r) => setTimeout(r, 2500));
      return engine.players[0].lastSeen > a;
    });
    report(label, '재연결 후 추론 재개', framesCheck);
  }

  await page.locator('[data-testid=test-panel] .panel-head button').click();
  await page.locator('[data-testid=cam-pill] button').click();
  report(label, '끄기 버튼으로 카메라 표시 해제', !(await page.locator('[data-testid=cam-pill].on').isVisible()));
  report(label, '외부 네트워크 요청 없음', external.length === 0, external.slice(0, 3).join(', '));
  const csp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? '');
  if (opts.expectCsp) report(label, 'CSP로 외부 전송 차단 설정', csp.includes("connect-src 'self'"));
  report(label, '콘솔 오류 없음', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
}

let failed = false;
const dev = await createServer({ root, server: { port: 5199, strictPort: true }, logLevel: 'error' });
await dev.listen();
const prev = await preview({ root, preview: { port: 5198, strictPort: true }, logLevel: 'error' });
try {
  if (process.argv[2] !== 'camera') {
    const browser = await chromium.launch({ channel: 'chrome', headless: true, args: BASE_ARGS });
    await mockSuite(browser, 5199);
    await browser.close();
  }
  if (!only || only === 'camera') {
    await cameraSuite(5199, 'CAMERA-dev', { devHooks: true });
    await cameraSuite(5198, 'CAMERA-prod', { expectCsp: true });
  }
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  await dev.close();
  await prev.close();
}
const fails = results.filter((r) => !r.ok);
const summary = `합계 ${results.length} / 통과 ${results.length - fails.length} / 실패 ${fails.length}`;
console.log(`\n${summary}`);
await writeFile(resolve(outDir, 'results.json'), JSON.stringify(results, null, 2));
process.exit(failed || fails.length ? 1 : 0);
