/**
 * StreamInkRenderer — 曲水流觞 · Winding Stream Gathering
 *
 * PRD 曲水流觞:
 * - 墨迹形态: 水平流线底纹，关节动作推动线条上下偏移，形成涟漪扩散
 * - 用户动作映射: 关节速度→波纹振幅。慢动作=轻柔涟漪，快动作=明显波纹
 * - 轨迹叠加: 否 — 外力消失后线条自然回归静态
 *
 * Physics v2 (stability-focused):
 *   - Spring return (springK) keeps displacement bounded
 *   - Hard clamp on displacement prevents runaway
 *   - Conservative propagation (wave spreading limited)
 *   - Strong damping ensures decay to rest
 *   - Force strength carefully calibrated for visible-but-stable ripples
 */

const WAVE_JOINTS = [
  { idx: 7, weight: 1.0 },   // L_wrist
  { idx: 8, weight: 1.0 },   // R_wrist
  { idx: 5, weight: 0.5 },   // L_elbow
  { idx: 6, weight: 0.5 },   // R_elbow
  { idx: 3, weight: 0.2 },   // L_shoulder
  { idx: 4, weight: 0.2 },   // R_shoulder
];

export class StreamInkRenderer {
  ctx = null;
  canvas = null;
  isActive = false;
  _dpr = 1;

  _lines = [];
  _initialized = false;
  _prevJoints = null;
  _prevTime = 0;

