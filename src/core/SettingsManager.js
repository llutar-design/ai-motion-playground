// 모든 설정은 이 브라우저의 localStorage에만 저장된다.
const KEY = 'amp.settings.v1';

export const DEFAULTS = {
  inputMode: 'camera',
  cameraId: '',
  resolution: '1280x720',
  mirror: true,
  sensitivity: 1,
  sound: true,
  sfxVolume: 0.8,
  musicVolume: 0.35,
  difficulty: 'normal',
  timeLimit: 60,
  scoreMultiplier: 1,
  playerMode: 1,
  autoFullscreen: false,
  seated: false,
  smallMotion: false,
  oneHand: 'off',
  gameSpeed: 1,
  largeText: false,
  showResults: true,
  wideTiming: false,
  slowFruit: false,
  nickname: '',
  privacyAccepted: false,
  perGame: {},
  customMath: [],
};

function storage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export class SettingsManager {
  constructor() {
    this.listeners = new Set();
    this.data = { ...DEFAULTS, ...this.#load() };
  }

  #load() {
    try { return JSON.parse(storage()?.getItem(KEY) ?? '{}'); } catch { return {}; }
  }

  #save() {
    try { storage()?.setItem(KEY, JSON.stringify(this.data)); } catch { /* 저장 공간이 없어도 게임은 계속된다 */ }
    this.listeners.forEach((fn) => fn(this.data));
  }

  get(key) { return this.data[key]; }
  set(key, value) { this.data[key] = value; this.#save(); }
  patch(obj) { Object.assign(this.data, obj); this.#save(); }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** 게임별 설정. 지정하지 않은 항목은 전체 설정을 따른다. */
  forGame(id) {
    const own = this.data.perGame[id] ?? {};
    return {
      enabled: own.enabled ?? true,
      timeLimit: own.timeLimit ?? this.data.timeLimit,
      difficulty: own.difficulty ?? this.data.difficulty,
    };
  }

  setForGame(id, partial) {
    this.data.perGame[id] = { ...(this.data.perGame[id] ?? {}), ...partial };
    this.#save();
  }

  resetAll() { this.data = { ...DEFAULTS, perGame: {}, customMath: [] }; this.#save(); }
}
