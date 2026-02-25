/**
 * MatchingEngine — 动作匹配引擎
 *
 * PRD 5.3: 采用关节角度余弦相似度作为核心匹配指标，
 *          而非绝对坐标位置对比。用户无论距摄像头远近、
 *          无论体型差异，只要"姿态形状"正确即可获得高匹配分。
 *
 * Key thresholds (PRD 5.3):
 *   > 0.85  → "丰盈" (rich) — full theme audio
 *   0.6–0.85 → "流动" (flowing) — simplified audio
 *   < 0.6   → "枯" (sparse) — ambient only
 *
 * Approach:
 * 1. Extract joint ANGLES (vectors between connected joints)
 * 2. Normalize using calibration baseline (center + scale)
 * 3. Compute cosine similarity between user angle vector and template angle vector
 * 4. Smooth score over time window to avoid jitter
 */

// Angle definitions: each angle is [anchor, from, to]
// These capture the SHAPE of the pose regardless of position/scale
const ANGLE_DEFINITIONS = [
  // Left arm angles
  { name: 'L_shoulder_angle', joints: [4, 3, 5] },   // R_shoulder→L_shoulder→L_elbow
  { name: 'L_elbow_angle',    joints: [3, 5, 7] },   // L_shoulder→L_elbow→L_wrist
  // Right arm angles
  { name: 'R_shoulder_angle', joints: [3, 4, 6] },   // L_shoulder→R_shoulder→R_elbow
  { name: 'R_elbow_angle',    joints: [4, 6, 8] },   // R_shoulder→R_elbow→R_wrist
  // Torso angles
  { name: 'L_torso_angle',    joints: [15, 3, 5] },  // L_hip→L_shoulder→L_elbow
  { name: 'R_torso_angle',    joints: [16, 4, 6] },  // R_hip→R_shoulder→R_elbow
  // Shoulder tilt (using nose as reference)
  { name: 'head_tilt',        joints: [3, 0, 4] },   // L_shoulder→nose→R_shoulder
  // Wrist relative to elbow (captures hand position intent)
  { name: 'L_wrist_dir',      joints: [5, 7, 9] },   // L_elbow→L_wrist→L_pinky
  { name: 'R_wrist_dir',      joints: [6, 8, 10] },  // R_elbow→R_wrist→R_pinky
];

// Weights for each angle (arms matter most for 肩颈操)
const ANGLE_WEIGHTS = [
  1.2,   // L_shoulder_angle — important
  1.0,   // L_elbow_angle
  1.2,   // R_shoulder_angle — important
  1.0,   // R_elbow_angle
  0.8,   // L_torso
  0.8,   // R_torso
  0.6,   // head_tilt
  0.5,   // L_wrist_dir — less critical
  0.5,   // R_wrist_dir
];

export const MatchLevel = {
  RICH: 'rich',       // 丰盈 > 0.85
  FLOWING: 'flowing', // 流动 0.6–0.85
  SPARSE: 'sparse',   // 枯   < 0.6
};

export class MatchingEngine {
  // Current match state
  score = 0;            // Raw cosine similarity [0, 1]
  smoothScore = 0;      // Smoothed over time
  level = MatchLevel.SPARSE;

  // Configuration
  config = {
    richThreshold: 0.85,
    flowingThreshold: 0.60,
    smoothingFactor: 0.15,  // EMA alpha (lower = smoother)
    minVisibility: 0.4,     // Joint must be this visible to count
  };

  // Calibration data (set after calibration)
  _calibration = null;

  // Score history for analysis
  _scoreHistory = [];
  _maxHistory = 120; // ~4 seconds at 30fps

  /**
   * Set calibration data for normalization
   * @param {Object} calibResult — from EnvironmentCalibrator
   */
  setCalibration(calibResult) {
    this._calibration = calibResult;
  }

  /**
   * Compute match score between user pose and template pose
   * @param {Array} userJoints — 17 joints [x,y,z,vis]
   * @param {Array} templateJoints — 17 joints [x,y,z,vis]
   * @returns {{ score: number, smoothScore: number, level: string, angles: Object }}
   */
  computeMatch(userJoints, templateJoints) {
    if (!userJoints || !templateJoints) {
      return this._updateSmooth(0);
    }

    // Extract angle vectors for both poses
    const userAngles = this._extractAngles(userJoints);
    const templateAngles = this._extractAngles(templateJoints);

    if (!userAngles || !templateAngles) {
      return this._updateSmooth(0);
    }

    // Compute weighted cosine similarity
    const rawScore = this._weightedCosineSimilarity(userAngles, templateAngles);
    return this._updateSmooth(rawScore);
  }

