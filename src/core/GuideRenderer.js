/**
 * GuideRenderer — "风"引导墨迹渲染器
 *
 * PRD 5.4: 动作模板不以"教学视频"或"骨骼线"的方式呈现，
 *          而是转化为"引导墨迹"——一组半透明的、随时间流动的轨迹。
 *
 * KEY FIX: Template coordinates are normalized to the user's current body
 * position using calibration data (shoulder center + width alignment).
 * This ensures the guide overlays correctly regardless of distance/position
 * differences between the recording session and the current camera view.
 */

// Which joints to render as guide trails
const GUIDE_JOINTS = [
  { idx: 7, weight: 1.0 },   // left_wrist
  { idx: 8, weight: 1.0 },   // right_wrist
  { idx: 5, weight: 0.8 },   // left_elbow
  { idx: 6, weight: 0.8 },   // right_elbow
  { idx: 3, weight: 0.5 },   // left_shoulder
  { idx: 4, weight: 0.5 },   // right_shoulder
];

// Shoulder joint indices in our 17-joint layout
const L_SHOULDER = 3;
const R_SHOULDER = 4;

export class GuideRenderer {
  /** @type {CanvasRenderingContext2D} */
  ctx = null;
  canvas = null;
  isActive = false;
  _dpr = 1;
  _w = 0;
  _h = 0;
  _renderCount = 0;

  // Coordinate alignment: maps template space → user space
  _userCenter = null;  // { x, y } user's shoulder midpoint (normalized)
  _userShoulderW = 0;  // user's shoulder width (normalized)

  config = {
    // Colors: warm gold palette
    trailColor: [180, 155, 90],
    currentColor: [200, 170, 70],
    futureColor: [170, 148, 95],

    // Sizes (px in CSS space)
    currentRadius: 16,
    guideRadius: 10,
    trailRadius: 6,

    // Opacity — boosted for visibility
    currentOpacity: 0.55,
    guideOpacity: 0.35,
    trailOpacity: 0.18,

    // Connection lines
    drawConnections: true,
    connectionAlpha: 0.15,
    connectionWidth: 2,

    mirror: true,
    visibilityThreshold: 0.15,
  };

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  resize(width, height) {
    this._dpr = window.devicePixelRatio || 1;
    this._w = width;
    this._h = height;
    this.canvas.width = width * this._dpr;
    this.canvas.height = height * this._dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
  }

