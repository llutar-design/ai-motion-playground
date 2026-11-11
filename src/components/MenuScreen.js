import { h, iconCanvas, stars } from './dom.js';
import { GAMES } from '../core/GameRegistry.js';

/** 메인 화면. 게임 목록은 GameRegistry에서 자동으로 만든다. */
export function MenuScreen({ settings, onStart, onPanel, onFullscreen }) {
  const cards = GAMES.filter((G) => settings.forGame(G.meta.id).enabled).map((G) => {
    const m = G.meta;
    return h('article.card', { 'data-game': m.id }, iconCanvas(G),
      h('div.card-body', null,
        h('h2', null, m.name),
        h('p', null, m.desc),
        h('div.badges', null,
          h('span.badge', null, m.grade),
          h('span.badge', { 'aria-label': `난이도 ${m.level}단계` }, stars(m.level)),
          h(m.players.includes(2) ? 'span.badge.two' : 'span.badge', null, m.players.includes(2) ? (m.players[0] === 2 ? '2인 협동' : '1·2인') : '1인')),
        h('button', { type: 'button', onclick: () => onStart(G), 'aria-label': `${m.name} 시작` }, '시작')));
  });

  return h('main.menu', null,
    h('header.menu-head', null,
      h('h1', null, 'AI 모션 플레이그라운드'),
      h('p', null, '몸을 움직이면 게임이 시작된다!')),
    h('section.grid', { 'aria-label': '게임 선택' }, cards),
    h('footer.menu-foot', null,
      h('button', { type: 'button', onclick: () => onPanel('camera') }, '카메라 연결'),
      h('button', { type: 'button', onclick: () => onPanel('test') }, '몸동작 테스트'),
      h('button', { type: 'button', onclick: () => onPanel('howto') }, '게임 방법'),
      h('button', { type: 'button', onclick: () => onPanel('sound') }, '사운드 설정'),
      h('button', { type: 'button', onclick: () => onPanel('safety') }, '안전 안내'),
      h('button', { type: 'button', onclick: () => onPanel('admin') }, '관리자 설정'),
      h('button', { type: 'button', onclick: onFullscreen }, '전체 화면')));
}
