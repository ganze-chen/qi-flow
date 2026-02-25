/**
 * BambooInkRenderer — 翠竹风声 墨迹渲染
 *
 * PRD 翠竹风声主题:
 * - 墨迹形态: 竖直方向的墨线，用户纵向动作产生长竖线，横向动作产生短横线交错
 * - 用户动作映射: 纵向速度→竖线长度浓淡, 横向动作→竹节/横枝, 手腕细微动作→竹叶
 * - 轨迹叠加: 是, 每段竹线叠加逐渐形成"竹林"
 * - 画布底色: 极淡黄绿 #f2f0e6
 * - 视觉高光时刻: 完整纵向伸展→一根完整墨竹从底部生长到顶部
 *
 * Rendering layers (back to front):
 *   1. Stalks:  thick vertical strokes from shoulder/elbow movement
 *   2. Nodes:   short horizontal marks at horizontal velocity spikes
 *   3. Leaves:  small angled strokes from wrist micro-movement
 */

const INK_JOINTS = [
  { idx: 7, weight: 1.0, role: 'leaf' },    // L_wrist  → leaves
  { idx: 8, weight: 1.0, role: 'leaf' },    // R_wrist  → leaves
  { idx: 5, weight: 0.8, role: 'stalk' },   // L_elbow  → segments
  { idx: 6, weight: 0.8, role: 'stalk' },   // R_elbow  → segments
  { idx: 3, weight: 0.5, role: 'stalk' },   // L_shoulder → main stalk
  { idx: 4, weight: 0.5, role: 'stalk' },   // R_shoulder → main stalk
];

export class BambooInkRenderer {
  /** @type {CanvasRenderingContext2D} */
  ctx = null;
  canvas = null;
  isActive = false;

  _prevJoints = null;
  _prevTime = 0;
  _dpr = 1;

