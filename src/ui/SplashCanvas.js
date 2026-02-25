/**
 * SplashCanvas — Landing Screen Ink Particle Animation
 *
 * Subtle, ambient ink drops drifting across the xuan-paper background.
 * Creates a living, breathing first impression that says
 * "this is not a generic app — this is a space for art."
 *
 * Particles: small ink dots that drift, fade, and occasionally
 * bloom softly when near each other (like ink diffusion on wet paper).
 */

const PARTICLE_COUNT = 35;
const BLOOM_DISTANCE = 80;

export class SplashCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._particles = [];
    this._raf = 0;
    this._running = false;
  }

  start() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this._w = w;
    this._h = h;

    // Initialize particles
    this._particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this._particles.push(this._createParticle(true));
    }

    this._running = true;
    this._animate();
  }

  _createParticle(randomAge = false) {
    const w = this._w;
    const h = this._h;
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -0.08 - Math.random() * 0.12,  // drift upward gently (like rising qi)
      r: 1.5 + Math.random() * 3,
      opacity: randomAge ? Math.random() * 0.12 : 0,
      maxOpacity: 0.04 + Math.random() * 0.10,
      age: randomAge ? Math.random() * 800 : 0,
      life: 600 + Math.random() * 600,
      // Ink color variation: slight warm/cool shift
      tone: Math.random(),
    };
  }

  _animate() {
    if (!this._running) return;
    this._update();
    this._draw();
    this._raf = requestAnimationFrame(() => this._animate());
  }

  _update() {
    for (let i = 0; i < this._particles.length; i++) {
      const p = this._particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.age++;

      // Fade in/out lifecycle
      const lifeRatio = p.age / p.life;
      if (lifeRatio < 0.15) {
        p.opacity = p.maxOpacity * (lifeRatio / 0.15);
      } else if (lifeRatio > 0.7) {
        p.opacity = p.maxOpacity * (1 - (lifeRatio - 0.7) / 0.3);
      } else {
        p.opacity = p.maxOpacity;
      }

      // Respawn if dead or offscreen
      if (p.age > p.life || p.y < -20 || p.x < -20 || p.x > this._w + 20) {
        this._particles[i] = this._createParticle(false);
        this._particles[i].y = this._h + 10; // enter from bottom
        this._particles[i].x = Math.random() * this._w;
      }
    }
  }

  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this._w, this._h);

    for (const p of this._particles) {
      if (p.opacity <= 0) continue;

      // Color varies between warm ink and cool ink
      const r = Math.round(40 + p.tone * 20);
      const g = Math.round(35 + p.tone * 10);
      const b = Math.round(30 + p.tone * 15);

      // Bloom check — near neighbors create soft radial glow
      let bloom = 0;
      for (const q of this._particles) {
        if (q === p || q.opacity <= 0) continue;
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < BLOOM_DISTANCE) {
          bloom += (1 - d / BLOOM_DISTANCE) * q.opacity;
        }
      }
      bloom = Math.min(0.05, bloom);

      // Draw bloom halo
      if (bloom > 0.005) {
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 8);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${bloom})`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 8, 0, Math.PI * 2);
        ctx.fill();
      }

      // Core dot
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.opacity})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy() {
    this.stop();
  }
}