  clear() {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  activate() {
    this.isActive = true;
    this._renderCount = 0;
    console.log('[GuideRenderer] Activated. Canvas:', this._w, '×', this._h,
      'UserCenter:', this._userCenter, 'UserShoulderW:', this._userShoulderW?.toFixed(3));
  }
  deactivate() { this.isActive = false; }

  /**
   * Set calibration data for coordinate alignment.
   * Template joint positions will be remapped to align with the user's
   * actual body position in the camera view.
   *
   * @param {Object} calibResult — from EnvironmentCalibrator
   */
  setCalibration(calibResult) {
    this._userCenter = {
      x: calibResult.centerX,
      y: calibResult.centerY,
    };
    this._userShoulderW = calibResult.shoulderWidth;
    console.log('[GuideRenderer] Calibration set:',
      `center=(${calibResult.centerX.toFixed(3)}, ${calibResult.centerY.toFixed(3)})`,
      `shoulderW=${calibResult.shoulderWidth.toFixed(3)}`);
  }

  // ─── Coordinate Alignment ─────────────────────────────────

  /**
   * Transform a template frame's joints into the user's coordinate space.
   *
   * For each frame:
   * 1. Compute template shoulder center & width from that frame
   * 2. For each joint, express as offset from template shoulder center
   *    scaled by template shoulder width
   * 3. Map back using user's shoulder center & width
   *
   * This handles differences in: distance from camera, body position in frame,
   * and body size between the recording and the live user.
   *
   * @param {Array} templateJoints — raw template joints [x,y,z,vis]
   * @returns {Array} — transformed joints in user's coordinate space
   */
  _alignToUser(templateJoints) {
    if (!this._userCenter || !templateJoints) return templateJoints;

    const ls = templateJoints[L_SHOULDER];
    const rs = templateJoints[R_SHOULDER];
    if (!ls || !rs) return templateJoints;

    // Template frame's reference
    const tCenterX = (ls[0] + rs[0]) / 2;
    const tCenterY = (ls[1] + rs[1]) / 2;
    const tShoulderW = Math.hypot(ls[0] - rs[0], ls[1] - rs[1]);

    if (tShoulderW < 0.01) return templateJoints; // degenerate

    // Scale factor: user shoulder width / template shoulder width
    const scale = this._userShoulderW / tShoulderW;

    // User reference
    const uCenterX = this._userCenter.x;
    const uCenterY = this._userCenter.y;

    // Transform each joint
    return templateJoints.map(([x, y, z, vis]) => {
      const alignedX = uCenterX + (x - tCenterX) * scale;
      const alignedY = uCenterY + (y - tCenterY) * scale;
      return [alignedX, alignedY, z, vis];
    });
  }

  // ─── Rendering ─────────────────────────────────────────────

  render(playbackData) {
    if (!this.isActive || !playbackData) return;

    const { guide, trail, current } = playbackData;
    this.clear();

    const ctx = this.ctx;
    const w = this._w;
    const h = this._h;
    const cfg = this.config;

    if (w === 0 || h === 0) return;

    this._renderCount++;
    if (this._renderCount <= 3) {
      console.log(`[GuideRenderer] Render #${this._renderCount}:`,
        `guide=${guide?.length || 0} trail=${trail?.length || 0}`,
        `current=${current ? 'yes' : 'no'}`);
      if (current?.joints) {
        const aligned = this._alignToUser(current.joints);
        console.log('  Raw shoulder L:', current.joints[L_SHOULDER],
          'Aligned:', aligned?.[L_SHOULDER]);
      }
    }

    let dotsDrawn = 0;

    // 1. Trail (past positions, fading)
    if (trail) {
      for (const frame of trail) {
        const aligned = this._alignToUser(frame.joints);
        dotsDrawn += this._drawJointDots(ctx, aligned, w, h,
          cfg.trailColor, cfg.trailRadius, frame.alpha * cfg.trailOpacity);
      }
    }

    // 2. Guide lookahead (future positions)
    if (guide) {
      for (const frame of guide) {
        if (frame.isCurrent) continue;
        const aligned = this._alignToUser(frame.joints);
        dotsDrawn += this._drawJointDots(ctx, aligned, w, h,
          cfg.futureColor, cfg.guideRadius, frame.alpha * cfg.guideOpacity);
      }
    }

    // 3. Current frame (brightest)
    if (current?.joints) {
      const aligned = this._alignToUser(current.joints);
      dotsDrawn += this._drawCurrentFrame(ctx, aligned, w, h);
    }

    if (this._renderCount <= 3) {
      console.log(`  → Drew ${dotsDrawn} guide dots`);
    }
  }

  _drawJointDots(ctx, joints, w, h, color, radius, opacity) {
    if (!joints) return 0;
    const cfg = this.config;
    let count = 0;

    for (const { idx, weight } of GUIDE_JOINTS) {
      if (idx >= joints.length) continue;
      const j = joints[idx];
      if (!j || j.length < 4) continue;

      const [x, y, , vis] = j;
      if (vis < cfg.visibilityThreshold) continue;

      const px = cfg.mirror ? (1 - x) * w : x * w;
      const py = y * h;
      const r = radius * weight;
      const a = opacity * weight;

      if (r < 0.5 || a < 0.003) continue;
      this._drawGuideDot(ctx, px, py, r, a, color);
      count++;
    }
    return count;
  }

  _drawCurrentFrame(ctx, joints, w, h) {
    const cfg = this.config;
    const positions = [];
    let count = 0;

    for (const { idx, weight } of GUIDE_JOINTS) {
      if (idx >= joints.length) continue;
      const j = joints[idx];
      if (!j || j.length < 4) continue;

      const [x, y, , vis] = j;
      if (vis < cfg.visibilityThreshold) continue;

      const px = cfg.mirror ? (1 - x) * w : x * w;
      const py = y * h;
      positions.push({ idx, px, py });

      const r = cfg.currentRadius * weight;
      const a = cfg.currentOpacity * weight;
      this._drawGuideDot(ctx, px, py, r, a, cfg.currentColor);
      count++;
    }

    if (cfg.drawConnections && positions.length >= 2) {
      this._drawGuideConnections(ctx, positions);
    }
    return count;
  }

  _drawGuideDot(ctx, x, y, radius, opacity, [r, g, b]) {
    if (radius < 0.5) return;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${opacity})`);
    grad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${opacity * 0.65})`);
    grad.addColorStop(0.75, `rgba(${r}, ${g}, ${b}, ${opacity * 0.25})`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawGuideConnections(ctx, positions) {
    const cfg = this.config;
    const byIdx = {};
    for (const p of positions) byIdx[p.idx] = p;

    const chains = [
      [3, 5, 7],  // L: shoulder→elbow→wrist
      [4, 6, 8],  // R: shoulder→elbow→wrist
    ];

    const [cr, cg, cb] = cfg.currentColor;
    ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${cfg.connectionAlpha})`;
    ctx.lineWidth = cfg.connectionWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const chain of chains) {
      ctx.beginPath();
      let started = false;
      for (const idx of chain) {
        if (byIdx[idx]) {
          if (!started) {
            ctx.moveTo(byIdx[idx].px, byIdx[idx].py);
            started = true;
          } else {
            ctx.lineTo(byIdx[idx].px, byIdx[idx].py);
          }
        }
      }
      if (started) ctx.stroke();
    }
  }
}
