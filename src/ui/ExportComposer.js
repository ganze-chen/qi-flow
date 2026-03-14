/**
 * ExportComposer — 作品导出装帧
 *
 * PRD §3.4: 叠加时节印章和用户自选的落款
 * PRD §6.4: 共舞导出标注"共舞"印章 + 双方匿名ID
 *
 * Renders final artwork with:
 *   1. Base ink canvas (from renderer)
 *   2. Theme-colored background gradient
 *   3. Seasonal seal stamp (朱文印 — red square seal)
 *   4. User signature (落款 — brush-style text)
 *   5. Co-dance badge + dual aliases (if applicable)
 *   6. Subtle "行气" watermark
 */

const SEAL_RED = '#b33a3a';
const SEAL_RED_ALPHA = 'rgba(179, 58, 58, 0.85)';
const SEAL_SIZE = 52;          // px base (scaled to canvas)
const SIGNATURE_COLOR = 'rgba(74, 64, 56, 0.55)';

export class ExportComposer {

  /**
   * Compose a decorated artwork canvas
   *
   * @param {Object} opts
   * @param {HTMLCanvasElement} opts.inkCanvas   — raw ink layer
   * @param {string}  opts.bgColor               — theme background hex
   * @param {string[]} opts.bgGradient            — [top, bottom] gradient colors
   * @param {string}  opts.seasonText             — e.g. "冬 · 大雪"
   * @param {string}  opts.themeName              — e.g. "踏雪留痕"
   * @param {string}  opts.signature              — user's chosen signature text
   * @param {boolean} opts.isDark                 — dark theme (bird)?
   * @param {boolean} opts.isCoDance              — co-dance mode?
   * @param {string}  [opts.partnerAlias]         — partner's alias for co-dance
   * @param {string}  [opts.userAlias]            — user's alias for co-dance
   * @returns {HTMLCanvasElement}
   */
  compose(opts) {
    const {
      inkCanvas,
      bgColor = '#f0ece4',
      bgGradient,
      seasonText = '',
      themeName = '',
      signature = '',
      isDark = false,
      isCoDance = false,
      partnerAlias = '',
      userAlias = '',
    } = opts;

    const w = inkCanvas.width;
    const h = inkCanvas.height;
    const scale = w / 1200;  // scale decorations relative to 1200px base

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // 1. Background gradient
    if (bgGradient && bgGradient.length === 2) {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, bgGradient[0]);
      grad.addColorStop(1, bgGradient[1]);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = bgColor;
    }
    ctx.fillRect(0, 0, w, h);

    // 2. Ink layer
    ctx.drawImage(inkCanvas, 0, 0);

    // 3. Seasonal seal stamp (right bottom area)
    const sealX = w - 80 * scale;
    const sealY = h - 80 * scale;
    this._drawSeal(ctx, sealX, sealY, seasonText, scale, isDark);

    // 4. User signature (落款 — left of seal, vertical text)
    if (signature) {
      this._drawSignature(ctx, w - 140 * scale, h - 60 * scale, signature, scale, isDark);
    }

    // 5. Co-dance decorations
    if (isCoDance) {
      // "共舞" seal — top-left area
      this._drawCoDanceSeal(ctx, 40 * scale, h - 90 * scale, scale, isDark);

      // Dual aliases below the co-dance seal
      if (partnerAlias || userAlias) {
        const aliasText = [partnerAlias, userAlias].filter(Boolean).join(' · ');
        this._drawCoDanceAliases(ctx, 40 * scale, h - 32 * scale, aliasText, scale, isDark);
      }
    }

    // 6. "行气" watermark — very subtle, bottom center
    this._drawWatermark(ctx, w / 2, h - 18 * scale, scale, isDark);

