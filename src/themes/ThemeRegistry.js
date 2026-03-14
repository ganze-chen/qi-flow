/**
 * ThemeRegistry — 主题注册表
 *
 * Each theme defines: visual identity, ink behavior type, audio instrument,
 * guide colors, template data, and canvas background.
 *
 * PRD §4: "四个主题并非四种皮肤，而是四种意境。每一个都有独立的
 *          视觉语言、音效逻辑、和墨迹行为。"
 */

export const ThemeId = {
  SNOW: 'snow',       // 踏雪留痕 · Footprints in Snow
  BAMBOO: 'bamboo',   // 翠竹风声 · Wind Through Bamboo
  BIRD: 'bird',       // 月下鸟群 · Bird Murmuration in Moonlight
  STREAM: 'stream',   // 曲水流觞 · Winding Stream Gathering
};

/**
 * Theme configuration objects.
 *
 * Each theme provides:
 * - meta: display name, subtitle, season, mood
 * - canvas: background color(s), paper texture hint
 * - ink: renderer type + type-specific params
 * - audio: instrument type + synthesis params
 * - guide: color palette for the "wind" guide layer
 * - template: data file path
 * - accumulates: whether ink trails persist (true) or clear each frame (false)
 */
export const Themes = {
  // ─── 踏雪留痕 ─────────────────────────────────────────────
  [ThemeId.SNOW]: {
    id: ThemeId.SNOW,
    meta: {
      name: '踏雪留痕',
      nameEn: 'Footprints in Snow',
      subtitle: '墨迹叠加 · 雪地脚印 · 空灵古琴',
      season: '冬 · 大雪',
      mood: '寂静、沉思',
      keywords: ['寒', '静', '痕迹', '独行'],
    },
    canvas: {
      background: '#f0ece4',   // near-white gray, snow field
      backgroundGradient: null,
    },
    ink: {
      type: 'dots',            // elliptical ink dots
      color: [26, 20, 16],     // deep ink black
      accumulates: true,
      // Dot-specific params
      joints: [
        { idx: 7, weight: 1.0 },   // L_wrist
        { idx: 8, weight: 1.0 },   // R_wrist
        { idx: 5, weight: 0.5 },   // L_elbow
        { idx: 6, weight: 0.5 },   // R_elbow
        { idx: 3, weight: 0.25 },  // L_shoulder
        { idx: 4, weight: 0.25 },  // R_shoulder
      ],
      speedMapping: {
        slowThreshold: 0.02,
        fastThreshold: 0.15,
        slowRadius: 25,
        fastRadius: 3,
        slowOpacity: 0.25,
        fastOpacity: 0.04,
      },
    },
    audio: {
      type: 'guqin',           // pentatonic guqin pluck
      ambientType: 'wind-snow',
      scale: [262, 294, 330, 392, 440, 523],  // C4 pentatonic + octave
      ambientVolume: 0.08,
      instrumentVolume: 0.35,
    },
    guide: {
      trailColor: [180, 155, 90],      // warm gold
      currentColor: [200, 170, 70],    // bright gold
      futureColor: [170, 148, 95],     // dimmer gold
      connectionAlpha: 0.15,
    },
    template: '/data/pose_upperbody1-2_data-compressed.json',
  },

  // ─── 翠竹风声 ─────────────────────────────────────────────
  [ThemeId.BAMBOO]: {
    id: ThemeId.BAMBOO,
    meta: {
      name: '翠竹风声',
      nameEn: 'Wind Through Bamboo',
      subtitle: '墨迹叠加 · 交错竖直墨迹 · 肃杀尺八',
      season: '夏 · 小暑',
      mood: '刚劲、清冽',
      keywords: ['竹林', '风骨', '劲节'],
    },
    canvas: {
      background: '#f2f0e6',   // pale yellow-green, bamboo grove light
      backgroundGradient: null,
    },
    ink: {
      type: 'bamboo',          // vertical bamboo strokes
      color: [20, 38, 18],     // deep bamboo ink (dark green-black)
      accumulates: true,
      // Bamboo-specific params
      joints: [
        { idx: 7, weight: 1.0 },   // L_wrist  → bamboo leaves
        { idx: 8, weight: 1.0 },   // R_wrist  → bamboo leaves
        { idx: 5, weight: 0.8 },   // L_elbow  → bamboo segments
        { idx: 6, weight: 0.8 },   // R_elbow  → bamboo segments
        { idx: 3, weight: 0.5 },   // L_shoulder → main stalk
        { idx: 4, weight: 0.5 },   // R_shoulder → main stalk
      ],
      bamboo: {
        // Vertical movement → bamboo stalk (竹竿)
        stalkMinLength: 30,       // px, minimum stroke to qualify as stalk
        stalkWidth: [2, 6],       // [min, max] px width
        stalkOpacity: [0.15, 0.50],
        // Horizontal movement → node/branch (竹节/横枝)
        nodeThreshold: 0.04,      // horizontal speed to trigger node
        nodeWidth: [1, 3],
        nodeLength: [8, 25],
        nodeOpacity: [0.2, 0.4],
        // Subtle wrist movement → leaf particles (竹叶)
        leafThreshold: 0.01,
        leafSize: [2, 5],
        leafOpacity: [0.08, 0.20],
        leafAngleRange: Math.PI / 4,  // 45° scatter
        leafColor: [30, 55, 25],      // slightly greener
      },
    },
    audio: {
      type: 'shakuhachi',       // breathy bamboo flute
      ambientType: 'bamboo-wind',
      // Shakuhachi uses a different scale (D minor pentatonic, breathy)
      scale: [294, 330, 349, 440, 494, 587],  // D4-based
      ambientVolume: 0.10,
      instrumentVolume: 0.30,
    },
    guide: {
      trailColor: [100, 140, 90],      // muted bamboo green
      currentColor: [80, 130, 60],     // vivid bamboo green
      futureColor: [120, 145, 110],    // light sage
      connectionAlpha: 0.12,
    },
    template: '/data/pose_push1_data-compressed.json',
  },

  // ─── 月下鸟群 ─────────────────────────────────────────────
  [ThemeId.BIRD]: {
    id: ThemeId.BIRD,
    meta: {
      name: '月下鸟群',
      nameEn: 'Bird Murmuration in Moonlight',
      subtitle: '面板压暗 · 光影追踪 · 空谷鸟鸣',
      season: '秋 · 寒露',
      mood: '神秘、柔和',
      keywords: ['暮色', '群鸟', '光与影的呼吸'],
    },
    canvas: {
      background: '#1a1a2e',
      backgroundGradient: ['#1a1a2e', '#16213e'],
    },
    ink: {
      type: 'particles',       // boid particle swarm
      color: [200, 200, 220],  // silver-white
      accumulates: false,
      boid: {
        // count managed by renderer (mobile-aware via perfConfig)
        size: [1.5, 3.5],       // [min, max] particle radius
        baseColor: [60, 60, 90],  // dark indigo (unlit)
        litColor: [210, 215, 235], // silver-white (illuminated)
        moonColor: [240, 235, 200], // warm moonlight glow
        // Boid rules
        separationDist: 18,
        alignmentDist: 50,
        cohesionDist: 60,
        separationForce: 0.04,
        alignmentForce: 0.02,
        cohesionForce: 0.008,
        maxSpeed: 2.5,
        minSpeed: 0.3,
        // Moonlight interaction
        lightRadius: 0.18,        // normalized radius of moonlight cone
        lightIntensity: 1.0,
        lightFalloff: 2.0,        // exponential falloff
        // Wind attraction to hands
        handAttractionForce: 0.015,
        handAttractionRadius: 0.25, // normalized
      },
    },
    audio: {
      type: 'birdsong',
      ambientType: 'night-insects',
      scale: [523, 659, 784, 880, 988, 1047],  // high register
      ambientVolume: 0.06,
      instrumentVolume: 0.25,
    },
    guide: {
      trailColor: [140, 140, 180],
      currentColor: [180, 180, 220],
      futureColor: [120, 120, 160],
      connectionAlpha: 0.10,
    },
    template: '/data/pose_upperbody1-2_data-compressed.json',
  },

  // ─── 曲水流觞 ─────────────────────────────────────────────
  [ThemeId.STREAM]: {
    id: ThemeId.STREAM,
    meta: {
      name: '曲水流觞',
      nameEn: 'Winding Stream Gathering',
      subtitle: '预置线条底纹 · 动态水波 · 高低频水声',
      season: '春 · 上巳',
      mood: '流动、雅致',
      keywords: ['兰亭', '曲水', '流动', '雅集'],
    },
    canvas: {
      background: '#e8ece6',
      backgroundGradient: ['#e8ece6', '#d4ddd0'],
    },
    ink: {
      type: 'wave',
      color: [40, 50, 45],
      accumulates: false,
      wave: {
        // lineCount + pointsPerLine managed by renderer (mobile-aware)
        baseColor: [55, 70, 62],
        rippleColor: [30, 45, 38],
        lineOpacity: [0.06, 0.20],
        lineWidth: [0.5, 1.5],
        // Physics — stable spring-mass
        damping: 0.90,
        springK: 0.06,
        propagation: 0.12,
        interLinePropagation: 0.02,
        maxDisplacement: 25,
        // Joint interaction
        forceRadius: 0.15,
        forceStrength: 1.2,
        speedThreshold: 0.01,
        speedCap: 0.20,
      },
    },
    audio: {
      type: 'water',
      ambientType: 'stream',
      scale: [262, 330, 392, 494, 523, 659],
      ambientVolume: 0.12,
      instrumentVolume: 0.20,
    },
    guide: {
      trailColor: [100, 130, 120],
      currentColor: [80, 120, 100],
      futureColor: [120, 140, 130],
      connectionAlpha: 0.10,
    },
    template: '/data/pose_upperbody1-2_data-compressed.json',
  },
};

/**
 * Get theme config by ID
 * @param {string} themeId
 * @returns {Object}
 */
export function getTheme(themeId) {
  return Themes[themeId] || Themes[ThemeId.SNOW];
}

/**
 * Get all available theme IDs
 */
export function getThemeIds() {
  return Object.keys(Themes);
}