  config = {
    mirror: true,
    visibilityThreshold: 0.35,

    // Stalk (竹竿) parameters
    stalkColor: [20, 38, 18],         // deep bamboo green-black
    stalkMinVy: 0.015,                // min vertical speed to draw stalk
    stalkWidthRange: [1.5, 5],        // [slow, fast] stroke width
    stalkOpacityRange: [0.12, 0.40],  // [slow, fast] opacity
    stalkLengthMultiplier: 2.5,       // vy × canvas height × this = stroke len

    // Node (竹节) parameters
    nodeColor: [25, 42, 22],
    nodeMinVx: 0.03,                  // min horizontal speed for node mark
    nodeWidth: [6, 20],               // length of the horizontal mark
    nodeHeight: 2,                    // thickness
    nodeOpacity: [0.2, 0.45],

    // Leaf (竹叶) parameters
    leafColor: [30, 55, 25],          // slightly greener
    leafMinSpeed: 0.008,              // any subtle movement → leaf
    leafMaxSpeed: 0.06,               // above this, too fast for leaves
    leafSize: [3, 8],                 // length of leaf stroke
    leafWidth: [0.8, 2],             // width of leaf stroke
    leafOpacity: [0.06, 0.18],
    leafScatter: Math.PI / 3,         // angular randomness
  };

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: false });
  }

  resize(width, height) {
    this._dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * this._dpr;
    this.canvas.height = height * this._dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    this._clearTransparent();
  }

  _clearTransparent() {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  clear() {
    this._clearTransparent();
    this._prevJoints = null;
  }

  activate() { this.isActive = true; }
  deactivate() { this.isActive = false; }

  /**
   * Process a frame — render bamboo strokes based on movement direction
   * @param {Array} joints — 17-joint [x,y,z,vis]
   * @param {number} timestamp — ms
   */
  render(joints, timestamp) {
    if (!this.isActive || !joints) return;

    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const cfg = this.config;
    const dt = this._prevTime > 0 ? (timestamp - this._prevTime) / 1000 : 0;

    if (dt <= 0 || dt > 0.5 || !this._prevJoints) {
      this._prevJoints = joints.map(j => [j[0], j[1]]);
      this._prevTime = timestamp;
      return;
    }

    for (const { idx, weight, role } of INK_JOINTS) {
      const [x, y, , vis] = joints[idx];
      if (vis < cfg.visibilityThreshold) continue;

      const [ox, oy] = this._prevJoints[idx];
      const dx = x - ox;
      const dy = y - oy;
      const vx = Math.abs(dx) / dt;  // horizontal speed
      const vy = Math.abs(dy) / dt;  // vertical speed
      const speed = Math.sqrt(dx * dx + dy * dy) / dt;

      // Mirror for front camera
      const px = cfg.mirror ? (1 - x) * w : x * w;
      const py = y * h;
      const opx = cfg.mirror ? (1 - ox) * w : ox * w;
      const opy = oy * h;

      if (role === 'stalk') {
        // Stalk: vertical movement creates vertical bamboo strokes
        if (vy > cfg.stalkMinVy) {
          this._drawStalk(ctx, opx, opy, px, py, vy, weight);
        }
        // Node: horizontal movement creates short horizontal marks
        if (vx > cfg.nodeMinVx) {
          this._drawNode(ctx, px, py, vx, weight);
        }
      } else if (role === 'leaf') {
        // Leaf: subtle wrist movement → falling leaf particles
        if (speed > cfg.leafMinSpeed && speed < cfg.leafMaxSpeed) {
          this._drawLeaf(ctx, px, py, dx, dy, speed, weight);
        }
        // Wrist can also create thin stalks on strong vertical movement
        if (vy > cfg.stalkMinVy * 1.5) {
          this._drawStalk(ctx, opx, opy, px, py, vy, weight * 0.5);
        }
      }
    }

    this._prevJoints = joints.map(j => [j[0], j[1]]);
    this._prevTime = timestamp;
  }

  /**
   * Draw a bamboo stalk segment — vertical stroke with ink wash feel
   * The stroke follows the movement direction but is "attracted" toward vertical
   */
  _drawStalk(ctx, x1, y1, x2, y2, vy, weight) {
    const cfg = this.config;
    const [r, g, b] = cfg.stalkColor;

    // Normalize speed for parameter mapping
    const speedNorm = Math.min(1, (vy - cfg.stalkMinVy) / 0.12);

    const strokeWidth = lerp(cfg.stalkWidthRange[0], cfg.stalkWidthRange[1], speedNorm) * weight;
    const opacity = lerp(cfg.stalkOpacityRange[0], cfg.stalkOpacityRange[1], speedNorm) * weight;

    if (strokeWidth < 0.3 || opacity < 0.01) return;

    // Bias stroke toward vertical: reduce horizontal component by 70%
    const midX = (x1 + x2) / 2;
    const vx1 = midX + (x1 - midX) * 0.3;
    const vx2 = midX + (x2 - midX) * 0.3;

    ctx.save();
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Slight curve for organic feel (bamboo isn't perfectly straight)
    const cpx = midX + (Math.random() - 0.5) * strokeWidth * 2;
    const cpy = (y1 + y2) / 2;

    ctx.beginPath();
    ctx.moveTo(vx1, y1);
    ctx.quadraticCurveTo(cpx, cpy, vx2, y2);
    ctx.stroke();

    // Optional: faint "shadow" stroke for depth
    if (opacity > 0.2) {
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity * 0.15})`;
      ctx.lineWidth = strokeWidth * 2.5;
      ctx.beginPath();
      ctx.moveTo(vx1, y1);
      ctx.quadraticCurveTo(cpx + strokeWidth, cpy, vx2, y2);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Draw a bamboo node (竹节) — short horizontal mark
   * These create the characteristic segmented look
   */
  _drawNode(ctx, x, y, vx, weight) {
    const cfg = this.config;
    const [r, g, b] = cfg.nodeColor;

    const speedNorm = Math.min(1, (vx - cfg.nodeMinVx) / 0.08);
    const halfWidth = lerp(cfg.nodeWidth[0], cfg.nodeWidth[1], speedNorm) * weight / 2;
    const opacity = lerp(cfg.nodeOpacity[0], cfg.nodeOpacity[1], speedNorm) * weight;

    if (halfWidth < 1 || opacity < 0.01) return;

    ctx.save();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;

    // Slightly tilted rectangle
    const tilt = (Math.random() - 0.5) * 0.15;
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.fillRect(-halfWidth, -cfg.nodeHeight / 2, halfWidth * 2, cfg.nodeHeight);
    ctx.restore();
  }

  /**
   * Draw a bamboo leaf (竹叶) — small angled brushstroke
   * Leaves are thin, tapered strokes at various angles
   */
  _drawLeaf(ctx, x, y, dx, dy, speed, weight) {
    const cfg = this.config;
    const [r, g, b] = cfg.leafColor;

    const speedNorm = (speed - cfg.leafMinSpeed) / (cfg.leafMaxSpeed - cfg.leafMinSpeed);
    const size = lerp(cfg.leafSize[0], cfg.leafSize[1], speedNorm) * weight;
    const width = lerp(cfg.leafWidth[0], cfg.leafWidth[1], speedNorm) * weight;
    const opacity = lerp(cfg.leafOpacity[0], cfg.leafOpacity[1], speedNorm) * weight;

    if (size < 1 || opacity < 0.01) return;

    // Base angle: downward (leaves fall), plus scatter
    const baseAngle = Math.PI / 2 + Math.atan2(dy, dx) * 0.3;
    const angle = baseAngle + (Math.random() - 0.5) * cfg.leafScatter;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Tapered leaf shape: thickest at center, thin at tips
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
    ctx.beginPath();
    ctx.moveTo(-size / 2, 0);
    ctx.quadraticCurveTo(-size / 4, -width, 0, 0);
    ctx.quadraticCurveTo(-size / 4, width, -size / 2, 0);
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(size / 4, -width, size / 2, 0);
    ctx.quadraticCurveTo(size / 4, width, 0, 0);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Export current canvas as PNG (bamboo on yellow-green background)
   */
  exportPNG(bgColor = '#f2f0e6') {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const octx = offscreen.getContext('2d');
    octx.fillStyle = bgColor;
    octx.fillRect(0, 0, w, h);
    octx.drawImage(this.canvas, 0, 0);
    return offscreen.toDataURL('image/png');
  }
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
