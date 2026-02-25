/**
 * BirdInkRenderer — 月下鸟群 · Bird Murmuration in Moonlight
 *
 * PRD 月下鸟群:
 * - 墨迹形态: 数百个微小粒子构成鸟群形态，游弋于画布
 * - 用户动作映射: 手部关节位置→光源位置。用户抬手时"月光"照亮附近鸟群粒子
 * - 轨迹叠加: 否 — 鸟群为实时响应式，不保留历史轨迹
 * - 视觉高光时刻: 双手同时抬起→两束月光交叉，照亮大面积鸟群
 *
 * Physics: Craig Reynolds' Boids (separation + alignment + cohesion)
 * with hand-position attraction and moonlight illumination.
 */

export class BirdInkRenderer {
  ctx = null;
  canvas = null;
  isActive = false;
  _dpr = 1;

  /** @type {Array<{x,y,vx,vy,size}>} */
  _birds = [];
  _initialized = false;

  // Hand positions (normalized 0-1, mirrored)
  _hands = [
    { x: 0.3, y: 0.5, active: false },  // left wrist
    { x: 0.7, y: 0.5, active: false },  // right wrist
  ];

  config = {
    mirror: true,
    visibilityThreshold: 0.3,
    count: 300,
    size: [1.5, 3.5],
    baseColor: [60, 60, 90],
    litColor: [210, 215, 235],
    moonColor: [240, 235, 200],
    separationDist: 18,
    alignmentDist: 50,
    cohesionDist: 60,
    separationForce: 0.04,
    alignmentForce: 0.02,
    cohesionForce: 0.008,
    maxSpeed: 2.5,
    minSpeed: 0.3,
    lightRadius: 0.18,
    lightIntensity: 1.0,
    lightFalloff: 2.0,
    handAttractionForce: 0.015,
    handAttractionRadius: 0.25,
  };

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: false });
  }

  /**
   * Apply theme config overrides from ThemeRegistry
   */
  configure(inkConfig) {
    if (inkConfig?.boid) {
      Object.assign(this.config, inkConfig.boid);
    }
  }

  resize(width, height) {
    this._dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * this._dpr;
    this.canvas.height = height * this._dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);

    // (Re)initialize birds on resize
    this._initBirds(width, height);
  }

  _initBirds(w, h) {
    const n = this.config.count;
    this._birds = [];
    for (let i = 0; i < n; i++) {
      this._birds.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        size: lerp(this.config.size[0], this.config.size[1], Math.random()),
      });
    }
    this._initialized = true;
  }

  clear() {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  activate() { this.isActive = true; }
  deactivate() { this.isActive = false; }

  /**
   * Main render — update boid physics + draw
   */
  render(joints, timestamp) {
    if (!this.isActive || !joints || !this._initialized) return;

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const cfg = this.config;

    // Extract hand positions from joints
    this._updateHands(joints, w, h);

    // Update boid physics
    this._updateBoids(w, h);

    // Clear (no accumulation)
    this.clear();

    // Draw moonlight glow halos
    this._drawMoonlightGlow(w, h);

    // Draw birds
    this._drawBirds(w, h);
  }

  /**
   * Extract hand (wrist) positions for moonlight sources
   */
  _updateHands(joints, w, h) {
    const cfg = this.config;
    // Left wrist = idx 7, Right wrist = idx 8
    for (let i = 0; i < 2; i++) {
      const idx = i === 0 ? 7 : 8;
      const [x, y, , vis] = joints[idx];
      this._hands[i].active = vis > cfg.visibilityThreshold;
      if (this._hands[i].active) {
        // Store as pixel coordinates (mirrored)
        this._hands[i].x = cfg.mirror ? (1 - x) * w : x * w;
        this._hands[i].y = y * h;
        // Normalized for distance calculations
        this._hands[i].nx = cfg.mirror ? (1 - x) : x;
        this._hands[i].ny = y;
      }
    }
  }

  /**
   * Boid simulation step
   */
  _updateBoids(w, h) {
    const birds = this._birds;
    const n = birds.length;
    const cfg = this.config;
    const sepD = cfg.separationDist;
    const aliD = cfg.alignmentDist;
    const cohD = cfg.cohesionDist;

    for (let i = 0; i < n; i++) {
      const b = birds[i];

      // Boid accumulators
      let sepX = 0, sepY = 0, sepCount = 0;
      let aliVx = 0, aliVy = 0, aliCount = 0;
      let cohX = 0, cohY = 0, cohCount = 0;

      // Sample neighbors (check subset for performance)
      const step = n > 200 ? 3 : 1;
      for (let j = 0; j < n; j += step) {
        if (i === j) continue;
        const o = birds[j];
        const dx = o.x - b.x;
        const dy = o.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);

        if (d < sepD && d > 0) {
          sepX -= dx / d;
          sepY -= dy / d;
          sepCount++;
        }
        if (d < aliD) {
          aliVx += o.vx;
          aliVy += o.vy;
          aliCount++;
        }
        if (d < cohD) {
          cohX += o.x;
          cohY += o.y;
          cohCount++;
        }
      }

      // Apply boid forces
      if (sepCount > 0) {
        b.vx += (sepX / sepCount) * cfg.separationForce;
        b.vy += (sepY / sepCount) * cfg.separationForce;
      }
      if (aliCount > 0) {
        b.vx += ((aliVx / aliCount) - b.vx) * cfg.alignmentForce;
        b.vy += ((aliVy / aliCount) - b.vy) * cfg.alignmentForce;
      }
      if (cohCount > 0) {
        const cx = cohX / cohCount;
        const cy = cohY / cohCount;
        b.vx += (cx - b.x) * cfg.cohesionForce * 0.01;
        b.vy += (cy - b.y) * cfg.cohesionForce * 0.01;
      }

      // Hand attraction — birds are drawn toward active hands
      for (const hand of this._hands) {
        if (!hand.active) continue;
        const dx = hand.x - b.x;
        const dy = hand.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const radius = cfg.handAttractionRadius * w;
        if (d < radius && d > 5) {
          const strength = (1 - d / radius) * cfg.handAttractionForce;
          b.vx += (dx / d) * strength * w * 0.002;
          b.vy += (dy / d) * strength * h * 0.002;
        }
      }

      // Speed limits
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (speed > cfg.maxSpeed) {
        b.vx = (b.vx / speed) * cfg.maxSpeed;
        b.vy = (b.vy / speed) * cfg.maxSpeed;
      } else if (speed < cfg.minSpeed && speed > 0) {
        b.vx = (b.vx / speed) * cfg.minSpeed;
        b.vy = (b.vy / speed) * cfg.minSpeed;
      }

      // Update position
      b.x += b.vx;
      b.y += b.vy;

      // Wrap around edges (toroidal)
      if (b.x < -20) b.x = w + 20;
      if (b.x > w + 20) b.x = -20;
      if (b.y < -20) b.y = h + 20;
      if (b.y > h + 20) b.y = -20;
    }
  }

  /**
   * Draw soft moonlight glow halos at hand positions
   */
  _drawMoonlightGlow(w, h) {
    const ctx = this.ctx;
    const cfg = this.config;
    const [mr, mg, mb] = cfg.moonColor;

    for (const hand of this._hands) {
      if (!hand.active) continue;

      const radius = cfg.lightRadius * w;
      const grad = ctx.createRadialGradient(
        hand.x, hand.y, 0,
        hand.x, hand.y, radius * 1.5
      );
      grad.addColorStop(0, `rgba(${mr}, ${mg}, ${mb}, 0.06)`);
      grad.addColorStop(0.4, `rgba(${mr}, ${mg}, ${mb}, 0.03)`);
      grad.addColorStop(1, `rgba(${mr}, ${mg}, ${mb}, 0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, radius * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Draw bird particles with moonlight illumination
   */
  _drawBirds(w, h) {
    const ctx = this.ctx;
    const birds = this._birds;
    const cfg = this.config;
    const [br, bg, bb] = cfg.baseColor;
    const [lr, lg, lb] = cfg.litColor;
    const lightR = cfg.lightRadius * w;

    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];

      // Calculate illumination from both hands
      let illumination = 0;
      for (const hand of this._hands) {
        if (!hand.active) continue;
        const dx = b.x - hand.x;
        const dy = b.y - hand.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < lightR) {
          const t = 1 - Math.pow(d / lightR, cfg.lightFalloff);
          illumination = Math.max(illumination, t * cfg.lightIntensity);
        }
      }

      illumination = Math.min(1, illumination);

      // Interpolate color between dark base and lit color
      const r = Math.round(lerp(br, lr, illumination));
      const g = Math.round(lerp(bg, lg, illumination));
      const bv = Math.round(lerp(bb, lb, illumination));
      const alpha = lerp(0.3, 0.85, illumination);

      // Draw bird as elongated ellipse in direction of movement
      const angle = Math.atan2(b.vy, b.vx);
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const stretch = 1 + speed * 0.4;  // faster = more elongated

      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(angle);

      ctx.fillStyle = `rgba(${r}, ${g}, ${bv}, ${alpha})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.size * stretch, b.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Bright core for illuminated birds
      if (illumination > 0.4) {
        ctx.fillStyle = `rgba(255, 255, 240, ${illumination * 0.3})`;
        ctx.beginPath();
        ctx.arc(0, 0, b.size * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /**
   * Export — composite birds onto dark background
   */
  exportPNG(bgColor = '#1a1a2e') {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const octx = off.getContext('2d');
    octx.fillStyle = bgColor;
    octx.fillRect(0, 0, w, h);
    octx.drawImage(this.canvas, 0, 0);
    return off.toDataURL('image/png');
  }
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
