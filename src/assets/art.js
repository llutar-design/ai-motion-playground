// 모든 그림은 코드로 그린다. 두꺼운 남색 외곽선 + 평면 색의 스티커 스타일로 통일한다.
import { LM, SKELETON } from '../core/MotionEngine.js';
import { poseSkeleton } from '../core/PoseLibrary.js';

export const INK = '#23305E';
export const CREAM = '#FFF8E7';
export const COLORS = { coral: '#FF6B6B', teal: '#3FD0B2', yellow: '#FFD84D', violet: '#9B7BFF', sky: '#4DB8FF', orange: '#FF9F45', pink: '#FF8FC7', green: '#7ED957' };
export const FONT = "Jua, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

export function text(g, str, x, y, size, color = INK, align = 'center', outline = null) {
  g.font = `${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  if (outline) { g.lineWidth = size * 0.18; g.lineJoin = 'round'; g.strokeStyle = outline; g.strokeText(str, x, y); }
  g.fillStyle = color;
  g.fillText(str, x, y);
}

function outlined(g, fill, width = 6) {
  g.fillStyle = fill; g.fill();
  g.lineWidth = width; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke();
}

export function drawCheck(g, x, y, r, done, current) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = done ? COLORS.teal : current ? CREAM : '#E4E0D2'; g.fill();
  g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
  if (done) {
    g.beginPath(); g.moveTo(x - r * 0.5, y); g.lineTo(x - r * 0.1, y + r * 0.45); g.lineTo(x + r * 0.55, y - r * 0.45);
    g.lineWidth = 5; g.lineCap = 'round'; g.stroke();
  }
}

export function starPath(g, x, y, r, spin = 0, points = 5, inner = 0.48) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = spin - Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 ? r * inner : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

export function drawStar(g, x, y, r, fill = COLORS.yellow, spin = 0) {
  starPath(g, x, y, r, spin);
  outlined(g, fill, Math.max(3, r * 0.11));
  g.beginPath(); g.arc(x - r * 0.18, y - r * 0.2, r * 0.13, 0, 7); g.fillStyle = 'rgba(255,255,255,.75)'; g.fill();
}

function drawX(g, x, y, r) {
  g.beginPath();
  g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r);
  g.lineCap = 'round'; g.lineWidth = r * 0.5; g.strokeStyle = CREAM; g.stroke();
}

export function drawBalloon(g, x, y, r, color, kind = 'normal', t = 0) {
  const wob = Math.sin(t * 3 + x) * 8;
  g.beginPath();
  g.moveTo(x, y + r * 1.2);
  g.quadraticCurveTo(x + wob, y + r * 1.7, x - wob * 0.6, y + r * 2.1);
  g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
  if (kind === 'hazard') {
    starPath(g, x, y, r * 1.14, t * 0.8, 11, 0.8);
    outlined(g, '#6D6A86');
    drawX(g, x, y, r * 0.36);
    return;
  }
  g.beginPath();
  g.ellipse(x, y, r, r * 1.18, 0, 0, Math.PI * 2);
  outlined(g, color);
  g.beginPath(); g.moveTo(x - 11, y + r * 1.26); g.lineTo(x + 11, y + r * 1.26); g.lineTo(x, y + r * 1.12); g.closePath();
  outlined(g, color, 4);
  g.beginPath(); g.ellipse(x - r * 0.36, y - r * 0.42, r * 0.17, r * 0.28, 0.5, 0, 7); g.fillStyle = 'rgba(255,255,255,.7)'; g.fill();
  if (kind === 'gold') drawStar(g, x, y, r * 0.55, CREAM);
}

export function drawHand(g, x, y, r, color, label, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  const fingers = [-52, -24, 4, 32];
  for (const a of fingers) {
    const rad = ((a - 90) * Math.PI) / 180 + 0.1;
    g.beginPath();
    g.ellipse(x + Math.cos(rad) * r * 0.95, y + Math.sin(rad) * r * 0.95, r * 0.26, r * 0.42, rad + Math.PI / 2, 0, 7);
    outlined(g, color, 5);
  }
  g.beginPath(); g.ellipse(x + r * 0.86, y + r * 0.1, r * 0.25, r * 0.4, 0.9, 0, 7); outlined(g, color, 5);
  g.beginPath(); g.arc(x, y, r * 0.78, 0, 7); outlined(g, color, 5);
  if (label) text(g, label, x, y + 2, r * 0.68, INK);
  g.restore();
}

export function drawFruit(g, x, y, r, kind, spin = 0) {
  g.save();
  g.translate(x, y); g.rotate(spin);
  const base = { apple: COLORS.coral, orange: COLORS.orange, lemon: COLORS.yellow, melon: COLORS.green, plum: COLORS.violet }[kind];
  g.beginPath();
  if (kind === 'lemon') g.ellipse(0, 0, r * 1.15, r * 0.85, 0, 0, 7);
  else if (kind === 'apple') { g.moveTo(0, -r * 0.6); g.bezierCurveTo(r * 1.5, -r * 1.3, r * 1.3, r * 1.2, 0, r); g.bezierCurveTo(-r * 1.3, r * 1.2, -r * 1.5, -r * 1.3, 0, -r * 0.6); }
  else g.arc(0, 0, r, 0, 7);
  outlined(g, base);
  if (kind === 'melon') {
    g.lineWidth = 5; g.strokeStyle = '#3F9E36';
    for (const k of [-0.5, 0, 0.5]) { g.beginPath(); g.ellipse(0, 0, r * Math.abs(k) * 1.5 + 2, r * 0.96, 0, 0, 7); g.stroke(); }
  }
  g.beginPath(); g.moveTo(0, -r * 0.7); g.quadraticCurveTo(r * 0.1, -r * 1.2, r * 0.25, -r * 1.3); g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.ellipse(-r * 0.4, -r * 0.3, r * 0.14, r * 0.26, 0.6, 0, 7); g.fillStyle = 'rgba(255,255,255,.7)'; g.fill();
  g.restore();
}

export function drawBomb(g, x, y, r, t = 0) {
  starPath(g, x, y, r * 1.12, t, 9, 0.78);
  outlined(g, '#4E4B66');
  drawX(g, x, y, r * 0.36);
  g.beginPath(); g.arc(x + r * 0.55, y - r * 1.05, r * 0.16 + Math.sin(t * 16) * 3, 0, 7); g.fillStyle = COLORS.orange; g.fill();
}

export function drawFish(g, x, y, r, color, dir = 1, t = 0, gold = false) {
  g.save();
  g.translate(x, y); g.scale(dir, 1);
  const tail = Math.sin(t * 9) * r * 0.25;
  g.beginPath(); g.moveTo(-r * 0.8, 0); g.lineTo(-r * 1.55, -r * 0.6 + tail); g.lineTo(-r * 1.55, r * 0.6 + tail); g.closePath(); outlined(g, color);
  g.beginPath(); g.ellipse(0, 0, r, r * 0.68, 0, 0, 7); outlined(g, color);
  g.beginPath(); g.arc(r * 0.48, -r * 0.14, r * 0.17, 0, 7); g.fillStyle = CREAM; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.arc(r * 0.52, -r * 0.14, r * 0.07, 0, 7); g.fillStyle = INK; g.fill();
  if (gold) drawStar(g, -r * 0.15, 0, r * 0.38, CREAM);
  g.restore();
}

export function drawJelly(g, x, y, r, t = 0) {
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const tx = x - r * 0.6 + (i * r * 1.2) / 3;
    g.moveTo(tx, y);
    g.quadraticCurveTo(tx + Math.sin(t * 3 + i) * 18, y + r * 0.7, tx, y + r * 1.25);
  }
  g.lineWidth = 8; g.lineCap = 'round'; g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.quadraticCurveTo(x, y + r * 0.35, x - r, y); g.closePath(); outlined(g, COLORS.pink);
  drawX(g, x, y - r * 0.42, r * 0.22);
}

export function drawOrb(g, x, y, r, color, t = 0, gold = false) {
  if (gold) { drawStar(g, x, y, r * 1.28, COLORS.yellow, t * 2); return; }
  g.beginPath(); g.arc(x, y, r, 0, 7); outlined(g, color);
  g.beginPath(); g.arc(x, y, r * 0.5, 0, 7); g.fillStyle = 'rgba(255,255,255,.65)'; g.fill();
}

export function drawShield(g, x, y, r, color, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  g.beginPath();
  g.moveTo(0, -r); g.lineTo(r * 0.92, -r * 0.62); g.lineTo(r * 0.82, r * 0.35);
  g.quadraticCurveTo(r * 0.5, r * 0.85, 0, r * 1.06);
  g.quadraticCurveTo(-r * 0.5, r * 0.85, -r * 0.82, r * 0.35); g.lineTo(-r * 0.92, -r * 0.62); g.closePath();
  outlined(g, color, 7);
  drawStar(g, 0, -r * 0.02, r * 0.42, CREAM);
  g.restore();
}

export function drawRock(g, x, y, r) {
  g.beginPath();
  g.moveTo(x - r, y + r * 0.6); g.lineTo(x - r * 0.7, y - r * 0.4); g.lineTo(x - r * 0.1, y - r * 0.8);
  g.lineTo(x + r * 0.7, y - r * 0.45); g.lineTo(x + r, y + r * 0.6); g.closePath();
  outlined(g, '#8E8BA6', Math.max(4, r * 0.08));
  drawX(g, x, y + r * 0.02, r * 0.26);
}

export function drawRunner(g, x, y, r, t = 0, flash = false) {
  g.save();
  g.translate(x, y);
  g.globalAlpha = flash && Math.floor(t * 12) % 2 ? 0.45 : 1;
  const bob = Math.sin(t * 12) * r * 0.06;
  g.beginPath(); g.roundRect(-r * 0.6, -r * 0.5 + bob, r * 1.2, r * 1.3, r * 0.35); outlined(g, COLORS.sky);
  g.beginPath(); g.arc(0, -r * 0.85 + bob, r * 0.55, 0, 7); outlined(g, '#FFD9B0');
  g.beginPath(); g.arc(-r * 0.2, -r * 0.92 + bob, r * 0.07, 0, 7); g.arc(r * 0.2, -r * 0.92 + bob, r * 0.07, 0, 7); g.fillStyle = INK; g.fill();
  g.beginPath(); g.arc(0, -r * 0.8 + bob, r * 0.22, 0.2, Math.PI - 0.2); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
  g.restore();
}

/** 포즈 각도로 사람/로봇 캐릭터를 그린다. */
export function drawFigure(g, pose, x, y, size, style = 'kid', hue = COLORS.sky) {
  const sk = poseSkeleton(pose, x, y, size);
  const limb = (a, b, w, c) => {
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineCap = style === 'robot' ? 'butt' : 'round';
    g.lineWidth = w + 12; g.strokeStyle = INK; g.stroke();
    g.lineWidth = w; g.strokeStyle = c; g.stroke();
  };
  const w = size * 0.2;
  for (const dir of ['L', 'R']) {
    limb(sk[dir].shoulder, sk[dir].elbow, w, style === 'robot' ? '#B9C6DE' : '#FFD9B0');
    limb(sk[dir].elbow, sk[dir].wrist, w, style === 'robot' ? '#D7DFEF' : '#FFD9B0');
  }
  for (const side of [-1, 1]) {
    const hipP = { x: sk.hip.x + side * size * 0.24, y: sk.hip.y };
    limb(hipP, { x: hipP.x, y: hipP.y + size * 0.9 }, w * 1.1, style === 'robot' ? '#8FA3C7' : '#5A6FC2');
  }
  g.beginPath();
  g.moveTo(sk.neck.x - size * 0.42, sk.neck.y); g.lineTo(sk.neck.x + size * 0.42, sk.neck.y);
  g.lineTo(sk.hip.x + size * 0.36, sk.hip.y); g.lineTo(sk.hip.x - size * 0.36, sk.hip.y); g.closePath();
  outlined(g, hue, 7);
  if (style === 'robot') {
    g.beginPath(); g.roundRect(sk.head.x - size * 0.42, sk.head.y - size * 0.36, size * 0.84, size * 0.7, size * 0.12); outlined(g, '#D7DFEF', 7);
    g.beginPath(); g.moveTo(sk.head.x, sk.head.y - size * 0.36); g.lineTo(sk.head.x, sk.head.y - size * 0.6); g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.arc(sk.head.x, sk.head.y - size * 0.64, size * 0.09, 0, 7); outlined(g, COLORS.coral, 5);
    g.beginPath(); g.arc(sk.head.x - size * 0.18, sk.head.y - size * 0.04, size * 0.1, 0, 7); g.arc(sk.head.x + size * 0.18, sk.head.y - size * 0.04, size * 0.1, 0, 7); g.fillStyle = COLORS.teal; g.fill();
  } else {
    g.beginPath(); g.arc(sk.head.x, sk.head.y, size * 0.4, 0, 7); outlined(g, '#FFD9B0', 7);
    g.beginPath(); g.arc(sk.head.x - size * 0.14, sk.head.y - size * 0.04, size * 0.05, 0, 7); g.arc(sk.head.x + size * 0.14, sk.head.y - size * 0.04, size * 0.05, 0, 7); g.fillStyle = INK; g.fill();
    g.beginPath(); g.arc(sk.head.x, sk.head.y + size * 0.06, size * 0.16, 0.2, Math.PI - 0.2); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
  }
}

const ARTIFACTS = {
  crown(g, r) {
    g.beginPath();
    g.moveTo(-r, r * 0.5); g.lineTo(-r, -r * 0.5); g.lineTo(-r * 0.5, 0); g.lineTo(0, -r * 0.8); g.lineTo(r * 0.5, 0); g.lineTo(r, -r * 0.5); g.lineTo(r, r * 0.5); g.closePath();
    outlined(g, '#F5C542');
    for (const k of [-0.6, 0, 0.6]) { g.beginPath(); g.arc(r * k, r * 0.24, r * 0.13, 0, 7); outlined(g, COLORS.teal, 4); }
  },
  pot(g, r) {
    g.beginPath(); g.moveTo(-r * 0.45, -r * 0.85); g.lineTo(r * 0.45, -r * 0.85); g.lineTo(r * 0.32, -r * 0.55);
    g.bezierCurveTo(r * 1.2, -r * 0.3, r * 1, r * 0.9, r * 0.3, r * 0.95); g.lineTo(-r * 0.3, r * 0.95);
    g.bezierCurveTo(-r, r * 0.9, -r * 1.2, -r * 0.3, -r * 0.32, -r * 0.55); g.closePath();
    outlined(g, '#C98B5E');
    g.beginPath(); g.moveTo(-r * 0.72, 0); g.lineTo(r * 0.72, 0); g.moveTo(-r * 0.66, r * 0.3); g.lineTo(r * 0.66, r * 0.3); g.lineWidth = 6; g.strokeStyle = '#7E5233'; g.stroke();
  },
  tile(g, r) {
    g.beginPath(); g.arc(0, 0, r, 0, 7); outlined(g, '#9FA7B8');
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.beginPath(); g.ellipse(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.28, r * 0.13, a, 0, 7); outlined(g, '#C7CDD9', 4);
    }
    g.beginPath(); g.arc(0, 0, r * 0.18, 0, 7); outlined(g, '#7D8598', 4);
  },
  celadon(g, r) {
    g.beginPath(); g.moveTo(-r * 0.2, -r); g.lineTo(r * 0.2, -r); g.bezierCurveTo(r * 0.1, -r * 0.5, r * 1.1, -r * 0.5, r * 0.6, r * 0.6);
    g.lineTo(r * 0.4, r); g.lineTo(-r * 0.4, r); g.lineTo(-r * 0.6, r * 0.6); g.bezierCurveTo(-r * 1.1, -r * 0.5, -r * 0.1, -r * 0.5, -r * 0.2, -r); g.closePath();
    outlined(g, '#A7D8C7');
    g.beginPath(); g.arc(0, r * 0.05, r * 0.28, 0, 7); g.lineWidth = 5; g.strokeStyle = '#5C9E89'; g.stroke();
  },
  coin(g, r) {
    g.beginPath(); g.arc(0, 0, r, 0, 7); outlined(g, '#D8A747');
    g.beginPath(); g.rect(-r * 0.3, -r * 0.3, r * 0.6, r * 0.6); outlined(g, '#6B4F21', 5);
  },
  pagoda(g, r) {
    for (let i = 0; i < 3; i++) {
      const y = -r * 0.75 + i * r * 0.62; const w = r * (0.55 + i * 0.2);
      g.beginPath(); g.rect(-w * 0.55, y, w * 1.1, r * 0.42); outlined(g, '#B8B4A6', 5);
      g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); g.lineTo(w * 0.7, y - r * 0.18); g.lineTo(-w * 0.7, y - r * 0.18); g.closePath(); outlined(g, '#8E8A7C', 5);
    }
  },
};

export function drawArtifact(g, kind, x, y, r) {
  g.save(); g.translate(x, y); (ARTIFACTS[kind] ?? ARTIFACTS.coin)(g, r); g.restore();
}

/** 카메라 영상과 인식된 관절을 그린다. 화면에 표시만 할 뿐 저장·전송하지 않는다. */
export function drawCameraView(g, camera, motion, mirror, x, y, w, h, { dim = 0, thin = false } = {}) {
  const aspect = camera?.aspect ?? 16 / 9;
  const s = Math.max(w / aspect, h);
  const vw = aspect * s;
  const ox = x + (w - vw) / 2;
  const oy = y + (h - s) / 2;
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#31407A';
  g.fillRect(x, y, w, h);
  if (camera?.ready) {
    g.save();
    if (mirror) { g.translate(ox + vw, oy); g.scale(-1, 1); g.drawImage(camera.video, 0, 0, vw, s); } else g.drawImage(camera.video, ox, oy, vw, s);
    g.restore();
  }
  if (dim) { g.fillStyle = `rgba(35,48,94,${dim})`; g.fillRect(x, y, w, h); }
  const tones = [COLORS.sky, COLORS.orange];
  for (const p of motion.players) {
    if (!p.tracked || !p.landmarks) continue;
    const lm = p.landmarks;
    const X = (i) => ox + lm[i].x * s;
    const Y = (i) => oy + lm[i].y * s;
    g.lineCap = 'round';
    g.lineWidth = thin ? 3 : 10;
    g.strokeStyle = tones[p.id] ?? COLORS.yellow;
    for (const [a, b] of SKELETON) {
      if (lm[a].v < 0.4 || lm[b].v < 0.4) continue;
      g.beginPath(); g.moveTo(X(a), Y(a)); g.lineTo(X(b), Y(b)); g.stroke();
    }
    for (const i of [LM.L_WRIST, LM.R_WRIST]) {
      if (lm[i].v < 0.5) continue;
      g.beginPath(); g.arc(X(i), Y(i), thin ? 5 : 18, 0, 7); g.fillStyle = COLORS.yellow; g.fill();
    }
  }
  g.restore();
}
