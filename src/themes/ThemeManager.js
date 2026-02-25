/**
 * ThemeManager — 主题管理器
 *
 * Orchestrates theme switching: reconfigures InkRenderer, AudioEngine,
 * GuideRenderer, and canvas background to match the selected theme.
 *
 * Usage:
 *   const tm = new ThemeManager();
 *   tm.register('ink', inkRenderer);     // or bambooInk, etc.
 *   tm.register('guide', guideRenderer);
 *   tm.register('audio', audioEngine);
 *   tm.applyTheme('bamboo');
 */

import { getTheme, ThemeId } from './ThemeRegistry.js';
import { bus, Events } from '../utils/EventBus.js';

export class ThemeManager {
  /** @type {string} current theme ID */
  currentThemeId = null;

  /** @type {Object} current theme config */
  theme = null;

  /** registered module instances keyed by role */
  _modules = {};

  /**
   * Register a module by role name
   * @param {string} role — 'ink' | 'guide' | 'audio' | 'templateLoader'
   * @param {Object} instance
   */
  register(role, instance) {
    this._modules[role] = instance;
  }

  /**
   * Get registered module
   */
  get(role) {
    return this._modules[role];
  }

  /**
   * Apply a theme — reconfigures all registered modules
   * @param {string} themeId
   * @returns {Object} theme config
   */
  applyTheme(themeId) {
    const theme = getTheme(themeId);
    this.currentThemeId = themeId;
    this.theme = theme;

    console.log(`[ThemeManager] Applying theme: ${theme.meta.name} (${themeId})`);

    // 1. Canvas background
    this._applyBackground(theme);

    // 2. Guide renderer colors
    const guide = this._modules.guide;
    if (guide) {
      this._configureGuide(guide, theme);
    }

    // 3. Audio engine configuration
    const audio = this._modules.audio;
    if (audio) {
      audio.configure?.(theme.audio);
    }

    // 4. HUD title
    this._applyHudTitle(theme);

    bus.emit(Events.THEME_CHANGE, { themeId, theme });

    return theme;
  }

  /**
   * Get the template data path for the current theme
   */
  getTemplatePath() {
    return this.theme?.template || '/data/pose_upperbody1-2_data-compressed.json';
  }

  /**
   * Get canvas background for export
   */
  getExportBackground() {
    return this.theme?.canvas?.background || '#f0ece4';
  }

  // ─── Private ─────────────────────────────────────────────

  _applyBackground(theme) {
    const { background, backgroundGradient } = theme.canvas;
    if (backgroundGradient) {
      document.body.style.background =
        `linear-gradient(180deg, ${backgroundGradient[0]}, ${backgroundGradient[1]})`;
    } else {
      document.body.style.background = background;
    }
  }

  _configureGuide(guide, theme) {
    const g = theme.guide;
    guide.config.trailColor = g.trailColor;
    guide.config.currentColor = g.currentColor;
    guide.config.futureColor = g.futureColor;
    guide.config.connectionAlpha = g.connectionAlpha;
  }

  _applyHudTitle(theme) {
    const el = document.querySelector('#hud-theme-name');
    if (el) {
      el.textContent = `${theme.meta.name} · ${theme.meta.nameEn}`;
    }
  }
}
