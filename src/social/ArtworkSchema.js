/**
 * ArtworkSchema — 作品数据结构定义
 *
 * PRD §6, §8.3:
 *   - 分享到广场的数据仅包含关节坐标序列（JSON），不包含任何可识别用户身份的信息
 *   - 数据存储: localStorage + IndexedDB
 *   - 广场数据使用预置JSON模拟
 *
 * Design principle:
 *   artwork.motion uses the EXACT same format as template data:
 *   [{t: float, j: [[x,y,z,vis], ...]}, ...]
 *   This means any artwork can be fed directly into TemplateLoader
 *   for playback (观看) or co-dance (共舞) without conversion.
 */

/**
 * @typedef {Object} ArtworkMeta
 * @property {string}  themeId     - 'snow' | 'bamboo' | 'bird' | 'stream'
 * @property {number}  createdAt   - Unix timestamp ms
 * @property {number}  duration    - seconds
 * @property {number}  frameCount  - total frames in motion array
 * @property {number}  fps         - recording framerate
 * @property {number}  jointsPerFrame - joints per frame (17)
 * @property {string}  alias       - anonymous display name (e.g. "墨客·寒")
 * @property {string}  [title]     - optional custom title
 */

/**
 * @typedef {Object} Artwork
 * @property {string}        id        - unique identifier (nanoid or timestamp-based)
 * @property {number}        version   - schema version (1)
 * @property {ArtworkMeta}   meta      - metadata
 * @property {Array}         motion    - [{t, j}, ...] same as template format
 * @property {string}        [thumbnail] - data URL of exported PNG (resized to ~200px)
 */

// ── Anonymous Alias Pool ─────────────────────────────────────

const ALIAS_PREFIXES = [
  '墨客', '行者', '云游', '闲人', '风吟',
  '听泉', '拾墨', '踏雪', '观澜', '寻幽',
];
const ALIAS_SUFFIXES = [
  '寒', '月', '秋', '石', '竹',
  '雪', '云', '风', '水', '松',
];

/**
 * Generate a random anonymous alias — PRD: no identity info
 */
export function generateAlias() {
  const prefix = ALIAS_PREFIXES[Math.floor(Math.random() * ALIAS_PREFIXES.length)];
  const suffix = ALIAS_SUFFIXES[Math.floor(Math.random() * ALIAS_SUFFIXES.length)];
  return `${prefix}·${suffix}`;
}

/**
 * Generate a unique artwork ID
 */
export function generateArtworkId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 6);
  return `art_${ts}_${rand}`;
}

// ── Schema Version ────────────────────────────────────────────

export const SCHEMA_VERSION = 1;

// ── Factory ──────────────────────────────────────────────────

/**
 * Create an empty artwork object with defaults
 * @param {string} themeId
 * @returns {Artwork}
 */
export function createArtwork(themeId) {
  return {
    id: generateArtworkId(),
    version: SCHEMA_VERSION,
    meta: {
      themeId,
      createdAt: Date.now(),
      duration: 0,
      frameCount: 0,
      fps: 0,
      jointsPerFrame: 17,
      alias: generateAlias(),
      title: '',
    },
    motion: [],
    thumbnail: '',
  };
}

/**
 * Finalize an artwork after recording — compute derived fields
 * @param {Artwork} artwork
 */
export function finalizeArtwork(artwork) {
  const m = artwork.motion;
  if (m.length > 0) {
    artwork.meta.frameCount = m.length;
    artwork.meta.duration = m[m.length - 1].t;
    artwork.meta.jointsPerFrame = m[0].j.length;
    if (m.length > 1) {
      artwork.meta.fps = Math.round(m.length / artwork.meta.duration);
    }
  }
  return artwork;
}

// ── Validation ───────────────────────────────────────────────

/**
 * Validate artwork data integrity
 * @param {*} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateArtwork(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Not an object'] };
  }
  if (!data.id || typeof data.id !== 'string') {
    errors.push('Missing or invalid id');
  }
  if (data.version !== SCHEMA_VERSION) {
    errors.push(`Version mismatch: expected ${SCHEMA_VERSION}, got ${data.version}`);
  }
  if (!data.meta || typeof data.meta !== 'object') {
    errors.push('Missing meta');
  } else {
    if (!data.meta.themeId) errors.push('Missing meta.themeId');
    if (!data.meta.createdAt) errors.push('Missing meta.createdAt');
  }
  if (!Array.isArray(data.motion)) {
    errors.push('motion must be an array');
  } else if (data.motion.length > 0) {
    const f0 = data.motion[0];
    if (typeof f0.t !== 'number') errors.push('motion[0].t must be a number');
    if (!Array.isArray(f0.j)) errors.push('motion[0].j must be an array');
  }

  return { valid: errors.length === 0, errors };
}

// ── Compression ──────────────────────────────────────────────

/**
 * Compress motion data for storage (reduce precision)
 * Similar to how pose_*_data-compressed.json was created:
 *   - Round coords to 4 decimal places
 *   - Round timestamps to 2 decimal places
 *   - Round visibility to 2 decimal places
 *
 * @param {Array} motion - [{t, j}, ...]
 * @returns {Array}
 */
export function compressMotion(motion) {
  return motion.map(frame => ({
    t: Math.round(frame.t * 100) / 100,
    j: frame.j.map(joint => [
      Math.round(joint[0] * 10000) / 10000,
      Math.round(joint[1] * 10000) / 10000,
      Math.round(joint[2] * 10000) / 10000,
      Math.round(joint[3] * 100) / 100,
    ]),
  }));
}

/**
 * Downsample motion data to target FPS
 * @param {Array} motion - [{t, j}, ...]
 * @param {number} targetFps - desired output framerate (default 10)
 * @returns {Array}
 */
export function downsampleMotion(motion, targetFps = 10) {
  if (motion.length < 2) return motion;

  const interval = 1 / targetFps;
  const result = [motion[0]]; // always keep first frame
  let nextTime = motion[0].t + interval;

  for (let i = 1; i < motion.length; i++) {
    if (motion[i].t >= nextTime) {
      result.push(motion[i]);
      nextTime = motion[i].t + interval;
    }
  }

  // Always keep last frame
  const lastOriginal = motion[motion.length - 1];
  const lastResult = result[result.length - 1];
  if (lastResult.t !== lastOriginal.t) {
    result.push(lastOriginal);
  }

  return result;
}

/**
 * Create a thumbnail from a canvas data URL by resizing
 * @param {string} dataUrl - full-size PNG data URL
 * @param {number} maxWidth - target max width (default 200)
 * @returns {Promise<string>} - resized data URL
 */
export function createThumbnail(dataUrl, maxWidth = 200) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = maxWidth / img.width;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

// ── Export for external seed tools ──────────────────────────

/**
 * Package an artwork as a downloadable JSON blob
 * @param {Artwork} artwork
 * @returns {Blob}
 */
export function artworkToBlob(artwork) {
  const json = JSON.stringify(artwork);
  return new Blob([json], { type: 'application/json' });
}

/**
 * Parse a JSON file into an artwork object
 * @param {File} file
 * @returns {Promise<Artwork|null>}
 */
export async function artworkFromFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const { valid, errors } = validateArtwork(data);
    if (!valid) {
      console.warn('[ArtworkSchema] Invalid artwork file:', errors);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[ArtworkSchema] Failed to parse file:', err);
    return null;
  }
}
