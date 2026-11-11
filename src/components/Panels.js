import { h, modal, panelHead, field, checkbox, select, range } from './dom.js';
import { GAMES } from '../core/GameRegistry.js';
import { DIFFICULTY } from '../core/constants.js';
import { drawCameraView } from '../assets/art.js';
import { GESTURE_LABELS } from '../core/GestureMapper.js';

export const RESOLUTIONS = [
  { v: '640x480', l: '640 × 480 (저사양)' },
  { v: '1280x720', l: '1280 × 720 (권장)' },
  { v: '1920x1080', l: '1920 × 1080' },
];

export function PrivacyModal({ onAccept, onCancel }) {
  return modal(h('section.panel', { role: 'dialog', 'aria-modal': 'true', 'data-testid': 'privacy' },
    h('h2', null, '카메라를 사용할게요'),
    h('p', null, '몸과 손의 움직임으로 게임을 조작하려면 카메라가 필요해요.'),
    h('ul', null,
      h('li', null, '영상은 이 컴퓨터 안에서만 처리되고 서버로 전송되지 않아요.'),
      h('li', null, '영상과 소리를 녹화하거나 파일로 저장하지 않아요.'),
      h('li', null, '얼굴을 알아보거나 누구인지 확인하지 않아요.'),
      h('li', null, '카메라가 켜져 있으면 화면 아래에 빨간 표시가 나타나고, 언제든 끌 수 있어요.')),
    h('p.note', null, '다음 화면에서 브라우저가 카메라 사용 허용을 물어보면 “허용”을 눌러 주세요.'),
    h('div.row.end', null,
      h('button.primary', { type: 'button', onclick: onAccept }, '알겠어요, 카메라 켜기'),
      h('button', { type: 'button', onclick: onCancel }, '취소'))));
}

export function LoadingModal() {
  const label = h('p', null, '준비하는 중이에요');
  const fill = h('div', { style: 'width:5%' });
  const el = modal(h('section.panel.center', { role: 'status' }, h('h2', null, '잠시만 기다려 주세요'), label, h('div.bar', null, fill)));
  el.update = (text, step, total) => { label.textContent = `${text} (${step}/${total})`; fill.style.width = `${(step / total) * 100}%`; };
  return el;
}

export function ErrorModal({ title, message, onRetry, onMouse, onClose }) {
  return modal(h('section.panel.center', { role: 'alertdialog', 'data-testid': 'error' },
    h('h2', null, title),
    h('p', null, message),
    h('div.row.end', null,
      onRetry ? h('button.primary', { type: 'button', onclick: onRetry }, '다시 시도') : null,
      onMouse ? h('button', { type: 'button', onclick: onMouse }, '마우스로 플레이') : null,
      h('button', { type: 'button', onclick: onClose }, '닫기'))));
}

export function SafetyPanel({ onClose }) {
  return modal(h('section.panel', null,
    panelHead('안전하게 놀아요', onClose),
    h('ul', null,
      h('li', null, '팔을 쭉 뻗어도 닿지 않게 주변에 충분한 공간을 만들어요.'),
      h('li', null, '바닥과 주변의 의자, 가방 같은 장애물을 치워요.'),
      h('li', null, '뛰거나 크게 점프하지 않아도 돼요.'),
      h('li', null, '팔을 너무 세게 휘두르지 않아요.'),
      h('li', null, '화면에 너무 가까이 다가가지 않아요.'),
      h('li', null, '다른 친구를 밀지 않고, 2인 게임은 각자 자기 자리에서 해요.'),
      h('li', null, '어지럽거나 힘들면 바로 멈추고 쉬어요.'))), { onClose });
}

export function HowToPanel({ onClose }) {
  return modal(h('section.panel.wide', null,
    panelHead('게임 방법', onClose),
    h('ol', null,
      h('li', null, '게임 카드의 시작 버튼을 눌러요.'),
      h('li', null, '카메라 앞 2~3걸음 뒤에 서서 안내를 따라요.'),
      h('li', null, '양손과 몸을 움직여 게임을 해요. 화면의 손 모양이 내 손이에요.'),
      h('li', null, '팔을 내리면 손이 쉬는 상태가 되어 아무것도 건드리지 않아요.')),
    h('div.columns', null, GAMES.map((G) => h('div', null, h('h3', null, G.meta.name), h('ul', null, G.meta.howTo.map((t) => h('li', null, t))))))), { onClose });
}

export function SoundPanel({ settings, onClose, audio }) {
  const s = settings.data;
  return modal(h('section.panel', null,
    panelHead('사운드 설정', onClose),
    checkbox('소리 켜기', s.sound, (v) => { settings.set('sound', v); audio.unlock(); if (v) audio.sfx('correct'); }),
    field('효과음', range(0, 1, 0.05, s.sfxVolume, (v) => { settings.set('sfxVolume', v); audio.unlock(); audio.sfx('pop'); }, (v) => `${Math.round(v * 100)}%`)),
    field('배경 음악', range(0, 1, 0.05, s.musicVolume, (v) => settings.set('musicVolume', v), (v) => `${Math.round(v * 100)}%`)),
    h('div.row', null, h('button', { type: 'button', onclick: () => { audio.unlock(); audio.sfx('win'); } }, '소리 시험하기'))), { onClose });
}

