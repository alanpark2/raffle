import { PARTY_COLORS } from "./color";

type Bit = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
  decay: number;
  shape: number;
};

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let bits: Bit[] = [];
let frame = 0;
let dpr = 1;

export function mountConfetti(target: HTMLCanvasElement): void {
  canvas = target;
  ctx = target.getContext("2d");
  resize();
  window.addEventListener("resize", resize);
}

export function celebrateBurst(lite = false): void {
  if (!canvas) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  spawn(width * 0.5, height * 0.42, lite ? 36 : 150);
  spawn(width * 0.12, height * 0.18, lite ? 12 : 60);
  spawn(width * 0.88, height * 0.18, lite ? 12 : 60);
  window.setTimeout(() => spawn(width * 0.5, height * 0.3, lite ? 16 : 70), 240);
  if (!frame) frame = requestAnimationFrame(tick);
}

function spawn(x: number, y: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 11;
    bits.push({
      x,
      y,
      w: 6 + Math.random() * 8,
      h: 8 + Math.random() * 14,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.28,
      color: PARTY_COLORS[i % PARTY_COLORS.length],
      life: 1,
      decay: 0.005 + Math.random() * 0.006,
      shape: i % 5,
    });
  }
}

function tick(): void {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);
  const next: Bit[] = [];
  for (const bit of bits) {
    bit.vy += 0.16;
    bit.vx *= 0.992;
    bit.x += bit.vx;
    bit.y += bit.vy;
    bit.rot += bit.vr;
    bit.life -= bit.decay;
    if (bit.life <= 0) continue;
    next.push(bit);
    ctx.save();
    ctx.translate(bit.x, bit.y);
    ctx.rotate(bit.rot);
    ctx.globalAlpha = Math.max(bit.life, 0);
    ctx.fillStyle = bit.color;
    if (bit.shape === 0) {
      ctx.beginPath();
      ctx.arc(0, 0, bit.w * 0.42, 0, Math.PI * 2);
      ctx.fill();
    } else if (bit.shape === 4) {
      ctx.fillRect(-bit.w * 0.18, -bit.h, bit.w * 0.36, bit.h * 1.8);
    } else {
      ctx.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h);
    }
    ctx.restore();
  }
  bits = next;
  ctx.restore();
  if (bits.length) frame = requestAnimationFrame(tick);
  else {
    frame = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function resize(): void {
  if (!canvas || !ctx) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
}
