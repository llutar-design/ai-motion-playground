// 학년 수준별 수학 문제 생성과 교사 입력 JSON 검증
import { pick } from '../core/constants.js';

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

const RANGES = {
  low: { add: [1, 9], sub: [2, 18], mulA: [2, 5], mulB: [1, 5] },
  mid: { add: [10, 50], sub: [20, 99], mulA: [2, 9], mulB: [2, 9] },
  high: { add: [100, 500], sub: [200, 999], mulA: [11, 25], mulB: [2, 9] },
};

export function generateQuestion(op, level) {
  const r = RANGES[level] ?? RANGES.low;
  const kind = op === 'mixed' ? pick(['add', 'sub', 'mul']) : op;
  let a; let b; let answer; let sym;
  if (kind === 'add') { a = randInt(...r.add); b = randInt(...r.add); answer = a + b; sym = '+'; }
  else if (kind === 'sub') {
    a = randInt(...r.sub); b = randInt(1, a - 1); answer = a - b; sym = '-';
  } else { a = randInt(r.mulA[0], r.mulA[1]); b = randInt(r.mulB[0], r.mulB[1]); answer = a * b; sym = '×'; }
  return { q: `${a} ${sym} ${b} = ?`, answer, choices: makeChoices(answer) };
}

function makeChoices(answer) {
  const set = new Set([answer]);
  const spread = Math.max(3, Math.round(answer * 0.2));
  let guard = 0;
  while (set.size < 3 && guard++ < 50) {
    const v = answer + (Math.random() < 0.5 ? -1 : 1) * randInt(1, spread);
    if (v >= 0) set.add(v);
  }
  let filler = answer + 1;
  while (set.size < 3) set.add(filler++);
  return shuffle([...set]);
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 교사가 입력한 JSON을 검증한다. 형식: [{"q":"3 + 4 = ?","choices":[7,6,8],"answer":7}]
 * @returns {{questions:Array, errors:string[]}}
 */
export function parseCustomQuestions(json) {
  let data;
  try { data = JSON.parse(json); } catch (e) { return { questions: [], errors: [`JSON 형식 오류: ${e.message}`] }; }
  if (!Array.isArray(data)) return { questions: [], errors: ['문제 목록은 대괄호 [ ] 로 감싼 배열이어야 해요.'] };
  const questions = [];
  const errors = [];
  data.forEach((item, i) => {
    const n = i + 1;
    if (typeof item?.q !== 'string' || !item.q.trim()) { errors.push(`${n}번: q(문제)가 없어요.`); return; }
    if (!Array.isArray(item.choices) || item.choices.length !== 3) { errors.push(`${n}번: choices(보기)는 정확히 3개여야 해요.`); return; }
    const choices = item.choices.map(String);
    if (new Set(choices).size !== 3) { errors.push(`${n}번: 보기가 서로 달라야 해요.`); return; }
    if (!choices.includes(String(item.answer))) { errors.push(`${n}번: answer(정답)가 보기 안에 있어야 해요.`); return; }
    questions.push({ q: item.q.trim().slice(0, 40), choices, answer: String(item.answer) });
  });
  return { questions, errors };
}