export function CameraPanel({ settings, camera, connect, onClose }) {
  const status = h('p', { 'data-testid': 'cam-status' });
  const deviceRow = h('div');
  const canvas = h('canvas', { width: 960, height: 540 });
  const refreshStatus = () => {
    const label = { idle: '꺼져 있어요', requesting: '권한을 요청하는 중이에요', connected: '연결되었어요', reconnecting: '다시 연결하는 중이에요', error: camera.errorText }[camera.state];
    status.textContent = `상태: ${label}`;
    status.className = camera.state === 'error' ? 'err' : '';
  };
  const loadDevices = async () => {
    const list = await camera.listDevices();
    deviceRow.replaceChildren(field('카메라 선택', select([{ v: '', l: '기본 카메라' }, ...list.map((d) => ({ v: d.id, l: d.label }))], settings.get('cameraId'), (v) => { settings.set('cameraId', v); if (camera.connected) connect(); })));
  };
  const unsub = camera.subscribe(() => { refreshStatus(); loadDevices(); });
  refreshStatus();
  loadDevices();
  const close = () => { unsub(); onClose(); };
  const el = modal(h('section.panel', { 'data-testid': 'camera-panel' },
    panelHead('카메라 연결', close),
    status,
    deviceRow,
    field('해상도', select(RESOLUTIONS, settings.get('resolution'), (v) => { settings.set('resolution', v); if (camera.connected) connect(); })),
    checkbox('좌우 반전(거울처럼 보기)', settings.get('mirror'), (v) => settings.set('mirror', v)),
    h('div.preview', null, canvas),
    h('p.note', null, '영상은 이 화면에 표시만 되며 저장하거나 전송하지 않아요.'),
    h('div.row', null,
      h('button.primary', { type: 'button', onclick: connect }, '연결'),
      h('button', { type: 'button', onclick: () => camera.disconnect() }, '연결 해제'))), { onClose: close });
  const g = canvas.getContext('2d');
  el.onFrame = () => drawCameraView(g, camera.ready ? camera : null, { players: [] }, settings.get('mirror'), 0, 0, canvas.width, canvas.height);
  return el;
}

const FLAG_KEYS = [
  ['왼손 위', (p) => p.flags.leftUp], ['오른손 위', (p) => p.flags.rightUp], ['양손 위', (p) => p.flags.bothUp],
  ['왼쪽', (p) => p.body.lane < 0], ['가운데', (p) => p.body.lane === 0], ['오른쪽', (p) => p.body.lane > 0],
];

export function TestPanel({ settings, camera, input, gm, engine, onClose }) {
  const canvas = h('canvas', { width: 960, height: 540 });
  const log = h('div.log', { 'data-testid': 'event-log' });
  const stats = h('div.stats', { 'data-testid': 'stats' });
  const flags = h('div.flags');
  const lines = [];
  let calibrated = false;
  let statTime = 0;
  const close = () => { input.stopLoop(); onClose(); };
  const el = modal(h('section.panel.wide', { 'data-testid': 'test-panel' },
    panelHead('몸동작 테스트', close),
    h('div.test-grid', null,
      h('div', null, h('div.preview', null, canvas)),
      h('div', { style: 'display:flex;flex-direction:column;gap:.6rem' }, stats, flags, h('h3', null, '인식된 동작'), log)),
    h('p.note', null, '숫자는 이 기기에서 지금 실제로 측정한 값이에요.'),
    h('div.row', null,
      h('button', { type: 'button', onclick: () => { calibrated = engine.calibrate(); } }, '지금 자세를 기준으로 저장'))), { onClose: close });
  const g = canvas.getContext('2d');
  input.startLoop();
  el.onFrame = (motion, dt) => {
    drawCameraView(g, camera, motion, settings.get('mirror'), 0, 0, canvas.width, canvas.height);
    for (const p of motion.players) {
      for (const hand of [p.hands.left, p.hands.right]) {
        if (!hand.visible) continue;
        g.beginPath(); g.arc((hand.x / 1920) * canvas.width, (hand.y / 1080) * canvas.height, 14, 0, 7);
        g.fillStyle = hand.active ? '#3FD0B2' : '#FFF8E7'; g.fill();
      }
    }
    const p = motion.players[0];
    if (!calibrated && p.tracked) calibrated = engine.calibrate();
    for (const e of motion.events) {
      lines.unshift(`${e.type} · 신뢰도 ${e.confidence.toFixed(2)}`);
      if (lines.length > 9) lines.pop();
      log.textContent = lines.join('\n');
    }
    statTime += dt;
    if (statTime > 0.3) {
      statTime = 0;
      const s = input.stats;
      const gesture = p.hands.right.gesture ?? p.hands.left.gesture;
      stats.replaceChildren(...[
        ['추적', p.tracked ? '인식 중' : '찾는 중'], ['신뢰도', p.confidence.toFixed(2)],
        ['추론', s.fps ? `${s.fps.toFixed(0)} FPS` : '측정 중'], ['추론 시간', s.ms ? `${s.ms.toFixed(0)} ms` : '-'],
        ['화면', `${gm.renderFps.toFixed(0)} FPS`], ['실행', `${s.delegate} · 단계 ${s.tier}`],
        ['손 인식원', `${p.hands.left.source} / ${p.hands.right.source}`], ['제스처', GESTURE_LABELS[gesture] ?? '-'],
      ].flatMap(([k, v]) => [h('span', null, k), h('span', null, v)]));
      flags.replaceChildren(...FLAG_KEYS.map(([k, fn]) => h(fn(p) ? 'span.badge.on' : 'span.badge', null, k)));
    }
  };
  return el;
}

export const difficultyChoices = Object.values(DIFFICULTY).map((d) => ({ v: d.id, l: d.label }));
export const TIME_CHOICES = [30, 60, 90, 120].map((t) => ({ v: t, l: `${t}초` }));
