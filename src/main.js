import '@fontsource/jua/index.css';
import './styles.css';
import { SettingsManager } from './core/SettingsManager.js';
import { ScoreManager } from './core/ScoreManager.js';
import { CameraManager } from './core/CameraManager.js';
import { MotionEngine } from './core/MotionEngine.js';
import { InputManager } from './core/InputManager.js';
import { AudioManager } from './core/AudioManager.js';
import { GameManager } from './core/GameManager.js';
import { GAMES } from './core/GameRegistry.js';
import { PRAISE } from './core/constants.js';
import { h } from './components/dom.js';
import { MenuScreen } from './components/MenuScreen.js';
import { PrivacyModal, LoadingModal, ErrorModal, SafetyPanel, HowToPanel, SoundPanel, CameraPanel, TestPanel } from './components/Panels.js';
import { AdminPanel } from './components/AdminPanel.js';
import { ReadyPanel, ResultsScreen, PauseOverlay, LostOverlay } from './components/GameFlow.js';

const IDLE_CAMERA_OFF_MS = 5 * 60 * 1000;
const isMock = import.meta.env.DEV && new URLSearchParams(location.search).has('mock');

const root = document.getElementById('ui');
const canvas = document.getElementById('stage');

const settings = new SettingsManager();
const scores = new ScoreManager();
const camera = new CameraManager();
const engine = new MotionEngine();
const input = new InputManager(engine, camera);
const audio = new AudioManager(settings);

// 화면 레이어
let menuEl = null;
let dialogEl = null;
let lastActivity = performance.now();

function setDialog(el) {
  dialogEl?.remove();
  dialogEl = el;
  if (el) root.append(el);
}

function showMenuScreen() {
  setDialog(null);
  canvas.classList.remove('show');
  menuEl?.remove();
  menuEl = MenuScreen({ settings, onStart: openReady, onPanel: openPanel, onFullscreen: toggleFullscreen });
  root.prepend(menuEl);
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => toast('이 브라우저에서는 전체 화면을 쓸 수 없어요.'));
}

