// 카메라 스트림 관리. 영상은 <video>로 재생되어 이 기기 안에서만 쓰이며 녹화·전송 코드는 없다.
const ERROR_TEXT = {
  denied: '카메라 권한이 거부되었어요. 주소창의 카메라 아이콘에서 허용으로 바꿔 주세요.',
  notfound: '연결된 카메라를 찾지 못했어요. 웹캠 연결을 확인해 주세요.',
  busy: '다른 프로그램이 카메라를 쓰고 있어요. 화상회의 앱 등을 닫아 주세요.',
  insecure: '카메라는 HTTPS 주소나 localhost에서만 쓸 수 있어요.',
  unknown: '카메라를 시작하지 못했어요. 다시 시도해 주세요.',
};

export class CameraManager {
  constructor() {
    this.state = 'idle';
    this.error = null;
    this.stream = null;
    this.listeners = new Set();
    this.reconnectTries = 0;
    this.lastRequest = null;
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.setAttribute('aria-hidden', 'true');
  }

  get connected() { return this.state === 'connected'; }
  get ready() { return this.connected && this.video.readyState >= 2 && this.video.videoWidth > 0; }
  get aspect() { return this.video.videoHeight ? this.video.videoWidth / this.video.videoHeight : 16 / 9; }
  get errorText() { return this.error ? ERROR_TEXT[this.error] : ''; }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  #set(state, error = null) {
    this.state = state;
    this.error = error;
    this.listeners.forEach((fn) => fn(state, error));
  }

  get supported() { return !!(globalThis.isSecureContext && navigator.mediaDevices?.getUserMedia); }

  async listDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `카메라 ${i + 1}` }));
  }

  async connect({ deviceId = '', resolution = '1280x720' } = {}) {
    if (!this.supported) { this.#set('error', 'insecure'); return false; }
    this.#stopTracks();
    this.lastRequest = { deviceId, resolution };
    this.#set('requesting');
    const [width, height] = resolution.split('x').map(Number);
    const video = { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: 30 } };
    if (deviceId) video.deviceId = { exact: deviceId };
    try {
      const stream = await this.#open(video, deviceId);
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      stream.getVideoTracks()[0].addEventListener('ended', this.#onEnded);
      this.reconnectTries = 0;
      this.#set('connected');
      return true;
    } catch (err) {
      this.#stopTracks();
      const map = { NotAllowedError: 'denied', SecurityError: 'denied', NotFoundError: 'notfound', OverconstrainedError: 'notfound', NotReadableError: 'busy', AbortError: 'busy' };
      this.#set('error', map[err?.name] ?? 'unknown');
      return false;
    }
  }

  async #open(video, deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (err) {
      // 저장된 카메라가 사라졌으면 기본 카메라로 한 번 더 시도한다.
      if (deviceId && (err?.name === 'OverconstrainedError' || err?.name === 'NotFoundError')) {
        delete video.deviceId;
        return navigator.mediaDevices.getUserMedia({ video, audio: false });
      }
      throw err;
    }
  }

  #onEnded = () => {
    if (this.state !== 'connected') return;
    this.#stopTracks();
    if (this.reconnectTries >= 3) { this.#set('error', 'notfound'); return; }
    this.reconnectTries += 1;
    this.#set('reconnecting');
    setTimeout(() => { if (this.state === 'reconnecting') this.connect(this.lastRequest); }, 1000);
  };

  #stopTracks() {
    this.stream?.getTracks().forEach((t) => { t.removeEventListener('ended', this.#onEnded); t.stop(); });
    this.stream = null;
    this.video.srcObject = null;
  }

  disconnect() {
    this.#stopTracks();
    this.#set('idle');
  }
}
