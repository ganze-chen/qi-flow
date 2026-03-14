/**
 * MotionRecorder — 动作轨迹录制器
 *
 * Captures POSE_FRAME joint data during practice sessions,
 * producing motion data in the same format as template files:
 *   [{t: float, j: [[x,y,z,vis], ...]}, ...]
 *
 * Features:
 *   - Configurable recording FPS (default 12, matching template data)
 *   - Auto-start/stop tied to practice state
 *   - Compression on finalize (reduce precision, downsample)
 *   - Compatible with TemplateLoader for direct playback
 */

import { bus, Events } from '../utils/EventBus.js';
import {
  createArtwork,
  finalizeArtwork,
  compressMotion,
  downsampleMotion,
  createThumbnail,
} from './ArtworkSchema.js';

export class MotionRecorder {
  _frames = [];
  _isRecording = false;
  _startTime = 0;
  _themeId = 'snow';
  _targetFps = 12;
  _minFrameInterval = 0; // ms, computed from targetFps
  _lastFrameTime = 0;

  // The final artwork object (available after stop + finalize)
  artwork = null;

  constructor() {
    this._minFrameInterval = 1000 / this._targetFps;
  }

  /**
   * Configure recording parameters
   * @param {{ themeId?: string, targetFps?: number }} opts
   */
  configure({ themeId, targetFps } = {}) {
    if (themeId) this._themeId = themeId;
    if (targetFps) {
      this._targetFps = targetFps;
      this._minFrameInterval = 1000 / targetFps;
    }
  }

  /**
   * Start recording — clears previous data
   */
  start() {
    this._frames = [];
    this._startTime = performance.now();
    this._lastFrameTime = 0;
    this._isRecording = true;
    this.artwork = null;
    console.log(`[MotionRecorder] Recording started (theme=${this._themeId}, fps=${this._targetFps})`);
  }

  /**
   * Record a single frame of joint data
   * Called from POSE_FRAME handler. Automatically throttles to target FPS.
   *
   * @param {Array} joints - [[x,y,z,vis], ...] from PoseDetector
   * @param {number} now - performance.now()
   */
  recordFrame(joints, now) {
    if (!this._isRecording || !joints) return;

    // Throttle to target FPS
    if (now - this._lastFrameTime < this._minFrameInterval) return;
    this._lastFrameTime = now;

    const t = (now - this._startTime) / 1000; // seconds since recording start

    // Deep copy joints (they may be reused by PoseDetector)
    const jointsCopy = joints.map(j => [j[0], j[1], j[2], j[3]]);

    this._frames.push({ t, j: jointsCopy });
  }

  /**
   * Stop recording
   * @returns {number} frame count
   */
  stop() {
    this._isRecording = false;
    const count = this._frames.length;
    console.log(`[MotionRecorder] Recording stopped: ${count} frames, ` +
      `${count > 0 ? this._frames[count - 1].t.toFixed(1) : 0}s`);
    return count;
  }

  get isRecording() { return this._isRecording; }
  get frameCount() { return this._frames.length; }
  get elapsed() {
    if (this._frames.length === 0) return 0;
    return this._frames[this._frames.length - 1].t;
  }

  /**
   * Finalize recording into an Artwork object
   * Compresses motion data and computes metadata.
   *
   * @param {{ thumbnail?: string, title?: string, alias?: string }} opts
   * @returns {Artwork}
   */
  async finalize({ thumbnail, title, alias } = {}) {
    if (this._frames.length === 0) {
      console.warn('[MotionRecorder] No frames to finalize');
      return null;
    }

    // Create artwork shell
    const artwork = createArtwork(this._themeId);

    // Compress + downsample motion data
    const downsampled = downsampleMotion(this._frames, this._targetFps);
    artwork.motion = compressMotion(downsampled);

    // Finalize metadata
    finalizeArtwork(artwork);

    // Optional overrides
    if (title) artwork.meta.title = title;
    if (alias) artwork.meta.alias = alias;

    // Thumbnail
    if (thumbnail) {
      artwork.thumbnail = await createThumbnail(thumbnail, 200);
    }

    this.artwork = artwork;

    console.log('[MotionRecorder] Finalized artwork:', {
      id: artwork.id,
      theme: artwork.meta.themeId,
      frames: artwork.meta.frameCount,
      duration: artwork.meta.duration.toFixed(1) + 's',
      size: Math.round(JSON.stringify(artwork.motion).length / 1024) + 'KB',
    });

    return artwork;
  }

  /**
   * Get raw recorded frames (before compression)
   * Useful for immediate playback without saving
   */
  getRawFrames() {
    return this._frames;
  }

  /**
   * Reset recorder state
   */
  reset() {
    this._frames = [];
    this._isRecording = false;
    this.artwork = null;
  }
}