function toast(message) {
  const el = h('div.toast', { role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
}

// 카메라 켜짐 표시: 화면과 상관없이 항상 보이며 바로 끌 수 있다.
const camPill = h('div.cam-pill', { 'data-testid': 'cam-pill' }, h('i'), '카메라 켜짐 · 영상은 이 기기 안에서만 처리돼요',
  h('button', { type: 'button', onclick: () => { camera.disconnect(); } }, '끄기'));
document.body.append(camPill);
camera.subscribe((state) => {
  camPill.classList.toggle('on', state === 'connected');
  if (state === 'error' && gm.state !== 'idle' && input.mode === 'camera') toast(camera.errorText);
});

const gameCtl = h('div.game-ctl', null, h('button', { type: 'button', onclick: () => gm.pause(), 'data-testid': 'pause-btn' }, '멈춤'));
const skipBtn = h('button', { type: 'button', hidden: true, onclick: () => gm.skipCalibStep() }, '이 단계 건너뛰기');
const soloBtn = h('button', { type: 'button', hidden: true, onclick: () => gm.calibToSolo() }, '혼자 할게요(1인)');
const calibCtl = h('div.calib-ctl', null, skipBtn, soloBtn, h('button', { type: 'button', onclick: () => gm.exitToMenu() }, '취소'));
root.append(gameCtl, calibCtl);

const ui = {
  showMenu: showMenuScreen,
  toast,
  showHud(on) { gameCtl.classList.toggle('show', on); },
  showCalibration(on) {
    calibCtl.classList.toggle('show', on);
    if (on) { canvas.classList.add('show'); menuEl?.remove(); menuEl = null; setDialog(null); }
  },
  updateCalibration(calib) {
    skipBtn.hidden = !calib.canSkip;
    soloBtn.hidden = !calib.waitingSecond;
  },
  showResults(GameClass, summary, opts) {
    setDialog(ResultsScreen({ GameClass, summary, onRetry: () => gm.launch(GameClass, { ...opts, quickRestart: true }), onMenu: showMenuScreen }));
  },
  showPause() {
    setDialog(PauseOverlay({ onResume: () => gm.resume(), onRetry: () => gm.retry(), onExit: () => gm.exitToMenu() }));
  },
  showLost({ canGoSolo }) {
    setDialog(LostOverlay({ canGoSolo, onSolo: () => gm.continueSolo(), onExit: () => gm.exitToMenu() }));
  },
  hideOverlay() { setDialog(null); },
  onFrame(motion, dt) { dialogEl?.onFrame?.(motion, dt); },
};

const gm = new GameManager({ canvas, engine, camera, input, audio, scores, settings, ui });

// ───── 게임 시작 절차 ─────

function openReady(GameClass) {
  audio.unlock();
  setDialog(ReadyPanel({ GameClass, settings, onClose: () => setDialog(null), onStart: (state) => startGame(GameClass, state) }));
}

const connectCamera = () => camera.connect({ deviceId: settings.get('cameraId'), resolution: settings.get('resolution') });

/** 카메라를 준비한다. 처음이면 사용 이유를 먼저 안내한다. */
function ensureCamera() {
  return new Promise((resolve) => {
    const attempt = async () => {
      if (camera.connected) { resolve(true); return; }
      const ok = await connectCamera();
      if (ok) { resolve(true); return; }
      setDialog(ErrorModal({
        title: '카메라를 켤 수 없어요',
        message: camera.errorText,
        onRetry: attempt,
        onMouse: () => { settings.set('inputMode', 'mouse'); resolve('mouse'); },
        onClose: () => { setDialog(null); resolve(false); },
      }));
    };
    if (camera.connected || settings.get('privacyAccepted')) { attempt(); return; }
    setDialog(PrivacyModal({
      onAccept: () => { settings.set('privacyAccepted', true); setDialog(null); attempt(); },
      onCancel: () => { setDialog(null); resolve(false); },
    }));
  });
}

function ensureModels() {
  return new Promise((resolve) => {
    const attempt = async () => {
      if (input.modelsReady) { resolve(true); return; }
      const loading = LoadingModal();
      setDialog(loading);
      const ok = await input.loadModels((text, step, total) => loading.update(text, step, total));
      if (ok) { setDialog(null); resolve(true); return; }
      setDialog(ErrorModal({
        title: '인식 모델을 불러오지 못했어요',
        message: `파일이 없거나 이 기기에서 실행할 수 없어요. (${input.modelError})`,
        onRetry: attempt,
        onMouse: () => { settings.set('inputMode', 'mouse'); resolve('mouse'); },
        onClose: () => { setDialog(null); resolve(false); },
      }));
    };
    attempt();
  });
}

async function prepareCameraInput() {
  input.setMode('camera');
  const cam = await ensureCamera();
  if (cam !== true) return cam;
  return ensureModels();
}

async function startGame(GameClass, state) {
  audio.unlock();
  if (settings.get('autoFullscreen') && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  if (settings.get('inputMode') === 'mouse') input.setMode('mouse');
  else if (isMock) input.setMode('mock');
  else {
    const prepared = await prepareCameraInput();
    if (prepared === false) return;
    if (prepared === 'mouse') input.setMode('mouse');
  }
  gm.launch(GameClass, { ...state, options: state.options });
}

async function openPanel(name) {
  const close = () => setDialog(null);
  if (name === 'howto') setDialog(HowToPanel({ onClose: close }));
  else if (name === 'sound') setDialog(SoundPanel({ settings, audio, onClose: close }));
  else if (name === 'safety') setDialog(SafetyPanel({ onClose: close }));
  else if (name === 'admin') {
    setDialog(AdminPanel({ settings, scores, camera, onClose: close, onFullscreen: toggleFullscreen, onChanged: showMenuScreen }));
  } else if (name === 'camera') {
    setDialog(CameraPanel({ settings, camera, connect: connectCamera, onClose: close }));
    if (!camera.connected && !settings.get('privacyAccepted')) {
      setDialog(PrivacyModal({
        onAccept: () => { settings.set('privacyAccepted', true); setDialog(CameraPanel({ settings, camera, connect: connectCamera, onClose: close })); connectCamera(); },
        onCancel: close,
      }));
    }
  } else if (name === 'test') {
    if (isMock) input.setMode('mock');
    else {
      const prepared = await prepareCameraInput();
      if (prepared !== true) return;
    }
    gm.applySettings();
    await input.setPlayerCount(1);
    setDialog(TestPanel({ settings, camera, input, gm, engine, onClose: close }));
  }
}

// ───── 전역 처리 ─────

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && (gm.state === 'playing' || gm.state === 'resuming')) gm.pause();
  if (e.code === 'KeyF' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName ?? '')) toggleFullscreen();
});

for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { lastActivity = performance.now(); });

// 게임을 하지 않을 때 오래 켜 두면 개인정보 보호를 위해 카메라를 끈다.
setInterval(() => {
  if (gm.state === 'idle' && camera.connected && performance.now() - lastActivity > IDLE_CAMERA_OFF_MS) {
    camera.disconnect();
    toast('사용하지 않아 카메라를 껐어요.');
  }
}, 15000);

window.addEventListener('pagehide', () => camera.disconnect());

// 캔버스 글꼴이 첫 프레임부터 적용되도록 게임에서 쓰는 글자를 미리 불러온다.
const fontSample = [
  ...GAMES.flatMap((G) => [G.meta.name, G.meta.desc, ...G.meta.howTo]),
  ...Object.values(PRAISE).flat(),
  '점수콤보내최고초 카메라준비사람찾기몸이화면안에양손들좌우움직이기본자세 왼오 0123456789+-×=?!/ 이어서시작해요 플레이어 함께 남은 생명 수정 개 보물 문 단계',
].join('');
document.fonts?.load('40px Jua', fontSample).catch(() => {});

showMenuScreen();
const applyLargeText = () => document.body.classList.toggle('large-text', settings.get('largeText'));
settings.subscribe(applyLargeText);
applyLargeText();

if (import.meta.env.DEV) {
  // 개발 모드에서만 테스트 훅을 노출한다. 프로덕션 번들에는 포함되지 않는다.
  window.__amp = { engine, gm, input, camera, settings, scores, audio, GAMES, startGame, isMock };
}
