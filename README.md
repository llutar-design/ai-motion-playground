# AI 모션 플레이그라운드

**몸을 움직이면 게임이 시작된다!** 웹캠 1대로 즐기는 초등학생용 모션 게임 12종입니다.
추론은 브라우저 안에서 실행되고, 카메라 영상은 전송하거나 저장하지 않습니다.

## 실행 방법

Node.js 20 이상이 필요합니다.

```bash
npm install
npm run dev        # http://localhost:5173 을 Chrome 또는 Edge로 엽니다
```

배포용 결과물 확인:

```bash
npm run build
npm run preview
```

MediaPipe 런타임(`public/wasm`)과 모델 3종(`public/models`)은 프로젝트에 포함되어 있습니다.
다시 받아야 할 때만 `npm run setup:assets`를 실행합니다.

## 카메라 설정

1. 카메라는 **HTTPS 주소 또는 localhost**에서만 켜집니다. 교실 PC의 파일을 직접 여는 방식(`file://`)은 동작하지 않습니다.
2. 메인 화면의 **카메라 연결**에서 카메라, 해상도, 좌우 반전을 고릅니다. 1280×720을 권장합니다.
3. 카메라를 화면 위쪽 가운데에 두고, 학생은 2~3걸음 뒤에 섭니다. 머리부터 허리까지 보이면 됩니다.
4. **몸동작 테스트**에서 인식 상태, 실제 추론 속도, 인식된 동작을 확인합니다.
5. 프로젝터 환경에서는 역광을 피해 학생 쪽 조명을 밝게 해 주세요.

카메라가 켜져 있으면 화면 아래에 빨간 표시가 나타나고 **끄기** 버튼으로 바로 끌 수 있습니다.
메뉴에서 5분 동안 조작이 없거나 페이지를 닫으면 자동으로 꺼집니다. 게임을 연달아 할 수 있도록 게임 사이에는 켜진 상태를 유지합니다.

단축키: `Esc` 일시정지, `F` 전체 화면.

## 교사용 안내

**관리자 설정**에서 게임 활성화, 제한시간, 난이도, 점수 배율, 인식 민감도, 접근성 옵션을 바꿀 수 있습니다. 설정과 기록은 해당 브라우저에만 저장됩니다.

| 상황 | 추천 설정 |
| --- | --- |
| 교실이 좁거나 앉아서 참여 | 앉아서 즐기기, 작은 움직임 모드 |
| 한쪽 팔만 사용 | 한 손 모드 |
| 빠른 동작이 어려움 | 과일 게임 느린 모드, 리듬 판정 넓히기, 게임 속도 낮추기 |
| 카메라 사용 불가 | 조작 방식을 마우스·터치로 변경 |

수학 문제는 관리자 설정에 JSON으로 추가합니다. 보기는 정확히 3개이고 정답은 보기 중 하나여야 합니다.

```json
[{ "q": "3 + 4 = ?", "choices": [7, 6, 8], "answer": 7 }]
```

보물 발굴의 주제(지역 문화유산 등)는 `src/data/treasureThemes.js`에 추가합니다.

## Vercel 배포

```bash
npm i -g vercel
vercel          # 미리보기 배포
vercel --prod   # 운영 배포
```

GitHub 저장소를 Vercel에 연결해도 됩니다. Framework는 Vite, Build Command는 `npm run build`, Output Directory는 `dist`입니다(`vercel.json`에 설정됨). 배포 크기는 약 41MB입니다.

빌드 결과물에는 CSP(`connect-src 'self'`)가 들어 있어, 앱이 자기 주소 외의 서버로 데이터를 보낼 수 없도록 브라우저가 차단합니다.

## 새 게임 추가하기

1. `src/games/MyGame.js`를 만들고 `BaseGame`을 상속합니다.
2. `src/core/GameRegistry.js`의 `GAMES` 배열에 추가합니다. 메뉴, 관리자 표, 기록 저장은 자동으로 연결됩니다.

```js
import { BaseGame, fillSky } from './BaseGame.js';
import { COLORS, drawStar } from '../assets/art.js';

export class MyGame extends BaseGame {
  static meta = {
    id: 'mygame', name: '나의 게임', desc: '한 줄 설명',
    howTo: ['규칙 1', '규칙 2'],
    grade: '1~6학년', level: 1, players: [1, 2], theme: 'bright',
  };
  static drawIcon(g, s) { fillSky(g, s, s, '#FFF', '#EEE'); drawStar(g, s / 2, s / 2, s / 3); }

  setup() { this.target = { x: 960, y: 400, r: 90 }; }
  step(dt, motion) {
    const t = this.target;
    if (this.hands().some((h) => this.touching(h, t.x, t.y, t.r))) {
      this.award(10, t.x, t.y, { sound: 'pop' });
      t.x = 200 + Math.random() * 1500;
    }
  }
  draw(g) { fillSky(g, this.W, this.H, '#CDE', '#FFF'); drawStar(g, this.target.x, this.target.y, this.target.r, COLORS.yellow); }
}
```

게임은 관절 좌표를 직접 다루지 않고 `MotionEngine`의 표준 상태를 사용합니다.

| 필요한 것 | 사용 방법 |
| --- | --- |
| 점수를 낼 수 있는 손 | `this.hands()`, `this.touching(hand, x, y, r)` |
| 동작 이벤트 | `motion.events` (`LEFT_HAND_UP`, `RIGHT_HAND_UP`, `BOTH_HANDS_UP`, `MOVE_LEFT`, `MOVE_RIGHT`, `HAND_SWING`, `LEAN_LEFT`, `LEAN_RIGHT`, `BODY_DIP`, `GESTURE_SELECT` 등) |
| 머무르기 선택 | `engine.setTargets([...])` → `REACH_TARGET` 이벤트 |
| 포즈 판정 | `engine.watchPose(POSES.arms_out, { hold: 700 })` → `POSE_MATCH` 이벤트 |
| 몸 위치 | `motion.players[0].body` (`lane`, `offset`, `lean`) |

게임의 공통 인터페이스는 `init(context)`, `start()`, `update(dt, motionState)`, `render(ctx)`, `pause()`, `resume()`, `dispose()`이며 `BaseGame`이 구현합니다.

## 구조

```text
src/core        카메라, 추론, MotionEngine, 캘리브레이션, 게임 관리, 오디오, 설정, 기록
src/games       게임 12종과 BaseGame
src/components  메뉴와 패널 UI
src/assets      코드로 그리는 일러스트
src/data        수학 문제, 보물 주제
tests           단위 테스트, 브라우저 통합 테스트
```

추론은 메인 스레드에서 게임 렌더링과 분리된 타이머로 실행합니다. 포즈와 손 추론을 나눠 실행하고, 기기가 느리면 입력 크기와 빈도를 자동으로 낮춥니다(4단계). Web Worker는 검토했지만, tasks-vision의 로더가 모듈 워커를 지원하지 않고 현재 GPU 추론 시간이 약 30ms여서 적용하지 않았습니다.

## 테스트

```bash
npm test                     # 단위 + 빌드 + 브라우저 통합
npm run test:e2e -- camera   # 가상 카메라 + 실제 모델만
```

결과와 미검증 항목은 [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md)에 있습니다.

## 라이선스 참고

- MediaPipe Tasks Vision과 모델: Apache-2.0 (Google)
- Jua 글꼴: SIL Open Font License
- `tests/fixtures/person*.jpg`: MediaPipe 공개 테스트 자산이며 테스트에만 사용하고 배포물에는 포함되지 않습니다.