  config = {
    mirror: true,
    visibilityThreshold: 0.35,

    // Grid
    lineCount: 45,
    pointsPerLine: 80,

    // Colors
    baseColor: [55, 70, 62],
    rippleColor: [30, 45, 38],
    lineOpacity: [0.06, 0.20],
    lineWidth: [0.5, 1.5],

    // Physics — carefully balanced for stability
    damping: 0.90,           // strong damping: energy decays ~10%/frame
    springK: 0.06,           // firm spring: fast return to rest
    propagation: 0.12,       // conservative wave spreading
    interLinePropagation: 0.02, // very gentle cross-line coupling
    maxDisplacement: 25,     // hard clamp in pixels (prevents runaway)

    // Joint interaction
    forceRadius: 0.15,       // normalized radius of influence
    forceStrength: 1.2,      // moderate impulse strength
    speedThreshold: 0.01,    // ignore micro-jitter below this
    speedCap: 0.20,          // clamp speed above this
  };

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: false });
  }

  configure(inkConfig) {
    if (inkConfig?.wave) {
      Object.assign(this.config, inkConfig.wave);
    }
  }

  resize(width, height) {
    this._dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * this._dpr;
    this.canvas.height = height * this._dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    this._initLines(width, height);
  }

  _initLines(w, h) {
    const cfg = this.config;
    this._lines = [];

    for (let i = 0; i < cfg.lineCount; i++) {
      const t = (i + 0.5) / cfg.lineCount;
      const yRest = t * h;

      const points = [];
      for (let j = 0; j < cfg.pointsPerLine; j++) {
        points.push({ dy: 0, vy: 0 });  // vertical displacement only
      }

      this._lines.push({
        yRest,
        points,
        opacity: lerp(cfg.lineOpacity[0], cfg.lineOpacity[1],
          0.3 + Math.random() * 0.7),
        width: lerp(cfg.lineWidth[0], cfg.lineWidth[1], Math.random()),
        baseCurve: (Math.random() - 0.5) * 3,
      });
    }

    this._initialized = true;
  }

  clear() {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
    // Don't reset _prevJoints here — clear() is called each render frame
  }

  activate() { this.isActive = true; }
  deactivate() {
    this.isActive = false;
    this._prevJoints = null;
  }

  render(joints, timestamp) {
    if (!this.isActive || !joints || !this._initialized) return;

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const dt = this._prevTime > 0 ? (timestamp - this._prevTime) / 1000 : 0;

    // Apply forces from joint movement
    if (dt > 0 && dt < 0.25 && this._prevJoints) {
      this._applyJointForces(joints, w, h, dt);
    }

    // Physics step
    this._simulate(h);

    // Render
    this.clear();
    this._drawLines(w, h);

    this._prevJoints = joints.map(j => [j[0], j[1]]);
    this._prevTime = timestamp;
  }

  // ─── Force Application ───────────────────────────────────

  _applyJointForces(joints, w, h, dt) {
    const cfg = this.config;
    const prev = this._prevJoints;

    for (const { idx, weight } of WAVE_JOINTS) {
      const [x, y, , vis] = joints[idx];
      if (vis < cfg.visibilityThreshold) continue;

      const [ox, oy] = prev[idx];
      const dx = x - ox;
      const dy = y - oy;
      const speed = Math.sqrt(dx * dx + dy * dy) / dt;

      // Skip micro-jitter, clamp extreme speeds
      if (speed < cfg.speedThreshold) continue;
      const clampedSpeed = Math.min(speed, cfg.speedCap);

      // Normalized joint position (mirrored)
      const jnx = cfg.mirror ? (1 - x) : x;
      const jny = y;

      // Force magnitude: speed × strength × weight
      // (weight applied once only — not doubled)
      const impulse = clampedSpeed * cfg.forceStrength * weight;

      // Push direction (primarily vertical for water waves)
      const pushDir = dy > 0 ? 1 : -1;

      const forceR = cfg.forceRadius;

      for (const line of this._lines) {
        const lineYNorm = line.yRest / h;
        const yDist = Math.abs(lineYNorm - jny);
        if (yDist > forceR * 1.5) continue;

        const nPts = line.points.length;
        for (let j = 0; j < nPts; j++) {
          const ptXNorm = (j + 0.5) / nPts;
          const xDist = Math.abs(ptXNorm - jnx);
          const dist = Math.sqrt(xDist * xDist + yDist * yDist);

          if (dist < forceR && dist > 0.001) {
            // Smooth Gaussian falloff
            const sigma = forceR * 0.4;
            const falloff = Math.exp(-(dist * dist) / (2 * sigma * sigma));

            // Apply impulse as velocity change (vertical only)
            line.points[j].vy += pushDir * impulse * falloff;
          }
        }
      }
    }
  }

  // ─── Physics Simulation ──────────────────────────────────

  _simulate(canvasHeight) {
    const cfg = this.config;
    const maxD = cfg.maxDisplacement;

    // Step 1: spring + damping per line
    for (const line of this._lines) {
      const pts = line.points;
      const n = pts.length;

      for (let j = 0; j < n; j++) {
        const p = pts[j];

        // Spring return force: F = -k * displacement
        p.vy -= p.dy * cfg.springK;

        // Neighbor propagation: wave tension along line
        // Use average of left/right neighbor difference
        let neighborForce = 0;
        if (j > 0) neighborForce += (pts[j - 1].dy - p.dy);
        if (j < n - 1) neighborForce += (pts[j + 1].dy - p.dy);
        p.vy += neighborForce * cfg.propagation;

        // Damping: energy drain each frame
        p.vy *= cfg.damping;

        // Integrate velocity → displacement
        p.dy += p.vy;

        // Hard clamp: prevent runaway
        if (p.dy > maxD) { p.dy = maxD; p.vy *= -0.3; }
        if (p.dy < -maxD) { p.dy = -maxD; p.vy *= -0.3; }

        // Kill tiny residual motion (snap to rest)
        if (Math.abs(p.dy) < 0.05 && Math.abs(p.vy) < 0.01) {
          p.dy = 0;
          p.vy = 0;
        }
      }
    }

    // Step 2: inter-line propagation (very gentle vertical coupling)
    const lines = this._lines;
    const interP = cfg.interLinePropagation;
    if (interP > 0) {
      for (let i = 0; i < lines.length; i++) {
        const pts = lines[i].points;
        for (let j = 0; j < pts.length; j++) {
          let crossForce = 0;
          if (i > 0) crossForce += (lines[i - 1].points[j].dy - pts[j].dy);
          if (i < lines.length - 1) crossForce += (lines[i + 1].points[j].dy - pts[j].dy);
          pts[j].vy += crossForce * interP;
        }
      }
    }
  }

  // ─── Drawing ─────────────────────────────────────────────

  _drawLines(w, h) {
    const ctx = this.ctx;
    const cfg = this.config;
    const [br, bg, bb] = cfg.baseColor;
    const [rr, rg, rb] = cfg.rippleColor;

    for (const line of this._lines) {
      const pts = line.points;
      const n = pts.length;
      const segW = w / (n - 1);

      // Measure line activity for color shift
      let maxDisp = 0;
      for (let j = 0; j < n; j++) {
        const d = Math.abs(pts[j].dy);
        if (d > maxDisp) maxDisp = d;
      }
      const activity = Math.min(1, maxDisp / (cfg.maxDisplacement * 0.6));

      // Color: calm→base, active→ripple (darker)
      const cr = Math.round(lerp(br, rr, activity));
      const cg = Math.round(lerp(bg, rg, activity));
      const cb = Math.round(lerp(bb, rb, activity));
      const opacity = Math.min(0.45,
        lerp(line.opacity, line.opacity * 2.0, activity));

      ctx.save();
      ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${opacity})`;
      ctx.lineWidth = line.width + activity * 0.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();

      // First point
      const startY = line.yRest + pts[0].dy +
        line.baseCurve * Math.sin(0);
      ctx.moveTo(0, startY);

      // Smooth curve through all points
      for (let j = 1; j < n; j++) {
        const px = j * segW;
        const py = line.yRest + pts[j].dy +
          line.baseCurve * Math.sin(j / n * Math.PI);

        if (j < n - 1) {
          const nx = (j + 1) * segW;
          const ny = line.yRest + pts[j + 1].dy +
            line.baseCurve * Math.sin((j + 1) / n * Math.PI);
          ctx.quadraticCurveTo(px, py, (px + nx) / 2, (py + ny) / 2);
        } else {
          ctx.lineTo(px, py);
        }
      }

      ctx.stroke();
      ctx.restore();
    }
  }

  // ─── Export ──────────────────────────────────────────────

  exportPNG(bgColor = '#e8ece6') {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const octx = off.getContext('2d');

    const grad = octx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#e8ece6');
    grad.addColorStop(1, '#d4ddd0');
    octx.fillStyle = grad;
    octx.fillRect(0, 0, w, h);
    octx.drawImage(this.canvas, 0, 0);
    return off.toDataURL('image/png');
  }
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
