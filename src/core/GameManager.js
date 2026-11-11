// 게임 생명주기와 렌더링 루프. 카메라·모델은 유지하고 게임만 교체한다.
import { STAGE_W, STAGE_H, DIFFICULTY } from './constants.js';
import { CalibrationManager } from './CalibrationManager.js';
import { drawCameraView, roundRect, text } from '../assets/art.js';

const QUICK_CALIB_MS = 10 * 60 * 1000;
const STABLE_RESUME_S = 0.8;
const RESUME_COUNT_S = 3;

export class GameManager {
  constructor({ canvas, engine, camera, input, audio, scores, settings, ui }) {
    Object.assign(this, { canvas, engine, camera, input, audio, scores, settings, ui });
    this.g = canvas.getContext('2d');
    this.state = 'idle'; // idle | calibrating | playing | paused | lost | resuming
    this.game = null;
    this.GameClass = null;
    this.launchOpts = null;
    this.calib = null;
    this.view = { s: 1, ox: 0, oy: 0 };
    this.lastFrame = 0;
    this.stable = 0;
    this.resumeLeft = 0;
    this.lastCalibAt = -Infinity;
    this.renderFps = 0;
    this._fpsN = 0; this._fpsT = 0;
    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);
    window.addEventListener('resize', this.resize);
    document.addEventListener('fullscreenchange', this.resize);
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    this.resize();
    input.attachPointer(canvas, (cx, cy) => this.toStage(cx, cy));
    requestAnimationFrame(this.loop);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
    const s = Math.min(this.canvas.width / STAGE_W, this.canvas.height / STAGE_H);
    this.view = { s, ox: (this.canvas.width - STAGE_W * s) / 2, oy: (this.canvas.height - STAGE_H * s) / 2, dpr };
  }

  toStage(cx, cy) {
    const { s, ox, oy, dpr } = this.view;
    return { x: (cx * dpr - ox) / s, y: (cy * dpr - oy) / s };
  }

  get usingCamera() { return this.input.mode === 'camera'; }
  /** 몸 추적을 쓰는 입력인지 여부. 마우스 대체 조작에서는 추적 손실 일시정지가 필요 없다. */
  get tracksBody() { return this.input.mode !== 'mouse'; }

  applySettings() {
    const s = this.settings.data;
    this.engine.configure({ mirror: s.mirror, sensitivity: s.sensitivity, smallMotion: s.smallMotion, seated: s.seated, oneHand: s.oneHand });
  }

  /** @param opts { players, difficulty, timeLimit, nickname, options, quickRestart } */
  async launch(GameClass, opts) {
    this.disposeGame();
    this.GameClass = GameClass;
    this.launchOpts = opts;
    this.applySettings();
    this.engine.configure({ difficultyScale: DIFFICULTY[opts.difficulty].motion });
    this.engine.resetForGame();
    await this.input.setPlayerCount(opts.players);
    if (this.usingCamera) this.input.startLoop();
    const recent = performance.now() - this.lastCalibAt < QUICK_CALIB_MS && this.engine.players.every((p) => p.calib);
    this.state = 'calibrating';
    this.ui.showCalibration(true);
    this.calib = new CalibrationManager({
      engine: this.engine,
      camera: this.usingCamera ? this.camera : null,
      audio: this.audio,
      seated: this.settings.get('seated'),
      oneHand: this.settings.get('oneHand'),
      players: opts.players,
      quick: recent || !!opts.quickRestart,
      onDone: () => this.#beginGame(),
    });
    if (!this.usingCamera && this.input.mode === 'mouse') {
      this.calib.skipped.add('person').add('frame').add('hands').add('move').add('baseline');
    }
  }

  #beginGame() {
    const opts = this.launchOpts;
    this.lastCalibAt = performance.now();
    this.ui.showCalibration(false);
    // 2인 추적 성능이 너무 낮으면 무리하게 진행하지 않고 1인으로 전환한다.
    if (this.usingCamera && opts.players > 1 && this.input.stats.fps > 0 && this.input.stats.fps < 9) {
      this.ui.toast('이 기기에서는 2인 인식이 느려서 1인 모드로 진행해요.');
      opts.players = 1;
      this.input.setPlayerCount(1);
    }
    this.engine.resetForGame();
    const game = new this.GameClass();
    const d = DIFFICULTY[opts.difficulty];
    game.init({
      engine: this.engine,
      audio: this.audio,
      scores: this.scores,
      settings: this.settings,
      difficulty: d,
      timeLimit: opts.timeLimit,
      players: opts.players,
      options: opts.options ?? {},
      finish: (result) => this.#finish(result),
    });
    this.game = game;
    this.audio.unlock();
    game.start();
    this.state = 'playing';
    this.ui.showHud(true);
  }

  #finish(result) {
    const { GameClass, launchOpts: opts } = this;
    const summary = this.scores.record(GameClass.meta.id, { ...result, players: opts.players, nickname: opts.nickname });
    this.disposeGame();
    this.state = 'idle';
    this.input.stopLoop();
    this.ui.showHud(false);
    this.audio.sfx('win');
    if (this.settings.get('showResults')) this.ui.showResults(GameClass, summary, opts);
    else this.ui.showMenu();
  }

  disposeGame() {
    this.game?.dispose();
    this.game = null;
    this.calib = null;
    this.audio.stopAll();
    this.engine.resetForGame();
  }

  /** 게임을 끝내고 메뉴로 돌아간다. 카메라는 다음 게임을 위해 유지한다. */
  exitToMenu() {
    this.disposeGame();
    this.state = 'idle';
    this.ui.showHud(false);
    this.ui.showCalibration(false);
    this.ui.hideOverlay();
    this.input.stopLoop();
    this.ui.showMenu();
  }

  retry() {
    this.ui.hideOverlay();
    this.launch(this.GameClass, { ...this.launchOpts, quickRestart: true });
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'resuming') return;
    this.game.pause();
    this.audio.suspend();
    this.state = 'paused';
    this.ui.showPause();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.ui.hideOverlay();
    this.#startResumeCount();
  }

  #startResumeCount() {
    this.state = 'resuming';
    this.resumeLeft = RESUME_COUNT_S;
  }

  #enterLost() {
    this.game.pause();
    this.audio.suspend();
    this.state = 'lost';
    this.stable = 0;
    this.ui.showLost({ canGoSolo: this.launchOpts.players > 1 });
  }

  /** 2인 게임 도중 한 명을 잃었을 때 교사가 고를 수 있는 "1인으로 계속" 동작. */
  async continueSolo() {
    if (this.state !== 'lost' && this.state !== 'paused') return;
    this.launchOpts.players = 1;
    await this.input.setPlayerCount(1);
    this.engine.calibrate();
    this.game?.setPlayers?.(1);
  }

  skipCalibStep() { this.calib?.skip(); }

  calibToSolo() {
    if (!this.calib) return;
    this.launchOpts.players = 1;
    this.input.setPlayerCount(1);
    this.calib.downgradeToSolo();
  }

  loop(ts) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (ts - this.lastFrame) / 1000 || 0);
    this.lastFrame = ts;
    const now = performance.now();
    this._fpsN += 1;
    if (ts - this._fpsT > 1000) { this.renderFps = (this._fpsN * 1000) / (ts - this._fpsT); this._fpsN = 0; this._fpsT = ts; }

    this.input.frame(now);
    const motion = this.engine.tick(dt, now);
    this.ui.onFrame?.(motion, dt);
    if (this.state === 'idle') return;

    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#23305E';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const { s, ox, oy } = this.view;
    g.setTransform(s, 0, 0, s, ox, oy);
    g.save();
    g.beginPath(); g.rect(0, 0, STAGE_W, STAGE_H); g.clip();

    switch (this.state) {
      case 'calibrating':
        this.calib.update(dt, motion);
        if (this.calib && this.state === 'calibrating') {
          this.calib.render(g, motion);
          this.ui.updateCalibration(this.calib);
        }
        break;
      case 'playing':
        if (this.tracksBody && motion.anyLost) this.#enterLost();
        else this.game.update(dt, motion);
        break;
      case 'lost':
        this.stable = motion.allTracked ? this.stable + dt : 0;
        if (this.stable >= STABLE_RESUME_S) {
          this.ui.hideOverlay();
          this.#startResumeCount();
        }
        break;
      case 'resuming':
        this.resumeLeft -= dt;
        if (this.tracksBody && motion.anyLost) { this.#enterLost(); break; }
        if (this.resumeLeft <= 0) {
          this.audio.resume();
          this.game.resume();
          this.state = 'playing';
        }
        break;
      default:
    }

    if (this.game) {
      this.game.render(g);
      if (this.usingCamera) this.#drawPip(g, motion);
      if (this.state === 'resuming') this.#drawResumeCount(g);
    }
    g.restore();
  }

  #drawPip(g, motion) {
    const w = 288; const h = 162; const x = STAGE_W - w - 20; const y = STAGE_H - h - 20;
    g.save();
    roundRect(g, x, y, w, h, 18);
    g.clip();
    drawCameraView(g, this.camera, motion, this.engine.cfg.mirror, x, y, w, h, { thin: true });
    g.restore();
    roundRect(g, x, y, w, h, 18);
    g.lineWidth = 5; g.strokeStyle = '#FFF8E7'; g.stroke();
  }

  #drawResumeCount(g) {
    g.fillStyle = 'rgba(35,48,94,.55)';
    g.fillRect(0, 0, STAGE_W, STAGE_H);
    text(g, '이어서 시작해요', STAGE_W / 2, STAGE_H / 2 - 170, 64, '#FFF8E7');
    text(g, String(Math.max(1, Math.ceil(this.resumeLeft))), STAGE_W / 2, STAGE_H / 2 + 20, 200, '#FFD84D');
  }
}
