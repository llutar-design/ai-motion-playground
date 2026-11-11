// 보물 발굴 주제 데이터. 지역 문화유산으로 바꾸려면 이 배열에 주제를 추가한다.
// kind: crown | pot | tile | celadon | coin | pagoda (src/assets/art.js의 그림 종류)
export const TREASURE_THEMES = [
  {
    id: 'heritage',
    name: '우리 문화유산',
    items: [
      { kind: 'crown', name: '금관', fact: '옛날 왕이 쓰던 황금 장식 모자예요.' },
      { kind: 'pot', name: '토기', fact: '흙을 구워 만든 그릇이에요.' },
      { kind: 'tile', name: '연꽃무늬 기와', fact: '지붕 끝을 꾸미던 기와예요.' },
      { kind: 'celadon', name: '청자 병', fact: '은은한 푸른빛이 나는 도자기예요.' },
      { kind: 'coin', name: '엽전', fact: '가운데 네모 구멍이 있는 옛날 돈이에요.' },
      { kind: 'pagoda', name: '작은 석탑', fact: '돌을 쌓아 만든 탑이에요.' },
    ],
  },
];
