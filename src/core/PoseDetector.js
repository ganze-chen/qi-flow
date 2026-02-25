/**
 * PoseDetector — MediaPipe Pose Landmarker (WASM/WebGL)
 *
 * PRD 8.1: MediaPipe Pose (WASM/WebGL) 浏览器端实时推理
 * PRD 8.2: 姿态检测延迟 < 50ms, 渲染帧率 ≥ 30fps
 *
 * Loading strategy: inline <script type="module"> injection.
 * The jsdelivr +esm dynamic import() is unreliable on Safari/macOS,
 * so we inject a module script that sets a window global, then resolve.
 */
import { bus, Events } from '../utils/EventBus.js';
import { extractJoints, isPoseValid } from './JointMapper.js';

// CDN URLs
const VISION_WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

/**
 * Load MediaPipe Tasks Vision via inline <script type="module">.
 * The script imports from the bare specifier CDN URL and exposes
 * { PoseLandmarker, FilesetResolver } on window.__mediapipeVision,
 * then fires a custom event so we know it's ready.
 */
function loadVisionModule() {
  return new Promise((resolve, reject) => {
    // Already loaded from a previous call
    if (window.__mediapipeVision) {
      resolve(window.__mediapipeVision);
      return;
    }

    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
      import { PoseLandmarker, FilesetResolver }
        from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";
      window.__mediapipeVision = { PoseLandmarker, FilesetResolver };
      window.dispatchEvent(new Event("__mp_vision_ready"));
    `;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('MediaPipe Vision load timed out (15 s). Check network / VPN.'));
    }, 15000);

    function cleanup() {
      clearTimeout(timeout);
      window.removeEventListener('__mp_vision_ready', onReady);
    }

    function onReady() {
      cleanup();
      if (window.__mediapipeVision) {
        resolve(window.__mediapipeVision);
      } else {
        reject(new Error('MediaPipe Vision: globals not set after script ran'));
      }
    }

    window.addEventListener('__mp_vision_ready', onReady);
    document.head.appendChild(script);
  });
}

export class PoseDetector {
  /** @type {any} PoseLandmarker instance */
  landmarker = null;
  /** @type {HTMLVideoElement} */
  videoEl = null;

  isRunning = false;
  lastTimestamp = -1;
  frameCount = 0;
  fps = 0;
  latency = 0; // ms per detection

  // FPS calculation
  _fpsFrames = 0;
  _fpsLastTime = 0;

  /**
   * @param {HTMLVideoElement} videoEl
   */
  constructor(videoEl) {
    this.videoEl = videoEl;
  }

  /**
   * Initialize PoseLandmarker with WASM runtime
   * PRD 8.2: 模型加载 < 2s (缓存后 < 200ms)
   */
  async init() {
    const t0 = performance.now();

    try {
      // ── Step 1: load the JS module ──
      console.log('[PoseDetector] Loading MediaPipe Vision module …');
      const { PoseLandmarker, FilesetResolver } = await loadVisionModule();
      console.log(`[PoseDetector] Module ready  (${(performance.now() - t0).toFixed(0)} ms)`);

      // ── Step 2: WASM fileset ──
      console.log('[PoseDetector] Initializing WASM fileset …');
      const wasmFileset = await FilesetResolver.forVisionTasks(VISION_WASM_CDN);

      // ── Step 3: create landmarker (try GPU, fall back to CPU) ──
      console.log('[PoseDetector] Creating PoseLandmarker …');
      try {
        this.landmarker = await PoseLandmarker.createFromOptions(wasmFileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      } catch (gpuErr) {
        console.warn('[PoseDetector] GPU delegate failed, falling back to CPU …', gpuErr.message);
        this.landmarker = await PoseLandmarker.createFromOptions(wasmFileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        console.log('[PoseDetector] ✓ Ready (CPU fallback)');
        return true;
      }

      console.log(`[PoseDetector] ✓ Ready  (${(performance.now() - t0).toFixed(0)} ms total)`);
      return true;
    } catch (err) {
      console.error('[PoseDetector] Init failed:', err);
      return false;
    }
  }

  /**
   * Start the detection loop
   */
  start() {
    if (!this.landmarker) {
      console.error('[PoseDetector] Not initialized');
      return;
    }
    this.isRunning = true;
    this._fpsLastTime = performance.now();
    this._detectFrame();
  }

  /**
   * Stop detection loop
   */
  stop() {
    this.isRunning = false;
  }

  /**
   * Main detection loop using requestAnimationFrame
   */
  _detectFrame() {
    if (!this.isRunning) return;

    const video = this.videoEl;
    if (video.readyState < 2) {
      requestAnimationFrame(() => this._detectFrame());
      return;
    }

    // Avoid processing same frame twice
    const timestamp = video.currentTime * 1000; // ms
    if (timestamp === this.lastTimestamp) {
      requestAnimationFrame(() => this._detectFrame());
      return;
    }
    this.lastTimestamp = timestamp;

    // Detect pose
    const detectStart = performance.now();
    let result;
    try {
      result = this.landmarker.detectForVideo(video, Math.round(timestamp));
    } catch (e) {
      // Frame-boundary glitch — skip
      requestAnimationFrame(() => this._detectFrame());
      return;
    }
    this.latency = performance.now() - detectStart;

    // Update FPS counter
    this._updateFps();

    // Process result
    if (result.landmarks && result.landmarks.length > 0) {
      const rawLandmarks = result.landmarks[0];
      const worldLandmarks = result.worldLandmarks?.[0] || null;

      const joints = extractJoints(rawLandmarks);
      const valid = isPoseValid(joints);

      this.frameCount++;

      bus.emit(Events.POSE_FRAME, {
        joints,
        rawLandmarks,
        worldLandmarks,
        valid,
        fps: this.fps,
        latency: this.latency,
        frameCount: this.frameCount,
        timestamp,
      });

      if (valid) {
        bus.emit(Events.POSE_DETECTED, { joints, timestamp });
      } else {
        bus.emit(Events.POSE_LOST, { timestamp });
      }
    } else {
      bus.emit(Events.POSE_LOST, { timestamp });
    }

    requestAnimationFrame(() => this._detectFrame());
  }

  /**
   * Calculate running FPS
   */
  _updateFps() {
    this._fpsFrames++;
    const now = performance.now();
    const elapsed = now - this._fpsLastTime;
    if (elapsed >= 1000) {
      this.fps = Math.round((this._fpsFrames / elapsed) * 1000);
      this._fpsFrames = 0;
      this._fpsLastTime = now;
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stop();
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
  }
}
