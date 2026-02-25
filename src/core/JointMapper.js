/**
 * JointMapper — MediaPipe 33关节 → 模板17关节映射
 *
 * 模板保留的关节 (按顺序):
 * Index 0:  MP#0  nose
 * Index 1:  MP#9  mouth_left
 * Index 2:  MP#10 mouth_right
 * Index 3:  MP#11 left_shoulder
 * Index 4:  MP#12 right_shoulder
 * Index 5:  MP#13 left_elbow
 * Index 6:  MP#14 right_elbow
 * Index 7:  MP#15 left_wrist
 * Index 8:  MP#16 right_wrist
 * Index 9:  MP#17 left_pinky
 * Index 10: MP#18 right_pinky
 * Index 11: MP#19 left_index
 * Index 12: MP#20 right_index
 * Index 13: MP#21 left_thumb
 * Index 14: MP#22 right_thumb
 * Index 15: MP#23 left_hip
 * Index 16: MP#24 right_hip
 */

// MediaPipe landmark indices we extract
export const TEMPLATE_MP_INDICES = [
  0,   // nose
  9,   // mouth_left
  10,  // mouth_right
  11,  // left_shoulder
  12,  // right_shoulder
  13,  // left_elbow
  14,  // right_elbow
  15,  // left_wrist
  16,  // right_wrist
  17,  // left_pinky
  18,  // right_pinky
  19,  // left_index
  20,  // right_index
  21,  // left_thumb
  22,  // right_thumb
  23,  // left_hip
  24,  // right_hip
];

// Human-readable labels
export const JOINT_LABELS = [
  'nose', 'mouth_L', 'mouth_R',
  'shoulder_L', 'shoulder_R',
  'elbow_L', 'elbow_R',
  'wrist_L', 'wrist_R',
  'pinky_L', 'pinky_R',
  'index_L', 'index_R',
  'thumb_L', 'thumb_R',
  'hip_L', 'hip_R',
];

// Skeleton connections for visualization
export const SKELETON_CONNECTIONS = [
  // Spine: nose → mid-shoulder → mid-hip
  // Shoulders
  [3, 4],   // left_shoulder - right_shoulder
  // Left arm
  [3, 5],   // left_shoulder - left_elbow
  [5, 7],   // left_elbow - left_wrist
  // Right arm
  [4, 6],   // right_shoulder - right_elbow
  [6, 8],   // right_elbow - right_wrist
  // Left hand
  [7, 9],   // left_wrist - left_pinky
  [7, 11],  // left_wrist - left_index
  [7, 13],  // left_wrist - left_thumb
  // Right hand
  [8, 10],  // right_wrist - right_pinky
  [8, 12],  // right_wrist - right_index
  [8, 14],  // right_wrist - right_thumb
  // Hips
  [15, 16], // left_hip - right_hip
  // Torso
  [3, 15],  // left_shoulder - left_hip
  [4, 16],  // right_shoulder - right_hip
  // Face: nose - mouth
  [0, 1],   // nose - mouth_left
  [0, 2],   // nose - mouth_right
];

/**
 * Extract our 17 joints from MediaPipe's 33 landmarks
 * @param {Array} landmarks - MediaPipe PoseLandmarker results (33 landmarks)
 * @returns {Array} 17 joints, each as [x, y, z, visibility]
 */
export function extractJoints(landmarks) {
  if (!landmarks || landmarks.length < 25) return null;

  return TEMPLATE_MP_INDICES.map((mpIdx) => {
    const lm = landmarks[mpIdx];
    return [lm.x, lm.y, lm.z, lm.visibility ?? 0];
  });
}

/**
 * Check if key joints are visible (shoulders, at least one wrist)
 * @param {Array} joints - 17 joints array
 * @param {number} threshold - minimum visibility
 * @returns {boolean}
 */
export function isPoseValid(joints, threshold = 0.5) {
  if (!joints) return false;
  // Require both shoulders visible
  const lShoulder = joints[3][3]; // left_shoulder visibility
  const rShoulder = joints[4][3]; // right_shoulder visibility
  // Require at least one wrist
  const lWrist = joints[7][3];
  const rWrist = joints[8][3];
  return (
    lShoulder > threshold &&
    rShoulder > threshold &&
    (lWrist > threshold || rWrist > threshold)
  );
}

/**
 * Compute the bounding box center of visible joints
 * Useful for normalized coordinate system
 */
export function getJointCenter(joints) {
  let sumX = 0, sumY = 0, count = 0;
  for (const [x, y, , vis] of joints) {
    if (vis > 0.3) {
      sumX += x;
      sumY += y;
      count++;
    }
  }
  return count > 0 ? { x: sumX / count, y: sumY / count } : { x: 0.5, y: 0.5 };
}