    return canvas;
  }

  /**
   * Get data URL from composed canvas
   */
  composeToDataURL(opts) {
    const canvas = this.compose(opts);
    return canvas.toDataURL('image/png');
  }

  // ─── Seal Stamp (朱文方印) ──────────────────────────────

  _drawSeal(ctx, cx, cy, text, scale, isDark) {
    const s = SEAL_SIZE * scale;
    const half = s / 2;

    ctx.save();
    ctx.translate(cx, cy);

    // Slight random rotation for organic feel
    ctx.rotate(-0.04 + Math.random() * 0.02);

    // Outer border (square with rounded corners)
    const r = 3 * scale;
    ctx.strokeStyle = SEAL_RED_ALPHA;
    ctx.lineWidth = 2.5 * scale;
    this._roundRect(ctx, -half, -half, s, s, r);
    ctx.stroke();

    // Inner border (thinner)
    const inset = 4 * scale;
    ctx.lineWidth = 1 * scale;
    ctx.strokeStyle = 'rgba(179, 58, 58, 0.4)';
    this._roundRect(ctx, -half + inset, -half + inset, s - inset * 2, s - inset * 2, r * 0.5);
    ctx.stroke();

    // Seal text — up to 4 characters, 2×2 grid layout
    const chars = text.replace(/\s*·\s*/, '').slice(0, 4);
    if (chars.length > 0) {
      ctx.fillStyle = SEAL_RED_ALPHA;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const fontSize = chars.length <= 2
        ? Math.round(18 * scale)
        : Math.round(14 * scale);

      ctx.font = `700 ${fontSize}px "Noto Serif SC", serif`;

      if (chars.length <= 2) {
        // Vertical: one char per row
        for (let i = 0; i < chars.length; i++) {
          const y = (i - (chars.length - 1) / 2) * fontSize * 1.1;
          ctx.fillText(chars[i], 0, y);
        }
      } else {
        // 2×2 grid
        const positions = [
          [-0.3, -0.3], [0.3, -0.3],
          [-0.3, 0.3],  [0.3, 0.3],
        ];
        for (let i = 0; i < Math.min(chars.length, 4); i++) {
          const px = positions[i][0] * (s - inset * 3);
          const py = positions[i][1] * (s - inset * 3);
          ctx.fillText(chars[i], px, py);
        }
      }
    }

    // Texture: add slight grunge by randomly hiding small areas
    // (simulates ink stamp imperfections)
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 8; i++) {
      const gx = (Math.random() - 0.5) * s * 0.8;
      const gy = (Math.random() - 0.5) * s * 0.8;
      const gr = (1 + Math.random() * 2) * scale;
      ctx.globalAlpha = 0.15 + Math.random() * 0.2;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ─── Co-Dance Seal (共舞印) ─────────────────────────────

  _drawCoDanceSeal(ctx, cx, cy, scale, isDark) {
    const s = 44 * scale;
    const half = s / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(0.03);

    // Circular seal for co-dance
    ctx.strokeStyle = SEAL_RED_ALPHA;
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.arc(0, 0, half, 0, Math.PI * 2);
    ctx.stroke();

    // Inner circle
    ctx.lineWidth = 0.8 * scale;
    ctx.strokeStyle = 'rgba(179, 58, 58, 0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, half - 4 * scale, 0, Math.PI * 2);
    ctx.stroke();

    // "共舞" text
    ctx.fillStyle = SEAL_RED_ALPHA;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = Math.round(13 * scale);
    ctx.font = `700 ${fs}px "Noto Serif SC", serif`;
    ctx.fillText('共', 0, -fs * 0.45);
    ctx.fillText('舞', 0, fs * 0.55);

    // Grunge
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 5; i++) {
      const gx = (Math.random() - 0.5) * s * 0.6;
      const gy = (Math.random() - 0.5) * s * 0.6;
      ctx.globalAlpha = 0.15 + Math.random() * 0.15;
      ctx.beginPath();
      ctx.arc(gx, gy, (1 + Math.random()) * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ─── Signature (落款) ───────────────────────────────────

  _drawSignature(ctx, x, y, text, scale, isDark) {
    ctx.save();
    ctx.translate(x, y);

    const fontSize = Math.round(13 * scale);
    ctx.font = `300 ${fontSize}px "Noto Serif SC", serif`;
    ctx.fillStyle = isDark ? 'rgba(200, 195, 180, 0.4)' : SIGNATURE_COLOR;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';

    // Vertical text: each character on a new line, from top to bottom
    const chars = text.split('');
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], 0, -((chars.length - 1 - i) * fontSize * 1.3));
    }

    ctx.restore();
  }

  // ─── Co-Dance Aliases ───────────────────────────────────

  _drawCoDanceAliases(ctx, x, y, text, scale, isDark) {
    ctx.save();
    const fontSize = Math.round(10 * scale);
    ctx.font = `300 ${fontSize}px "Noto Serif SC", serif`;
    ctx.fillStyle = isDark ? 'rgba(200, 195, 180, 0.35)' : 'rgba(74, 64, 56, 0.4)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ─── Watermark ──────────────────────────────────────────

  _drawWatermark(ctx, x, y, scale, isDark) {
    ctx.save();
    const fontSize = Math.round(9 * scale);
    ctx.font = `300 ${fontSize}px "Noto Serif SC", serif`;
    ctx.fillStyle = isDark ? 'rgba(200, 195, 180, 0.15)' : 'rgba(74, 64, 56, 0.12)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('行气 · Qi-Flow', x, y);
    ctx.restore();
  }

  // ─── Utility ────────────────────────────────────────────

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
