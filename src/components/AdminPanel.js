import { h, modal, panelHead, field, checkbox, select, range, segmented } from './dom.js';
import { difficultyChoices, TIME_CHOICES, RESOLUTIONS } from './Panels.js';
import { GAMES } from '../core/GameRegistry.js';
import { parseCustomQuestions } from '../data/mathQuestions.js';

const SAMPLE = '[\n  { "q": "3 + 4 = ?", "choices": [7, 6, 8], "answer": 7 },\n  { "q": "5 × 6 = ?", "choices": ["30", "35", "25"], "answer": "30" }\n]';
const ONE_HAND = [{ v: 'off', l: '끄기' }, { v: 'left', l: '왼손만' }, { v: 'right', l: '오른손만' }];

export function AdminPanel({ settings, scores, camera, onClose, onFullscreen, onChanged }) {
  const s = settings.data;
  const close = () => { onChanged(); onClose(); };
  const set = (k) => (v) => settings.set(k, v);

  const cameraSelect = h('span', null);
  camera.listDevices().then((list) => {
    cameraSelect.append(select([{ v: '', l: '기본 카메라' }, ...list.map((d) => ({ v: d.id, l: d.label }))], s.cameraId, set('cameraId')));
  });

  const rows = GAMES.map((G) => {
    const id = G.meta.id;
    const cfg = settings.forGame(id);
    const best = h('td', null, scores.best(id));
    return h('tr', null,
      h('td', null, G.meta.name),
      h('td', null, h('input', { type: 'checkbox', checked: cfg.enabled, 'aria-label': `${G.meta.name} 활성화`, onchange: (e) => settings.setForGame(id, { enabled: e.target.checked }) })),
      h('td', null, select(TIME_CHOICES, cfg.timeLimit, (v) => settings.setForGame(id, { timeLimit: Number(v) }))),
      h('td', null, select(difficultyChoices, cfg.difficulty, (v) => settings.setForGame(id, { difficulty: v }))),
      best,
      h('td', null, h('button', { type: 'button', onclick: () => { scores.reset(id); best.textContent = '0'; } }, '초기화')));
  });

  const mathMsg = h('p.note', null, `저장된 선생님 문제: ${s.customMath.length}개`);
  const mathText = h('textarea', { spellcheck: 'false', 'aria-label': '수학 문제 JSON', placeholder: SAMPLE });
  if (s.customMath.length) mathText.value = JSON.stringify(s.customMath, null, 2);
  const saveMath = () => {
    const { questions, errors } = parseCustomQuestions(mathText.value);
    if (errors.length) { mathMsg.textContent = errors.slice(0, 3).join(' '); mathMsg.className = 'note err'; return; }
    settings.set('customMath', questions);
    mathMsg.textContent = `저장했어요: ${questions.length}개 문제`;
    mathMsg.className = 'note';
  };
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': '문제 파일 불러오기', onchange: async (e) => { const f = e.target.files[0]; if (f) mathText.value = await f.text(); } });

  return modal(h('section.panel.wide', { 'data-testid': 'admin' },
    panelHead('관리자 설정', close),
    h('h3', null, '게임 운영'),
    h('div.columns', null,
      field('기본 제한시간', select(TIME_CHOICES, s.timeLimit, (v) => settings.set('timeLimit', Number(v)))),
      field('기본 난이도', select(difficultyChoices, s.difficulty, set('difficulty'))),
      field('점수 배율', select([0.5, 1, 1.5, 2, 3].map((v) => ({ v, l: `${v}배` })), s.scoreMultiplier, (v) => settings.set('scoreMultiplier', Number(v)))),
      field('기본 인원', segmented([{ v: 1, l: '1인' }, { v: 2, l: '2인' }], s.playerMode, set('playerMode'))),
      field('게임 속도', range(0.6, 1.2, 0.1, s.gameSpeed, set('gameSpeed'), (v) => `${Math.round(v * 100)}%`)),
      checkbox('사운드 켜기', s.sound, set('sound')),
      checkbox('결과 화면 표시', s.showResults, set('showResults')),
      checkbox('게임 시작 시 전체 화면', s.autoFullscreen, set('autoFullscreen')),
      h('div', null, h('button', { type: 'button', onclick: onFullscreen }, '지금 전체 화면으로'))),
    h('h3', null, '카메라와 인식'),
    h('div.columns', null,
      field('카메라', cameraSelect),
      field('해상도', select(RESOLUTIONS, s.resolution, set('resolution'))),
      checkbox('좌우 반전', s.mirror, set('mirror')),
      field('인식 민감도', range(0.7, 1.4, 0.1, s.sensitivity, set('sensitivity'), (v) => v.toFixed(1))),
      field('조작 방식', segmented([{ v: 'camera', l: '카메라' }, { v: 'mouse', l: '마우스·터치' }], s.inputMode, set('inputMode')))),
    h('h3', null, '접근성'),
    h('div.columns', null,
      checkbox('앉아서 즐기기', s.seated, set('seated')),
      checkbox('작은 움직임 모드', s.smallMotion, set('smallMotion')),
      field('한 손 모드', segmented(ONE_HAND, s.oneHand, set('oneHand'))),
      checkbox('큰 글씨', s.largeText, set('largeText')),
      checkbox('리듬 판정 넓히기', s.wideTiming, set('wideTiming')),
      checkbox('과일 게임 느린 모드', s.slowFruit, set('slowFruit'))),
    h('h3', null, '게임별 설정'),
    h('table.admin', null,
      h('thead', null, h('tr', null, ['게임', '사용', '시간', '난이도', '최고 기록', '기록'].map((t) => h('th', null, t)))),
      h('tbody', null, rows)),
    h('h3', null, '수학 문제 추가(JSON)'),
    h('p.note', null, '보기는 3개, 정답은 보기 중 하나여야 해요. 숫자 천재 대작전에서 “선생님 문제”를 고르면 나와요.'),
    mathText,
    h('div.row', null,
      h('button.primary', { type: 'button', onclick: saveMath }, '문제 저장'),
      h('button', { type: 'button', onclick: () => { mathText.value = SAMPLE; } }, '예시 넣기'),
      fileInput),
    mathMsg,
    h('h3', null, '초기화'),
    h('div.row', null,
      h('button.danger', { type: 'button', onclick: () => { if (confirm('모든 최고 기록을 지울까요?')) { scores.resetAll(); rows.forEach((r) => { r.children[4].textContent = '0'; }); } } }, '모든 기록 지우기'),
      h('button.danger', { type: 'button', onclick: () => { if (confirm('모든 설정을 처음으로 되돌릴까요?')) { settings.resetAll(); close(); } } }, '설정 되돌리기'))), { onClose: close });
}
