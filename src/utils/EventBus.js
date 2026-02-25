/**
 * EventBus — 轻量级发布订阅
 * PRD spec: 原生 EventTarget, 避免框架开销
 */
class EventBus extends EventTarget {
  emit(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  on(name, handler) {
    const wrapper = (e) => handler(e.detail);
    this.addEventListener(name, wrapper);
    return () => this.removeEventListener(name, wrapper);
  }

  once(name, handler) {
    const wrapper = (e) => handler(e.detail);
    this.addEventListener(name, wrapper, { once: true });
  }
}

// Singleton
export const bus = new EventBus();

// Event names
export const Events = {
  // Camera
  CAMERA_READY: 'camera:ready',
  CAMERA_ERROR: 'camera:error',
  // Pose
  POSE_DETECTED: 'pose:detected',
  POSE_LOST: 'pose:lost',
  POSE_FRAME: 'pose:frame',
  // Calibration
  CALIBRATION_START: 'calibration:start',
  CALIBRATION_PROGRESS: 'calibration:progress',
  CALIBRATION_COMPLETE: 'calibration:complete',
  // Playback (Day 3)
  PLAYBACK_START: 'playback:start',
  PLAYBACK_PAUSE: 'playback:pause',
  PLAYBACK_STOP: 'playback:stop',
  PLAYBACK_COMPLETE: 'playback:complete',
  // Matching (Day 4)
  MATCH_UPDATE: 'match:update',
  THEME_CHANGE: 'theme:change',
  MATCH_LEVEL_CHANGE: 'match:levelChange',
  // App state
  STATE_CHANGE: 'state:change',
  // Debug
  DEBUG_TOGGLE: 'debug:toggle',
};