  /**
   * Extract angle values from joint positions
   * Each angle is computed as the angle at the "anchor" joint
   * @returns {Array<number>|null} — array of angle values (radians)
   */
  _extractAngles(joints) {
    const angles = [];
    const cfg = this.config;

    for (const def of ANGLE_DEFINITIONS) {
      const [aIdx, bIdx, cIdx] = def.joints;

      // Check all three joints are visible enough
      if (joints[aIdx][3] < cfg.minVisibility ||
          joints[bIdx][3] < cfg.minVisibility ||
          joints[cIdx][3] < cfg.minVisibility) {
        angles.push(null); // Missing angle
        continue;
      }

      // Vectors: anchor→from and anchor→to
      const v1x = joints[aIdx][0] - joints[bIdx][0];
      const v1y = joints[aIdx][1] - joints[bIdx][1];
      const v2x = joints[cIdx][0] - joints[bIdx][0];
      const v2y = joints[cIdx][1] - joints[bIdx][1];

      // Angle via atan2 for better numerical stability
      const angle = Math.atan2(v2y, v2x) - Math.atan2(v1y, v1x);

      // Normalize to [0, 2π]
      angles.push(((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    }

    return angles;
  }

  /**
   * Compute weighted cosine similarity between two angle vectors
   * Handles missing (null) angles by excluding them from computation
   */
  _weightedCosineSimilarity(anglesA, anglesB) {
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    let totalWeight = 0;

    for (let i = 0; i < anglesA.length; i++) {
      if (anglesA[i] === null || anglesB[i] === null) continue;

      const w = ANGLE_WEIGHTS[i] || 1.0;

      // Convert angles to unit vectors for cosine similarity
      const ax = Math.cos(anglesA[i]) * w;
      const ay = Math.sin(anglesA[i]) * w;
      const bx = Math.cos(anglesB[i]) * w;
      const by = Math.sin(anglesB[i]) * w;

      dotProduct += ax * bx + ay * by;
      magA += ax * ax + ay * ay;
      magB += bx * bx + by * by;
      totalWeight += w;
    }

    if (totalWeight < 1.0 || magA < 0.001 || magB < 0.001) return 0;

    const similarity = dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
    // Map from [-1, 1] to [0, 1]
    return (similarity + 1) / 2;
  }

  /**
   * Update smoothed score with EMA and determine level
   * @param {number} rawScore
   */
  _updateSmooth(rawScore) {
    this.score = rawScore;

    // Exponential Moving Average for smooth transitions
    const alpha = this.config.smoothingFactor;
    this.smoothScore = this.smoothScore * (1 - alpha) + rawScore * alpha;

    // Determine match level
    const prevLevel = this.level;
    if (this.smoothScore >= this.config.richThreshold) {
      this.level = MatchLevel.RICH;
    } else if (this.smoothScore >= this.config.flowingThreshold) {
      this.level = MatchLevel.FLOWING;
    } else {
      this.level = MatchLevel.SPARSE;
    }

    // Track history
    this._scoreHistory.push(this.smoothScore);
    if (this._scoreHistory.length > this._maxHistory) {
      this._scoreHistory.shift();
    }

    // Detect level transitions
    const levelChanged = prevLevel !== this.level;

    return {
      score: this.score,
      smoothScore: this.smoothScore,
      level: this.level,
      levelChanged,
      prevLevel,
    };
  }

  /**
   * Get average score over recent history
   */
  getAverageScore(windowFrames = 30) {
    const slice = this._scoreHistory.slice(-windowFrames);
    if (slice.length === 0) return 0;
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  /**
   * Get peak score over recent history
   */
  getPeakScore(windowFrames = 60) {
    const slice = this._scoreHistory.slice(-windowFrames);
    return slice.length > 0 ? Math.max(...slice) : 0;
  }

  /**
   * Reset all state
   */
  reset() {
    this.score = 0;
    this.smoothScore = 0;
    this.level = MatchLevel.SPARSE;
    this._scoreHistory = [];
  }
}
