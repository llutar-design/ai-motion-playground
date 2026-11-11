// 작은 DOM 도우미. 사용자 입력은 항상 textContent로 들어가므로 HTML로 해석되지 않는다.
export function h(spec, props, ...children) {
  const [tagPart, ...classes] = spec.split('.');
  const el = document.createElement(tagPart || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** 여러 선택지 중 하나를 고르는 버튼 묶음 */
export function segmented(choices, value, onChange) {
  const root = h('div.seg', { role: 'group' });
  let current = value;
  const buttons = choices.map((c) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(c.v === current), onclick: () => {
      current = c.v;
      buttons.forEach((x, i) => x.setAttribute('aria-pressed', String(choices[i].v === current)));
      onChange(c.v);
    } }, c.l);
    root.append(b);
    return b;
  });
  return root;
}

export function field(label, control) {
  return h('div.field', null, h('span.lbl', null, label), control);
}

export function checkbox(label, checked, onChange) {
  return h('label.field', null, h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) }), label);
}

export function select(options, value, onChange) {
  return h('select', { onchange: (e) => onChange(e.target.value) }, options.map((o) => h('option', { value: o.v, selected: String(o.v) === String(value) }, o.l)));
}

export function range(min, max, step, value, onChange, format = (v) => v) {
  const out = h('span', null, format(value));
  const input = h('input', { type: 'range', min, max, step, value, oninput: (e) => { out.textContent = format(Number(e.target.value)); onChange(Number(e.target.value)); } });
  return h('span.row', null, input, out);
}

export function modal(content, { onClose } = {}) {
  const bg = h('div.modal-bg', { onclick: (e) => { if (e.target === bg && onClose) onClose(); } }, content);
  return bg;
}

export function panelHead(title, onClose) {
  return h('div.panel-head', null, h('h2', null, title), onClose ? h('button', { type: 'button', onclick: onClose, 'aria-label': '닫기' }, '닫기') : null);
}

export function iconCanvas(GameClass, size = 240) {
  const c = h('canvas', { width: size, height: size, 'aria-hidden': 'true' });
  GameClass.drawIcon(c.getContext('2d'), size);
  return c;
}

export const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
