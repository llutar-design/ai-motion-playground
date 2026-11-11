// MediaPipe WASM 런타임과 공식 모델을 public/ 아래 로컬 자산으로 준비한다.
// 실행 중에는 외부 네트워크를 쓰지 않도록, 배포물에 이 파일들을 함께 포함한다.
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://storage.googleapis.com/mediapipe-models';
const MODELS = {
  'pose_landmarker_lite.task': `${BASE}/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`,
  'hand_landmarker.task': `${BASE}/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task`,
  'gesture_recognizer.task': `${BASE}/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task`,
};

async function exists(path) {
  try { return (await stat(path)).size > 0; } catch { return false; }
}

const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = join(root, 'public/wasm');
await mkdir(wasmDst, { recursive: true });
for (const file of await readdir(wasmSrc)) {
  await copyFile(join(wasmSrc, file), join(wasmDst, file));
  console.log('wasm  ', file);
}

const modelDst = join(root, 'public/models');
await mkdir(modelDst, { recursive: true });
for (const [name, url] of Object.entries(MODELS)) {
  const target = join(modelDst, name);
  if (await exists(target)) { console.log('model ', name, '(이미 있음)'); continue; }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name} 다운로드 실패: HTTP ${res.status}`);
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
  console.log('model ', name, '(다운로드 완료)');
}
