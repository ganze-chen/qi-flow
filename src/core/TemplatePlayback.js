/**
 * TemplatePlayback — 动作模板回放引擎
 *
 * PRD 5.4: 动作模板以"风"的形态呈现——一组流动的、半透明的墨迹引导轨迹。
 *          引导墨迹在当前帧前方约1-2秒位置，给用户预判和跟随的时间。
 *
 * Controls playback timing, provides current + lookahead frames,
 * and manages loop/completion state.
 */
import { bus, Events } from '../utils/EventBus.js';

export class TemplatePlayback {
  /** @type {import('./TemplateLoader.js').TemplateLoader} */
  _loader = null;

  // Playback state
  _isPlaying = false;
  _startRealTime = 0;      // performance.now() when playback started
  _pausedAt = 0;            // template time when paused
  _playbackSpeed = 1.0;
  _loop = false;

  // Current playback position
  currentTime = 0;          // seconds into template
  currentFrameIdx = 0;

  // Lookahead config (seconds ahead of "now" for guide trail)
  lookaheadWindow = 1.5;    // PRD: 1-2 seconds ahead
  trailDuration = 2.0;      // how many seconds of trail to show behind current

  constructor(templateLoader) {
    this._loader = templateLoader;
  }

  /** Template data accessor */
  get data() { return this._loader.data; }
  get meta() { return this._loader.meta; }
  get isPlaying() { return this._isPlaying; }
  get duration() { return this.meta.duration || 0; }
  get progress() { return this.duration > 0 ? this.currentTime / this.duration : 0; }

  /**
   * Start or resume playback
   */
  play() {
    if (!this.data || this._isPlaying) return;
    this._startRealTime = performance.now() - (this._pausedAt * 1000 / this._playbackSpeed);
    this._isPlaying = true;
    bus.emit(Events.PLAYBACK_START, { time: this._pausedAt });
  }

  /**
   * Pause playback
   */
  pause() {
    if (!this._isPlaying) return;
    this._pausedAt = this.currentTime;
    this._isPlaying = false;
    bus.emit(Events.PLAYBACK_PAUSE, { time: this.currentTime });
  }

  /**
   * Stop and reset
   */
  stop() {
    this._isPlaying = false;
    this._pausedAt = 0;
    this.currentTime = 0;
    this.currentFrameIdx = 0;
    bus.emit(Events.PLAYBACK_STOP);
  }

  /**
   * Seek to a specific time
   * @param {number} time - seconds
   */
  seek(time) {
    this._pausedAt = Math.max(0, Math.min(time, this.duration));
    if (this._isPlaying) {
      this._startRealTime = performance.now() - (this._pausedAt * 1000 / this._playbackSpeed);
    }
    this.currentTime = this._pausedAt;
  }

  /**
   * Update playback position — call each frame from rAF
   * @param {number} now - performance.now()
   * @returns {{ current: Object|null, guide: Array, trail: Array, progress: number, done: boolean }}
   */
  update(now) {
    if (!this.data) return { current: null, guide: [], trail: [], progress: 0, done: false };

    if (this._isPlaying) {
      const elapsed = (now - this._startRealTime) / 1000 * this._playbackSpeed;
      this.currentTime = elapsed;

      // Check completion
      if (this.currentTime >= this.duration) {
        if (this._loop) {
          // Wrap around
          this.currentTime = this.currentTime % this.duration;
          this._startRealTime = now - (this.currentTime * 1000 / this._playbackSpeed);
        } else {
          this.currentTime = this.duration;
          this._isPlaying = false;
          bus.emit(Events.PLAYBACK_COMPLETE);
          return {
            current: this._loader.getFrameAtTime(this.duration),
            guide: [],
            trail: this._getTrailFrames(this.duration),
            progress: 1.0,
            done: true,
          };
        }
      }
    }

    const current = this._loader.getFrameAtTime(this.currentTime);
    if (current) this.currentFrameIdx = current.frameIndex;

    return {
      current,
      guide: this._getGuideFrames(this.currentTime),
      trail: this._getTrailFrames(this.currentTime),
      progress: this.progress,
      done: false,
    };
  }

  /**
   * Get lookahead frames (the "wind" guide ahead of current position)
   * Returns array of { joints, timestamp, alpha } where alpha fades with distance
   * @param {number} time - current template time
   */
  _getGuideFrames(time) {
    if (!this.data) return [];
    const result = [];
    const guideStart = time;
    const guideEnd = Math.min(time + this.lookaheadWindow, this.duration);

    // Sample at roughly 8 fps for guide rendering (don't need full framerate)
    const step = 0.125; // 8 samples per second
    for (let t = guideStart; t <= guideEnd; t += step) {
      const frame = this._loader.getFrameAtTime(t);
      if (!frame) continue;

      // Alpha: brightest at current position, fading toward future
      const dist = (t - time) / this.lookaheadWindow;
      const alpha = 1.0 - dist * 0.7; // fade from 1.0 to 0.3

      result.push({
        joints: frame.joints,
        timestamp: frame.timestamp,
        alpha: Math.max(0.15, alpha),
        isCurrent: Math.abs(t - time) < step,
      });
    }
    return result;
  }

  /**
   * Get trail frames (past positions that fade out)
   * @param {number} time - current template time
   */
  _getTrailFrames(time) {
    if (!this.data) return [];
    const result = [];
    const trailStart = Math.max(0, time - this.trailDuration);

    const step = 0.15;
    for (let t = trailStart; t < time; t += step) {
      const frame = this._loader.getFrameAtTime(t);
      if (!frame) continue;

      // Alpha: fading as we go further back in time
      const age = (time - t) / this.trailDuration;
      const alpha = (1.0 - age) * 0.4; // max trail opacity 0.4

      result.push({
        joints: frame.joints,
        timestamp: frame.timestamp,
        alpha: Math.max(0.05, alpha),
      });
    }
    return result;
  }

  /**
   * Set loop mode
   */
  setLoop(loop) {
    this._loop = loop;
  }

  /**
   * Set playback speed
   */
  setSpeed(speed) {
    // Preserve current position when changing speed
    this._pausedAt = this.currentTime;
    this._playbackSpeed = speed;
    if (this._isPlaying) {
      this._startRealTime = performance.now() - (this._pausedAt * 1000 / this._playbackSpeed);
    }
  }
}
