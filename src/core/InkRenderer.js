/**
 * InkRenderer — 踏雪留痕 基础墨迹渲染
 *
 * PRD 踏雪留痕主题:
 * - 墨迹形态: 椭圆形墨点，中心浓四周淡，轻微晕染扩散
 * - 用户动作映射: 关节位置→墨点位置，移动速度→墨点间距，动作力度→墨点大小
 * - 轨迹叠加: 每次动作墨迹永久保留，层层叠加
 * - 画布底色: 近白色微灰 #f0ece4
 *
 * Week 1 验收: 用户面对摄像头做动作，画布上实时生成叠加墨点
 */

// Which joints produce ink (wrists and elbows are main "brush tips")
const INK_JOINTS = [
  { idx: 7, weight: 1.0, label: 'left_wrist' },
  { idx: 8, weight: 1.0, label: 'right_wrist' },
  { idx: 5, weight: 0.5, label: 'left_elbow' },
  { idx: 6, weight: 0.5, label: 'right_elbow' },
  { idx: 3, weight: 0.25, label: 'left_shoulder' },
  { idx: 4, weight: 0.25, label: 'right_shoulder' },
];

export class InkRenderer {
  /** @type {CanvasRenderingContext2D} */
  ctx = null;
  canvas = null;
  isActive = false;

  // Previous joint positions for velocity calculation
  _prevJoints = null;
  _prevTime = 0;

  // Ink parameters (tunable)
  config = {
    baseRadius: 8,        // Base ink dot radius (px)
    maxRadius: 25,        // Max radius for slow movement
    minRadius: 3,         // Min radius for fast movement
    opacity: 0.12,        // Base opacity per dot
    maxOpacity: 0.25,     // Max opacity (slow movement)
    minOpacity: 0.04,     // Min opacity (fast movement)
    speedThreshold: 0.02, // Below this speed, max ink
    speedCap: 0.15,       // Above this speed, min ink
    blurRadius: 4,        // Gaussian blur for ink spread
    inkColor: [26, 20, 16], // var(--ink-deepest) RGB
    mirror: true,         // Mirror for front camera
    visibilityThreshold: 0.4, // Min joint visibility to draw
  };

  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: false });
  }

  /**
   * Resize and reset canvas
   * Note: Resizing clears accumulated ink!
   */
  resize(width, height) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._fillBackground();
  }

  /**
   * Clear canvas to transparent (xuan paper color comes from body background)
   * Must be transparent so guide-canvas layer above remains visible.
   */
  _fillBackground() {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  /**
   * Clear all accumulated ink
   */
  clear() {
    this._fillBackground();
    this._prevJoints = null;
  }

  /**
   * Process a frame of joint data and render ink dots
   * @param {Array} joints - 17 joints [x, y, z, vis]
   * @param {number} timestamp - ms
   */
  render(joints, timestamp) {
    if (!this.isActive || !joints) return;

    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const cfg = this.config;
    const dt = this._prevTime > 0 ? (timestamp - this._prevTime) / 1000 : 0;

    for (const { idx, weight } of INK_JOINTS) {
      const [x, y, z, vis] = joints[idx];
      if (vis < cfg.visibilityThreshold) continue;

      // Current position (mirrored)
      const px = cfg.mirror ? (1 - x) * w : x * w;
      const py = y * h;

      // Calculate velocity from previous frame
      let speed = 0;
      if (this._prevJoints && this._prevJoints[idx] && dt > 0) {
        const [ox, oy] = this._prevJoints[idx];
        const dx = x - ox;
        const dy = y - oy;
        speed = Math.sqrt(dx * dx + dy * dy) / dt; // normalized units/sec
      }

      // Speed → ink parameters mapping
      // Slow movement = big, dark dots (like stepping firmly in snow)
      // Fast movement = small, light dots (like running across)
      const speedNorm = Math.max(0, Math.min(1,
        (speed - cfg.speedThreshold) / (cfg.speedCap - cfg.speedThreshold)
      ));

      const radius = lerp(cfg.maxRadius, cfg.minRadius, speedNorm) * weight;
      const opacity = lerp(cfg.maxOpacity, cfg.minOpacity, speedNorm) * weight * vis;

      if (radius < 1 || opacity < 0.01) continue;

      // Draw ink dot with radial gradient (center dark, edge fading)
      this._drawInkDot(ctx, px, py, radius, opacity, cfg.inkColor);
    }

    // Store current joints for next frame velocity calculation
    this._prevJoints = joints.map((j) => [j[0], j[1]]);
    this._prevTime = timestamp;
  }

  /**
   * Draw a single ink dot with ink-wash aesthetics
   * Elliptical, center-dark, edge-fading
   */
  _drawInkDot(ctx, x, y, radius, opacity, [r, g, b]) {
    // Slight random variation for organic feel
    const rx = radius * (0.85 + Math.random() * 0.3);
    const ry = radius * (0.75 + Math.random() * 0.5);
    const angle = Math.random() * Math.PI;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Radial gradient: dense center → transparent edge
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry));
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${opacity})`);
    grad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${opacity * 0.6})`);
    grad.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${opacity * 0.2})`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Export current canvas as PNG data URL
   * Composites ink onto xuan paper background for standalone artwork
   */
  exportPNG(bgColor = '#f0ece4') {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const octx = offscreen.getContext('2d');
    // Fill xuan paper background
    octx.fillStyle = bgColor;
    octx.fillRect(0, 0, w, h);
    // Draw accumulated ink on top
    octx.drawImage(this.canvas, 0, 0);
    return offscreen.toDataURL('image/png');
  }

  /**
   * Activate rendering
   */
  activate() {
    this.isActive = true;
  }

  /**
   * Deactivate rendering
   */
  deactivate() {
    this.isActive = false;
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
