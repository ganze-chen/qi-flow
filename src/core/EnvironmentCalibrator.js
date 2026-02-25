/**
 * EnvironmentCalibrator — 环境校准器
 *
 * PRD 3.2: 系统自动进行30帧环境校准（光线、距离、姿态基线），
 *          校准完成后以"墨滴入水"的动画过渡进入习练。
 *
 * Collects 30 valid pose frames to establish:
 * 1. Pose baseline (average joint positions at rest)
 * 2. Distance estimate (shoulder width in normalized coords)
 * 3. Visibility quality (average landmark confidence)
 * 4. Stability check (standard deviation of key joints)
 */
import { bus, Events } from '../utils/EventBus.js';

const REQUIRED_FRAMES = 30;
const MIN_VALID_RATIO = 0.7; // At least 70% of collected frames must be valid

export class EnvironmentCalibrator {
  isCalibrating = false;
  isComplete = false;

  /** @type {Array<Array>} collected joint frames */
  _frames = [];
  _validCount = 0;
  _totalCount = 0;

  /** Calibration result */
  result = null;

  constructor() {
    this._onPoseFrame = this._onPoseFrame.bind(this);
  }

  /**
   * Start calibration — listens for pose frames
   */
  start() {
    this._frames = [];
    this._validCount = 0;
    this._totalCount = 0;
    this.isCalibrating = true;
    this.isComplete = false;
    this.result = null;

    bus.on(Events.POSE_FRAME, this._onPoseFrame);
    bus.emit(Events.CALIBRATION_START);
  }

  /**
   * Abort calibration
   */
  abort() {
    this.isCalibrating = false;
    bus.removeEventListener?.(Events.POSE_FRAME, this._onPoseFrame);
  }

  /**
   * Handle each pose frame during calibration
   */
  _onPoseFrame({ joints, valid }) {
    if (!this.isCalibrating || this.isComplete) return;

    this._totalCount++;

    if (valid && joints) {
      this._frames.push(joints.map((j) => [...j])); // deep copy
      this._validCount++;
    }

    // Emit progress
    const progress = Math.min(this._validCount / REQUIRED_FRAMES, 1.0);
    bus.emit(Events.CALIBRATION_PROGRESS, {
      progress,
      validFrames: this._validCount,
      totalFrames: this._totalCount,
      required: REQUIRED_FRAMES,
    });

    // Check completion
    if (this._validCount >= REQUIRED_FRAMES) {
      this._complete();
    }

    // Timeout: if we've tried 90 frames and don't have enough valid ones
    if (this._totalCount > REQUIRED_FRAMES * 3 && this._validCount < REQUIRED_FRAMES * MIN_VALID_RATIO) {
      console.warn('[Calibrator] Low pose quality, completing with available data');
      if (this._validCount >= 10) {
        this._complete();
      }
    }
  }

  /**
   * Compute calibration result from collected frames
   */
  _complete() {
    this.isCalibrating = false;
    this.isComplete = true;

    const frames = this._frames;
    const numJoints = frames[0].length; // 17
    const n = frames.length;

    // 1. Average pose (baseline)
    const baseline = Array.from({ length: numJoints }, () => [0, 0, 0, 0]);
    for (const frame of frames) {
      for (let j = 0; j < numJoints; j++) {
        baseline[j][0] += frame[j][0] / n;
        baseline[j][1] += frame[j][1] / n;
        baseline[j][2] += frame[j][2] / n;
        baseline[j][3] += frame[j][3] / n;
      }
    }

    // 2. Standard deviation (stability)
    const stddev = Array.from({ length: numJoints }, () => [0, 0]);
    for (const frame of frames) {
      for (let j = 0; j < numJoints; j++) {
        stddev[j][0] += Math.pow(frame[j][0] - baseline[j][0], 2) / n;
        stddev[j][1] += Math.pow(frame[j][1] - baseline[j][1], 2) / n;
      }
    }
    for (let j = 0; j < numJoints; j++) {
      stddev[j][0] = Math.sqrt(stddev[j][0]);
      stddev[j][1] = Math.sqrt(stddev[j][1]);
    }

    // 3. Shoulder width (distance estimate)
    // joints[3] = left_shoulder, joints[4] = right_shoulder
    const shoulderWidth = Math.hypot(
      baseline[3][0] - baseline[4][0],
      baseline[3][1] - baseline[4][1]
    );

    // 4. Average visibility quality
    const avgVisibility =
      baseline.reduce((sum, j) => sum + j[3], 0) / numJoints;

    // 5. Compute body center & scale for normalization
    const centerX = (baseline[3][0] + baseline[4][0]) / 2;
    const centerY = (baseline[3][1] + baseline[4][1]) / 2;
    // Torso height: mid-shoulder to mid-hip
    const hipCenterY = (baseline[15][1] + baseline[16][1]) / 2;
    const torsoHeight = Math.abs(hipCenterY - centerY);

    // 6. Overall stability score (0-1, lower is more stable)
    const avgStdX = stddev.reduce((s, d) => s + d[0], 0) / numJoints;
    const avgStdY = stddev.reduce((s, d) => s + d[1], 0) / numJoints;
    const stability = 1.0 - Math.min((avgStdX + avgStdY) * 10, 1.0);

    this.result = {
      baseline,
      shoulderWidth,
      torsoHeight,
      centerX,
      centerY,
      avgVisibility,
      stability,
      stddev,
      framesCollected: n,
      quality: this._assessQuality(avgVisibility, stability, shoulderWidth),
    };

    console.log('[Calibrator] Complete:', {
      shoulderWidth: shoulderWidth.toFixed(3),
      torsoHeight: torsoHeight.toFixed(3),
      avgVisibility: avgVisibility.toFixed(2),
      stability: stability.toFixed(2),
      quality: this.result.quality,
    });

    bus.emit(Events.CALIBRATION_COMPLETE, this.result);
  }

  /**
   * Assess overall calibration quality
   */
  _assessQuality(visibility, stability, shoulderWidth) {
    // Good: shoulder clearly visible, stable, reasonable size
    if (visibility > 0.7 && stability > 0.8 && shoulderWidth > 0.1 && shoulderWidth < 0.6) {
      return 'excellent';
    }
    if (visibility > 0.5 && stability > 0.6 && shoulderWidth > 0.05) {
      return 'good';
    }
    return 'fair';
  }
}
