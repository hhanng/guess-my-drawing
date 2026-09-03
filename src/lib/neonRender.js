const GLOW_LAYERS = [
  { width: 22, blur: 40, alpha: 0.14 },
  { width: 13, blur: 24, alpha: 0.26 },
  { width: 7, blur: 13, alpha: 0.48 },
];
const CORE_WIDTH = 2.4;
const CORE_BLUR = 6;
const JOINT_RADIUS = 2.6;

const TRAIL_GLOW = "#00e0ff";
const TRAIL_CORE = "#e6ffff";
const SKELETON_GLOW = "#ff1258";
const SKELETON_CORE = "#fff2f6";

const PULSE_PERIOD_MS = 3200;
const PULSE_DEPTH = 0.15;

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export function clearCanvas(ctx, w, h) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
}

function strokeGlow(ctx, buildPath, color, alphaMultiplier = 1) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.globalCompositeOperation = "lighter";
  for (const layer of GLOW_LAYERS) {
    ctx.globalAlpha = layer.alpha * alphaMultiplier;
    ctx.lineWidth = layer.width;
    ctx.shadowBlur = layer.blur;
    buildPath();
    ctx.stroke();
  }
  ctx.restore();
}

// polylines: array of arrays of { x, y } in normalized (0..1) canvas space.
export function renderTrail(ctx, polylines, w, h, nowMs) {
  polylines.forEach((points, index) => {
    if (!points || points.length < 2) return;
    const buildPath = () => {
      ctx.beginPath();
      ctx.moveTo(points[0].x * w, points[0].y * h);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x * w, points[i].y * h);
      }
    };
    const pulse =
      1 -
      PULSE_DEPTH +
      PULSE_DEPTH *
        (0.5 + 0.5 * Math.sin((nowMs / PULSE_PERIOD_MS) * Math.PI * 2 + index));

    strokeGlow(ctx, buildPath, TRAIL_GLOW, pulse);

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 1;
    ctx.strokeStyle = TRAIL_CORE;
    ctx.shadowColor = TRAIL_CORE;
    ctx.shadowBlur = CORE_BLUR;
    ctx.lineWidth = CORE_WIDTH;
    buildPath();
    ctx.stroke();
    ctx.restore();
  });
}

// handsPx: array of arrays of 21 { x, y } points already in canvas pixels.
export function renderSkeleton(ctx, handsPx) {
  handsPx.forEach((points) => {
    const buildPath = () => {
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(points[a].x, points[a].y);
        ctx.lineTo(points[b].x, points[b].y);
      }
    };
    strokeGlow(ctx, buildPath, SKELETON_GLOW);

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 1;
    ctx.strokeStyle = SKELETON_CORE;
    ctx.shadowColor = SKELETON_CORE;
    ctx.shadowBlur = CORE_BLUR;
    ctx.lineWidth = CORE_WIDTH;
    buildPath();
    ctx.stroke();
    ctx.fillStyle = SKELETON_CORE;
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, JOINT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

export function renderHoldRing(ctx, normPoint, progress, w, h) {
  const x = normPoint.x * w;
  const y = normPoint.y * h;
  const radius = 16;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = TRAIL_GLOW;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(
    0,
    0,
    radius,
    -Math.PI / 2,
    -Math.PI / 2 + Math.min(Math.max(progress, 0), 1) * Math.PI * 2
  );
  ctx.stroke();
  ctx.restore();
}
