/**
 * DebugOverlay — 调试可视化层
 *
 * Renders skeleton, joint points, and confidence on the debug canvas.
 * Toggle with 'D' key.
 */
import { SKELETON_CONNECTIONS, JOINT_LABELS } from '../core/JointMapper.js';

const COLORS = {
  joint: 'rgba(196, 163, 90, 0.9)',        // accent-gold
  jointLow: 'rgba(196, 163, 90, 0.3)',      // low visibility
  bone: 'rgba(196, 163, 90, 0.4)',           // skeleton lines
  text: 'rgba(240, 236, 228, 0.7)',          // label text
  bg: 'rgba(26, 20, 16, 0.6)',              // label background
};

export class DebugOverlay {
  /** @type {CanvasRenderingContext2D} */
  ctx = null;
  canvas = null;
  isVisible = true;
  showLabels = false; // toggle with 'L' key

  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  /**
   * Resize canvas to match container
   */
  resize(width, height) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Clear the overlay
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Draw skeleton from 17 joints
   * Coordinates are normalized [0,1] → need to multiply by canvas size
   *
   * @param {Array} joints - 17 joints, each [x, y, z, visibility]
   * @param {Object} opts
   */
  drawSkeleton(joints, opts = {}) {
    if (!this.isVisible || !joints) return;

    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const mirror = opts.mirror !== false; // default mirror for front camera

    this.clear();

    // Draw connections first (behind joints)
    ctx.lineWidth = 2;
    for (const [i, j] of SKELETON_CONNECTIONS) {
      const a = joints[i];
      const b = joints[j];
      if (!a || !b) continue;
      const avgVis = (a[3] + b[3]) / 2;
      if (avgVis < 0.2) continue;

      ctx.strokeStyle = `rgba(196, 163, 90, ${avgVis * 0.5})`;
      ctx.beginPath();
      ctx.moveTo(mirror ? (1 - a[0]) * w : a[0] * w, a[1] * h);
      ctx.lineTo(mirror ? (1 - b[0]) * w : b[0] * w, b[1] * h);
      ctx.stroke();
    }

    // Draw joints
    for (let i = 0; i < joints.length; i++) {
      const [x, y, z, vis] = joints[i];
      if (vis < 0.1) continue;

      const px = mirror ? (1 - x) * w : x * w;
      const py = y * h;
      const radius = Math.max(3, 6 * vis);

      // Joint dot
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = vis > 0.5 ? COLORS.joint : COLORS.jointLow;
      ctx.fill();

      // Label (optional)
      if (this.showLabels && vis > 0.3) {
        const label = JOINT_LABELS[i] || `${i}`;
        ctx.font = '10px monospace';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(px + 8, py - 6, tw + 6, 14);
        ctx.fillStyle = COLORS.text;
        ctx.fillText(label, px + 11, py + 4);
      }
    }
  }

  /**
   * Draw calibration baseline overlay
   * Shows baseline pose as ghost
   */
  drawBaseline(baseline) {
    if (!this.isVisible || !baseline) return;

    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(196, 163, 90, 0.15)';
    ctx.lineWidth = 1;

    for (const [i, j] of SKELETON_CONNECTIONS) {
      const a = baseline[i];
      const b = baseline[j];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo((1 - a[0]) * w, a[1] * h);
      ctx.lineTo((1 - b[0]) * w, b[1] * h);
      ctx.stroke();
    }

    ctx.restore();
  }

  toggle() {
    this.isVisible = !this.isVisible;
    if (!this.isVisible) this.clear();
  }

  toggleLabels() {
    this.showLabels = !this.showLabels;
  }
}
