// 개인 최고 기록은 브라우저에만 저장하며 서버로 보내지 않는다.
import { PRAISE, pick } from './constants.js';

const KEY = 'amp.scores.v1';

function read() {
  try { return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}'); } catch { return {}; }
}

export class ScoreManager {
  constructor() { this.data = read(); }

  #save() {
    try { globalThis.localStorage?.setItem(KEY, JSON.stringify(this.data)); } catch { /* 저장 실패는 게임을 막지 않는다 */ }
  }

  best(gameId) { return this.data[gameId]?.best ?? 0; }

  /** 결과를 기록하고 결과 화면에 필요한 값을 돌려준다. */
  record(gameId, { score, success, playTime, players, cleared, nickname, details = [] }) {
    const prev = this.best(gameId);
    const isBest = score > prev;
    if (isBest) this.data[gameId] = { best: score, nickname: nickname ?? '', date: new Date().toISOString().slice(0, 10) };
    this.#save();
    const pool = players > 1 ? PRAISE.team : score > 0 || cleared ? PRAISE.great : PRAISE.retry;
    return { score, best: Math.max(prev, score), isBest, success, playTime, players, details, praise: pick(pool) };
  }

  reset(gameId) { delete this.data[gameId]; this.#save(); }
  resetAll() { this.data = {}; this.#save(); }
}
