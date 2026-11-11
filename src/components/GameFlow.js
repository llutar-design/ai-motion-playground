import { h, modal, panelHead, segmented, field, iconCanvas, checkbox } from './dom.js';
import { difficultyChoices, TIME_CHOICES } from './Panels.js';

export function ReadyPanel({ GameClass, settings, onStart, onClose }) {
  const m = GameClass.meta;
  const cfg = settings.forGame(m.id);
  const s = settings.data;
  const state = {
    difficulty: cfg.difficulty,
    timeLimit: cfg.timeLimit,
    players: m.players.includes(s.playerMode) && m.players[0] !== 2 ? s.playerMode : m.players[0],
    nickname: s.nickname,
    options: Object.fromEntries((m.options ?? []).map((o) => [o.key, o.choices[0].v])),
  };
  if (m.id === 'fruit') state.options.slow = s.slowFruit;
  if (m.id === 'rhythm') state.options.wide = s.wideTiming;
  const go = () => {
    settings.set('nickname', state.nickname);
    onStart(state);
  };
  return modal(h('section.panel.wide', { 'data-testid': 'ready' },
    panelHead(m.name, onClose),
    h('div.ready', null,
      h('div.side', null, iconCanvas(GameClass, 300), h('ul', null, m.howTo.map((t) => h('li', null, t)))),
      h('div.side', null,
        field('난이도', segmented(difficultyChoices, state.difficulty, (v) => { state.difficulty = v; })),
        field('제한시간', segmented(TIME_CHOICES, state.timeLimit, (v) => { state.timeLimit = v; })),
        m.players.length > 1 ? field('인원', segmented([...m.players].sort().map((n) => ({ v: n, l: n === 1 ? '1인' : '2인 협동' })), state.players, (v) => { state.players = v; })) : null,
        (m.options ?? []).map((o) => field(o.label, segmented(o.choices, state.options[o.key], (v) => { state.options[o.key] = v; }))),
        field('조작', segmented([{ v: 'camera', l: '몸으로(카메라)' }, { v: 'mouse', l: '마우스·터치' }], s.inputMode, (v) => settings.set('inputMode', v))),
        checkbox('앉아서 즐기기', s.seated, (v) => settings.set('seated', v)),
        checkbox('작은 움직임 모드', s.smallMotion, (v) => settings.set('smallMotion', v)),
        field('별명', h('input', { type: 'text', maxlength: 12, value: state.nickname, placeholder: '실명 대신 별명이나 팀 이름', oninput: (e) => { state.nickname = e.target.value; } })))),
    h('p.note', null, '시작하기 전에 팔을 뻗어도 닿지 않게 주변을 정리해 주세요.'),
    h('div.row.end', null, h('button.go', { type: 'button', onclick: go, 'data-testid': 'go' }, '게임 시작'))), { onClose });
}

export function ResultsScreen({ GameClass, summary, onRetry, onMenu }) {
  const cell = (k, v) => h('div', null, k, h('b', null, v));
  return modal(h('section.panel.center', { 'data-testid': 'results' },
    h('p.result-praise', null, summary.praise),
    h('p', null, GameClass.meta.name),
    summary.isBest && summary.score > 0 ? h('p.new-best', null, '나의 새로운 최고 기록!') : null,
    h('p.result-score', { 'data-testid': 'final-score' }, summary.score),
    h('div.result-grid', null,
      cell('내 최고 기록', summary.best),
      cell('성공 횟수', summary.success),
      cell('플레이 시간', `${summary.playTime}초`),
      summary.details.map(([k, v]) => cell(k, v))),
    h('div.row.end', null,
      h('button.go', { type: 'button', onclick: onRetry }, '다시하기'),
      h('button', { type: 'button', onclick: onMenu, style: 'font-size:1.6rem' }, '다른 게임 선택'))));
}

export function PauseOverlay({ onResume, onRetry, onExit }) {
  return modal(h('section.panel.center', { 'data-testid': 'pause' },
    h('h2', null, '잠깐 멈췄어요'),
    h('div.row.end', null,
      h('button.go', { type: 'button', onclick: onResume }, '계속하기'),
      h('button', { type: 'button', onclick: onRetry }, '처음부터'),
      h('button', { type: 'button', onclick: onExit }, '게임 나가기'))));
}

export function LostOverlay({ canGoSolo, onSolo, onExit }) {
  return modal(h('section.panel.center', { 'data-testid': 'lost', role: 'alert' },
    h('h2', null, '어디 갔을까요?'),
    h('p', null, canGoSolo ? '두 사람 모두 화면 앞으로 돌아와 주세요. 다시 보이면 이어서 시작해요.' : '화면 앞으로 천천히 돌아와 주세요. 다시 보이면 이어서 시작해요.'),
    h('div.row.end', null,
      canGoSolo ? h('button.primary', { type: 'button', onclick: onSolo }, '1인으로 이어하기') : null,
      h('button', { type: 'button', onclick: onExit }, '게임 나가기'))));
}
