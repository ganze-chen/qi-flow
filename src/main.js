/**
 * 行气 Qi-Flow — Main Application (Week 4, Day 3-4)
 *
 * State machine:
 *   IDLE (landing) → LOADING → CAMERA_READY → CALIBRATING → PRACTICING → COMPLETE
 *   IDLE → GALLERY → VIEWING (artwork playback) → IDLE
 *   IDLE → GALLERY → CODANCE_LOADING → CODANCE → CODANCE_COMPLETE → IDLE
 */
import { bus, Events } from './utils/EventBus.js';
import { CameraManager } from './core/CameraManager.js';
import { PoseDetector } from './core/PoseDetector.js';
import { EnvironmentCalibrator } from './core/EnvironmentCalibrator.js';
import { TemplateLoader } from './core/TemplateLoader.js';
import { TemplatePlayback } from './core/TemplatePlayback.js';
import { InkRenderer } from './core/InkRenderer.js';
import { GuideRenderer } from './core/GuideRenderer.js';
import { MatchingEngine } from './core/MatchingEngine.js';
import { AudioEngine } from './core/AudioEngine.js';
import { DebugOverlay } from './ui/DebugOverlay.js';
import { SplashCanvas } from './ui/SplashCanvas.js';
import { GalleryScreen } from './ui/GalleryScreen.js';
import { ExportComposer } from './ui/ExportComposer.js';
import { ThemeManager } from './themes/ThemeManager.js';
import { ThemeId, Themes, getThemeIds } from './themes/ThemeRegistry.js';
import { BambooInkRenderer } from './themes/bamboo/BambooInkRenderer.js';
import { BirdInkRenderer } from './themes/bird/BirdInkRenderer.js';
import { StreamInkRenderer } from './themes/stream/StreamInkRenderer.js';
import { MotionRecorder } from './social/MotionRecorder.js';
import { ArtworkStore } from './social/ArtworkStore.js';
import { createThumbnail } from './social/ArtworkSchema.js';
import { isMobile, isIOS, canWebShare, shareImage, lockScroll, unlockScroll } from './utils/MobileDetect.js';
import { AIEnhancer } from './core/AIEnhancer.js';

// ─── App State ─────────────────────────────────────────────
const State = {
  IDLE: 'idle',
  LOADING: 'loading',
  CAMERA_READY: 'camera_ready',
  CALIBRATING: 'calibrating',
  PRACTICING: 'practicing',
  COMPLETE: 'complete',
  GALLERY: 'gallery',
  VIEWING: 'viewing',
  CODANCE_LOADING: 'codance_loading',
  CODANCE: 'codance',
  CODANCE_COMPLETE: 'codance_complete',
  ERROR: 'error',
};

let currentState = State.IDLE;
let selectedThemeId = ThemeId.SNOW; // default

// ─── Stretch Tips (shown during loading) ───────────────────
const STRETCH_TIPS = [
  '缓缓转动头部，画一个小圆\n感受颈椎逐节放松',
  '头倾向一侧，手扶住后脑勺\n让重力帮助你舒展颈侧',
  '双手交叉举过头顶\n想象指尖触碰天花板',
  '肩膀下沉，一只手跟随引导画圈\n肩关节的暖意正在弥散',
  '双手自然垂落，轻轻甩动手腕\n让手指的僵硬随惯性散开',
  '闭上眼睛，感受三次呼吸\n习练即将开始',
  '身体是一支笔，空间是一张纸\n你的每个动作都将留下痕迹',
  '放松双肩，让锁骨展开\n想象胸口有一朵花在盛开',
];
let tipIndex = 0;
let tipTimer = null;

// ─── DOM Elements ──────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const videoEl = $('#camera-feed');
const inkCanvas = $('#ink-canvas');
const guideCanvas = $('#guide-canvas');
const debugCanvas = $('#debug-canvas');
const landingScreen = $('#landing-screen');
const splashCanvasEl = $('#splash-canvas');
const themeCirclesEl = $('#theme-circles');
const themeDescName = $('#theme-desc-name');
const themeDescEn = $('#theme-desc-en');
const themeDescMood = $('#theme-desc-mood');
const btnStart = $('#btn-start');
const loadingOverlay = $('#loading-overlay');
const loadingStatus = $('#loading-status');
const loadingBar = $('#loading-bar');
const stretchTipEl = $('#stretch-tip');
const calibOverlay = $('#calibration-overlay');
const calibBar = $('#calibration-bar');
const hud = $('#hud');
const hudFps = $('#hud-fps');
const hudProgress = $('#hud-progress');
const hudMatch = $('#hud-match');
const statusToast = $('#status-toast');
const debugPanel = $('#debug-panel');
const completionScreen = $('#completion-screen');
const btnExport = $('#btn-export');
const btnRestart = $('#btn-restart');
const btnShare = $('#btn-share');
const galleryScreen = $('#gallery-screen');
const btnGallery = $('#btn-gallery');
const btnGalleryClose = $('#btn-gallery-close');
const codanceBadge = $('#codance-badge');
const exportPreview = $('#export-preview');
const exportCanvas = $('#export-canvas');
const exportSigInput = $('#export-sig-input');
const exportBtnSave = $('#export-btn-save');
const exportBtnCancel = $('#export-btn-cancel');
const exportAiToggle = $('#export-ai-toggle');
const aiEnhanceOverlay = $('#ai-enhance-overlay');
const aiRedoBtn = $('#ai-redo-btn');

// ─── Module Instances ──────────────────────────────────────
const camera = new CameraManager(videoEl);
const poseDetector = new PoseDetector(videoEl);
const calibrator = new EnvironmentCalibrator();
const templateLoader = new TemplateLoader();
const playback = new TemplatePlayback(templateLoader);
const guideRenderer = new GuideRenderer(guideCanvas);
const matchingEngine = new MatchingEngine();
const audioEngine = new AudioEngine();
const aiEnhancer = new AIEnhancer();
const debugOverlay = new DebugOverlay(debugCanvas);
const splash = new SplashCanvas(splashCanvasEl);
const themeManager = new ThemeManager();

// Secondary loader/playback for artwork viewing + co-dance shadow
const artworkLoader = new TemplateLoader();
const artworkPlayback = new TemplatePlayback(artworkLoader);

// Ink renderers — one per theme type
const inkRenderers = {
  dots: new InkRenderer(inkCanvas),
  bamboo: new BambooInkRenderer(inkCanvas),
  particles: new BirdInkRenderer(inkCanvas),
  wave: new StreamInkRenderer(inkCanvas),
};
let activeInkRenderer = inkRenderers.dots;

// Register modules with theme manager
themeManager.register('guide', guideRenderer);
themeManager.register('audio', audioEngine);

// Social / recording
const motionRecorder = new MotionRecorder();
const artworkStore = new ArtworkStore();
let gallery = null; // initialized after store loads
const exportComposer = new ExportComposer();

// ─── State Management ──────────────────────────────────────
const FULLSCREEN_STATES = new Set([
  State.LOADING, State.CAMERA_READY, State.CALIBRATING,
  State.PRACTICING, State.COMPLETE,
  State.VIEWING, State.CODANCE_LOADING, State.CODANCE, State.CODANCE_COMPLETE,
]);

function setState(newState) {
  const prev = currentState;
  currentState = newState;
  bus.emit(Events.STATE_CHANGE, { prev, current: newState });
  updateDebug('state', newState);
  console.log(`[App] State: ${prev} → ${newState}`);

  // Mobile: lock/unlock scroll for fullscreen states
  if (isMobile) {
    if (FULLSCREEN_STATES.has(newState)) lockScroll();
    else unlockScroll();
  }

  // Mobile: hide FPS display
  if (isMobile && hudFps) hudFps.style.display = 'none';
}

// ─── UI Helpers ────────────────────────────────────────────
function showToast(msg, duration = 2500) {
  statusToast.textContent = msg;
  statusToast.classList.add('show');
  setTimeout(() => statusToast.classList.remove('show'), duration);
}

function updateDebug(key, val) {
  const el = $(`#dbg-${key}`);
  if (el) el.textContent = typeof val === 'number' ? val.toFixed(1) : val;
}

function resizeCanvases() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  activeInkRenderer.resize(w, h);
  guideRenderer.resize(w, h);
  debugOverlay.resize(w, h);
}

// ─── Landing Screen ────────────────────────────────────────

function buildThemeCircles() {
  const container = themeCirclesEl;
  if (!container) return;

  for (const id of getThemeIds()) {
    const t = Themes[id];

    const circle = document.createElement('div');
    circle.className = 'theme-circle';
    circle.dataset.themeId = id;

    // Background fill
    const bg = t.canvas.backgroundGradient
      ? `linear-gradient(135deg, ${t.canvas.backgroundGradient[0]}, ${t.canvas.backgroundGradient[1]})`
      : t.canvas.background;

    // Ink color for the hint character
    const isDark = t.canvas.background.startsWith('#1') || t.canvas.background.startsWith('#0');
    const inkHex = isDark
      ? `rgba(${t.ink.color.join(',')}, 0.5)`
      : `rgba(${t.ink.color.join(',')}, 0.25)`;

    circle.innerHTML = `
      <div class="theme-circle-inner" style="background: ${bg}">
        <span class="theme-circle-ink" style="color: ${inkHex}">墨</span>
      </div>
      <span class="theme-circle-season">${t.meta.season.split(' · ')[0]}</span>
    `;

    circle.addEventListener('click', () => highlightTheme(id));
    container.appendChild(circle);
  }

  // Default: select first theme
  highlightTheme(selectedThemeId);
}

function highlightTheme(themeId) {
  selectedThemeId = themeId;
  const t = Themes[themeId];

  // Update circle highlights
  themeCirclesEl.querySelectorAll('.theme-circle').forEach(c => {
    c.classList.toggle('selected', c.dataset.themeId === themeId);
  });

  // Update description text
  themeDescName.textContent = t.meta.name;
  themeDescEn.textContent = t.meta.nameEn;
  themeDescMood.textContent = t.meta.subtitle;
}

function showLanding() {
  landingScreen.classList.remove('hidden');
  loadingOverlay.classList.remove('visible');
  loadingOverlay.classList.remove('fade-out');
  splash.start();
}

function hideLanding() {
  landingScreen.classList.add('hidden');
  splash.stop();
}

// ─── Loading Screen ────────────────────────────────────────

function showLoading() {
  loadingOverlay.classList.add('visible');
  loadingOverlay.classList.remove('fade-out');
  loadingBar.style.width = '0%';
  loadingStatus.textContent = '正在准备…';

  // Start stretch tip rotation
  tipIndex = Math.floor(Math.random() * STRETCH_TIPS.length);
  showNextTip();
  tipTimer = setInterval(showNextTip, 4000);
}

function hideLoading() {
  loadingOverlay.classList.add('fade-out');
  setTimeout(() => {
    loadingOverlay.classList.remove('visible');
    loadingOverlay.classList.remove('fade-out');
  }, 600);

  if (tipTimer) { clearInterval(tipTimer); tipTimer = null; }
}

function showNextTip() {
  const tip = STRETCH_TIPS[tipIndex % STRETCH_TIPS.length];
  tipIndex++;

  // Fade out → swap text → fade in
  stretchTipEl.classList.add('fading');
  setTimeout(() => {
    stretchTipEl.textContent = tip;
    stretchTipEl.classList.remove('fading');
  }, 500);
}

function updateLoadingProgress(step, total, label) {
  const pct = Math.round((step / total) * 100);
  loadingBar.style.width = `${pct}%`;
  loadingStatus.textContent = label;
}

// ─── Theme Application + Start Flow ───────────────────────

async function startPractice() {
  const themeId = selectedThemeId;

  // 1. Apply theme config
  const theme = themeManager.applyTheme(themeId);

  // 2. Swap ink renderer
  const inkType = theme.ink.type;
  if (inkRenderers[inkType]) {
    activeInkRenderer = inkRenderers[inkType];
    if (activeInkRenderer.configure) {
      activeInkRenderer.configure(theme.ink);
    }
  } else {
    activeInkRenderer = inkRenderers.dots;
  }

  console.log(`[App] Theme: ${theme.meta.name}, ink=${inkType}`);

  // 3. Transition screens
  hideLanding();
  showLoading();
  setState(State.LOADING);

  // 4. Camera
  updateLoadingProgress(1, 5, '正在启动摄像头…');
  const camOk = await camera.start();
  if (!camOk) {
    hideLoading();
    showToast('摄像头启动失败，请检查权限设置', 4000);
    showLanding();
    setState(State.ERROR);
    return;
  }

  // 5. MediaPipe
  updateLoadingProgress(2, 5, '加载姿态检测模型…');
  const poseOk = await poseDetector.init();
  if (!poseOk) {
    camera.stop(); hideLoading();
    showToast('模型加载失败，请刷新重试', 4000);
    showLanding();
    setState(State.ERROR);
    return;
  }

  // 6. Audio init (needs user gesture context)
  updateLoadingProgress(3, 5, '初始化音频引擎…');
  await audioEngine.init();

  // 7. Template data
  const templatePath = themeManager.getTemplatePath();
  updateLoadingProgress(4, 5, '加载动作模板…');
  const templateOk = await templateLoader.load(templatePath);
  if (!templateOk) {
    showToast('模板加载失败', 3000);
  } else {
    console.log('[App] Template loaded:', templateLoader.meta);
  }

  // 8. Setup canvases + show camera
  updateLoadingProgress(5, 5, '准备画布…');
  resizeCanvases();
  videoEl.classList.add('visible');

  setState(State.CAMERA_READY);

  // 9. Hide loading, start pose + calibration
  await sleep(400); // brief pause for visual smoothness
  hideLoading();

  poseDetector.start();
  startCalibration();
}

function startCalibration() {
  setState(State.CALIBRATING);
  calibOverlay.classList.add('active');
  calibOverlay.classList.remove('fade-out');
  calibrator.start();
}

let pendingCoDance = false; // track if calibration was for co-dance

function onCalibrationComplete(result) {
  calibOverlay.classList.add('fade-out');
  setTimeout(() => calibOverlay.classList.remove('active'), 600);

  matchingEngine.setCalibration(result);
  guideRenderer.setCalibration(result);

  // Branch: co-dance or normal practice?
  if (pendingCoDance) {
    pendingCoDance = false;
    onCoDanceStart();
    return;
  }

  // Normal practice flow
  hud.classList.add('visible');

  activeInkRenderer.activate();
  guideRenderer.activate();

  if (templateLoader.data) {
    playback.setLoop(false);
    playback.play();
    showToast('跟随引导，以身运笔', 3000);
  } else {
    showToast('自由习练模式', 2000);
  }

  audioEngine.activate();
  setTimeout(() => audioEngine.pluck(0.6), 300);

  // Start recording motion for artwork
  motionRecorder.configure({ themeId: selectedThemeId, targetFps: 12 });
  motionRecorder.start();

  setState(State.PRACTICING);
}

async function onPlaybackComplete() {
  setState(State.COMPLETE);
  guideRenderer.deactivate();
  guideRenderer.clear();
  hud.classList.remove('visible');

  // Stop recording motion
  motionRecorder.stop();

  // Finalize artwork with thumbnail
  const bgColor = themeManager.getExportBackground();
  const fullPng = activeInkRenderer.exportPNG(bgColor);
  await motionRecorder.finalize({ thumbnail: fullPng });

  setTimeout(() => completionScreen.classList.add('visible'), 500);

  audioEngine.pluck(0.7);
  setTimeout(() => audioEngine.pluck(0.5), 600);
  showToast('习练完成', 3000);
}

/**
 * Save the last recorded artwork to store + download
 */
async function saveArtworkToGallery() {
  const artwork = motionRecorder.artwork;
  if (!artwork) {
    showToast('没有可分享的作品数据');
    return;
  }
  const saved = artworkStore.save(artwork);
  if (saved) {
    showToast('作品已保存至广场');
    bus.emit(Events.ARTWORK_SAVED, { id: artwork.id });
  } else {
    showToast('保存失败');
  }
}

function returnToLanding() {
  completionScreen.classList.remove('visible');
  activeInkRenderer.deactivate();
  activeInkRenderer.clear();
  guideRenderer.deactivate();
  guideRenderer.clear();
  playback.stop();
  artworkPlayback.stop();
  matchingEngine.reset();
  audioEngine.deactivate();
  motionRecorder.reset();
  hud.classList.remove('visible');
  videoEl.classList.remove('visible');
  codanceBadge.classList.remove('visible');
  setState(State.IDLE);
  showLanding();
}

// ─── Gallery ──────────────────────────────────────────────

function openGallery() {
  hideLanding();
  splash.stop();
  if (gallery) gallery.show();
  setState(State.GALLERY);
}

function closeGallery() {
  if (gallery) gallery.hide();
  showLanding();
  setState(State.IDLE);
}

// ─── Viewing Mode (观看) ──────────────────────────────────

let viewingRaf = 0;

/**
 * Enter viewing mode — play back an artwork's motion through ink renderer
 * PRD §6.3: 回放动作轨迹生成过程, 墨迹在画布上逐渐浮现
 */
async function startViewing(artworkId) {
  const artwork = artworkStore.get(artworkId);
  if (!artwork || !artwork.motion.length) {
    showToast('作品数据不可用'); return;
  }

  // Apply artwork's theme
  const themeId = artwork.meta.themeId || 'snow';
  const theme = themeManager.applyTheme(themeId);
  const inkType = theme.ink.type;
  if (inkRenderers[inkType]) {
    activeInkRenderer = inkRenderers[inkType];
    if (activeInkRenderer.configure) activeInkRenderer.configure(theme.ink);
  } else {
    activeInkRenderer = inkRenderers.dots;
  }

  // Load artwork motion into secondary loader
  artworkLoader.data = artwork.motion;
  artworkLoader._computeMeta();
  artworkPlayback.setLoop(false);

  // Setup canvas
  if (gallery) gallery.hide();
  resizeCanvases();
  activeInkRenderer.activate();

  // Show minimal HUD
  const name = `${Themes[themeId]?.meta.name || themeId}`;
  const alias = artwork.meta.alias || '匿名';
  $('#hud-theme-name').textContent = `观看 · ${name} · ${alias}`;
  hud.classList.add('visible');

  setState(State.VIEWING);
  artworkPlayback.play();

  // Audio ambience
  await audioEngine.init();
  audioEngine.activate();

  // Viewing render loop — drives ink from artwork playback
  const startTime = performance.now();
  function viewLoop() {
    if (currentState !== State.VIEWING) return;

    const now = performance.now();
    const pbData = artworkPlayback.update(now);

    if (pbData.current) {
      activeInkRenderer.render(pbData.current.joints, now);
    }
    if (hudProgress) hudProgress.style.width = `${pbData.progress * 100}%`;

    if (pbData.done) {
      finishViewing();
      return;
    }
    viewingRaf = requestAnimationFrame(viewLoop);
  }
  viewingRaf = requestAnimationFrame(viewLoop);
  showToast(`观看 · ${alias} 的轨迹`, 2500);
}

function finishViewing() {
  hud.classList.remove('visible');
  artworkPlayback.stop();

  // Show completion-style bar
  completionScreen.classList.add('visible');
  setState(State.COMPLETE);
  showToast('回放结束', 2000);
}

function stopViewing() {
  cancelAnimationFrame(viewingRaf);
  artworkPlayback.stop();
  activeInkRenderer.deactivate();
  activeInkRenderer.clear();
  audioEngine.deactivate();
  hud.classList.remove('visible');
  completionScreen.classList.remove('visible');
}

// ─── Co-Dance Mode (共舞) ──────────────────────────────────

let codanceArtworkId = null;

/**
 * Enter co-dance mode
 * PRD §6.4:
 *   1. 前人的轨迹作为"影子"以淡墨回放 (GuideRenderer)
 *   2. 用户开启摄像头，跟随"影子"做动作
 *   3. 两段轨迹融合：前人淡墨，自己浓墨
 *   4. 完成后生成"双人行草"
 */
async function startCoDance(artworkId) {
  const artwork = artworkStore.get(artworkId);
  if (!artwork || !artwork.motion.length) {
    showToast('作品数据不可用'); return;
  }

  codanceArtworkId = artworkId;
  const themeId = artwork.meta.themeId || 'snow';
  selectedThemeId = themeId;

  // Apply theme
  const theme = themeManager.applyTheme(themeId);
  const inkType = theme.ink.type;
  if (inkRenderers[inkType]) {
    activeInkRenderer = inkRenderers[inkType];
    if (activeInkRenderer.configure) activeInkRenderer.configure(theme.ink);
  } else {
    activeInkRenderer = inkRenderers.dots;
  }

  // Load artwork motion as guide data
  artworkLoader.data = artwork.motion;
  artworkLoader._computeMeta();
  artworkPlayback.setLoop(false);

  if (gallery) gallery.hide();
  showLoading();
  setState(State.CODANCE_LOADING);

  // Camera
  updateLoadingProgress(1, 4, '正在启动摄像头…');
  const camOk = await camera.start();
  if (!camOk) {
    hideLoading(); showToast('摄像头启动失败', 4000);
    showLanding(); setState(State.ERROR); return;
  }

  // Pose
  updateLoadingProgress(2, 4, '加载姿态检测模型…');
  const poseOk = await poseDetector.init();
  if (!poseOk) {
    camera.stop(); hideLoading();
    showToast('模型加载失败', 4000);
    showLanding(); setState(State.ERROR); return;
  }

  // Audio
  updateLoadingProgress(3, 4, '初始化音频引擎…');
  await audioEngine.init();

  // Setup
  updateLoadingProgress(4, 4, '准备共舞画布…');
  resizeCanvases();
  videoEl.classList.add('visible');

  await sleep(400);
  hideLoading();

  // Start pose + calibration
  poseDetector.start();
  startCoDanceCalibration(artwork);
}

function startCoDanceCalibration(artwork) {
  pendingCoDance = true;
  setState(State.CALIBRATING);
  calibOverlay.classList.add('active');
  calibOverlay.classList.remove('fade-out');
  calibrator.start();

  codanceArtworkId = artwork.id;
}

function onCoDanceStart() {
  const artwork = artworkStore.get(codanceArtworkId);
  if (!artwork) return;

  const alias = artwork.meta.alias || '匿名';

  activeInkRenderer.activate();
  guideRenderer.activate();

  // Start shadow playback (shown via GuideRenderer as faded guide trail)
  artworkPlayback.play();

  // HUD
  const themeId = artwork.meta.themeId;
  const name = Themes[themeId]?.meta.name || themeId;
  $('#hud-theme-name').textContent = `共舞 · ${name}`;
  hud.classList.add('visible');

  // Co-dance badge — PRD: "共舞中 · 与 [匿名ID] 的轨迹融合"
  codanceBadge.textContent = `共舞中 · 与 ${alias} 的轨迹融合`;
  codanceBadge.classList.add('visible');

  audioEngine.activate();
  setTimeout(() => audioEngine.pluck(0.5), 300);

  // Start recording user's motion
  motionRecorder.configure({ themeId: selectedThemeId, targetFps: 12 });
  motionRecorder.start();

  setState(State.CODANCE);
  showToast(`共舞开始 · 跟随 ${alias} 的轨迹`, 3000);
}

function onCoDanceComplete() {
  setState(State.CODANCE_COMPLETE);
  codanceBadge.classList.remove('visible');
  guideRenderer.deactivate();
  guideRenderer.clear();
  hud.classList.remove('visible');
  motionRecorder.stop();

  // Finalize
  const bgColor = themeManager.getExportBackground();
  const fullPng = activeInkRenderer.exportPNG(bgColor);
  motionRecorder.finalize({ thumbnail: fullPng });

  setTimeout(() => completionScreen.classList.add('visible'), 500);
  audioEngine.pluck(0.7);
  setTimeout(() => audioEngine.pluck(0.5), 600);
  showToast('共舞完成 · 双人行草已生成', 3000);
}

// ─── Event Wiring ──────────────────────────────────────────

bus.on(Events.CALIBRATION_PROGRESS, ({ progress }) => {
  calibBar.style.width = `${progress * 100}%`;
  updateDebug('cal', `${Math.round(progress * 100)}%`);
});

bus.on(Events.CALIBRATION_COMPLETE, (result) => {
  onCalibrationComplete(result);
});

bus.on(Events.PLAYBACK_COMPLETE, () => {
  // This fires for the main template playback — only handle in PRACTICING state
  if (currentState === State.PRACTICING) {
    onPlaybackComplete();
  }
});

// Pose frame → render + match
bus.on(Events.POSE_FRAME, ({ joints, valid, fps, latency }) => {
  const now = performance.now();

  debugOverlay.drawSkeleton(joints);

  if ((currentState === State.PRACTICING || currentState === State.CODANCE) && calibrator.result) {
    debugOverlay.drawBaseline(calibrator.result.baseline);
  }

  // ── Normal Practice: Guide rendering ──
  if (currentState === State.PRACTICING && playback.isPlaying) {
    const pbData = playback.update(now);

    guideRenderer.render(pbData);

    if (hudProgress) hudProgress.style.width = `${pbData.progress * 100}%`;
    updateDebug('playback', `${playback.currentTime.toFixed(1)}s / ${playback.duration.toFixed(1)}s`);

    // Matching
    if (valid && joints && pbData.current) {
      const matchResult = matchingEngine.computeMatch(joints, pbData.current.joints);

      updateDebug('match', `${(matchResult.smoothScore * 100).toFixed(0)}%`);
      updateDebug('level', matchResult.level);

      if (hudMatch) {
        hudMatch.className = 'hud-match ' + matchResult.level;
        hudMatch.textContent = matchResult.level === 'rich' ? '丰盈'
          : matchResult.level === 'flowing' ? '流动' : '';
      }

      audioEngine.onMatchUpdate(matchResult.level, matchResult.levelChanged, matchResult.smoothScore);
      bus.emit(Events.MATCH_UPDATE, matchResult);
    }
  } else if (currentState === State.PRACTICING && !playback.isPlaying && templateLoader.data) {
    guideRenderer.clear();
  }

  // ── Co-Dance: Shadow guide + user ink ──
  if (currentState === State.CODANCE && artworkPlayback.isPlaying) {
    const pbData = artworkPlayback.update(now);

    // Render shadow as guide trail (faded, reusing GuideRenderer)
    guideRenderer.render(pbData);

    if (hudProgress) hudProgress.style.width = `${pbData.progress * 100}%`;

    // Matching against shadow for audio feedback
    if (valid && joints && pbData.current) {
      const matchResult = matchingEngine.computeMatch(joints, pbData.current.joints);
      audioEngine.onMatchUpdate(matchResult.level, matchResult.levelChanged, matchResult.smoothScore);
    }

    // Check if shadow playback is done
    if (pbData.done) {
      onCoDanceComplete();
    }
  }

  // User ink + motion recording (both practice and co-dance)
  if ((currentState === State.PRACTICING || currentState === State.CODANCE) && valid) {
    activeInkRenderer.render(joints, now);
    motionRecorder.recordFrame(joints, now);
  }

  if (fps > 0) {
    hudFps.textContent = `${fps} fps · ${latency.toFixed(0)}ms`;
    updateDebug('fps', fps);
  }
  updateDebug('pose', valid ? '✓ detected' : '✗ lost');
  updateDebug('joints', joints ? `${joints.length} joints` : '-');
});

bus.on(Events.CAMERA_ERROR, ({ message }) => {
  showToast(message, 5000);
});

// ─── Export Preview System ────────────────────────────────

let _exportDataUrl = '';       // current image for download (with signature)
let _originalDataUrl = '';     // base composed image (no signature, for AI input)
let _enhancedDataUrl = '';     // AI enhanced image (no signature)
let _isEnhancing = false;      // AI enhancement in progress
let _exportOpts = null;        // cached compose options for _refreshDisplay

/**
 * Open export preview overlay with decorated artwork
 */
async function openExportPreview() {
  const themeId = themeManager.currentThemeId || 'snow';
  const theme = Themes[themeId];
  const isCoDance = currentState === State.CODANCE_COMPLETE;
  const isDark = themeId === 'bird';

  let partnerAlias = '';
  let userAlias = '';
  if (isCoDance && codanceArtworkId) {
    const partnerArt = artworkStore.get(codanceArtworkId);
    partnerAlias = partnerArt?.meta?.alias || '匿名';
    userAlias = motionRecorder.artwork?.meta?.alias || '匿名';
  }

  // Reset
  exportSigInput.value = '';
  exportAiToggle.checked = true;
  _enhancedDataUrl = '';

  // Cache compose options (reused by _refreshDisplay)
  _exportOpts = {
    inkCanvas,
    bgColor: theme?.canvas?.background || '#f0ece4',
    bgGradient: theme?.canvas?.backgroundGradient,
    seasonText: theme?.meta?.season || '',
    themeName: theme?.meta?.name || '',
    isDark,
    isCoDance,
    partnerAlias,
    userAlias,
  };

  // Compose base image WITHOUT signature (used as AI input)
  const composed = exportComposer.compose({ ..._exportOpts, signature: '' });
  _originalDataUrl = composed.toDataURL('image/png');

  // Set canvas dimensions
  exportCanvas.width = composed.width;
  exportCanvas.height = composed.height;

  // Display original first
  const ctx = exportCanvas.getContext('2d');
  ctx.drawImage(composed, 0, 0);
  _exportDataUrl = _originalDataUrl;

  // Show overlay
  exportPreview.classList.add('visible');
  setTimeout(() => exportSigInput.focus(), 300);

  // Auto-trigger AI enhancement
  _enhanceImage();
}

/**
 * Refresh canvas display — overlay signature on current base image (original or enhanced).
 * Does NOT trigger AI re-generation.
 */
function _refreshDisplay() {
  if (!_exportOpts) return;

  const useEnhanced = exportAiToggle.checked && _enhancedDataUrl;
  const baseUrl = useEnhanced ? _enhancedDataUrl : _originalDataUrl;
  if (!baseUrl) return;

  const img = new Image();
  img.onload = () => {
    const ctx = exportCanvas.getContext('2d');
    ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.drawImage(img, 0, 0, exportCanvas.width, exportCanvas.height);

    // Overlay signature on top of base image
    const signature = exportSigInput.value.trim();
    if (signature) {
      const w = exportCanvas.width;
      const h = exportCanvas.height;
      const scale = w / 1200;
      exportComposer._drawSignature(ctx, w - 140 * scale, h - 60 * scale, signature, scale, _exportOpts.isDark);
    }

    _exportDataUrl = exportCanvas.toDataURL('image/png');
  };
  img.src = baseUrl;
}

/**
 * Call AI enhancement API. On success, caches result and refreshes display.
 */
async function _enhanceImage() {
  if (_isEnhancing) return;

  try {
    _isEnhancing = true;
    aiEnhanceOverlay.classList.add('active');

    console.log('[Export] Starting AI enhancement...');

    const isHealthy = await aiEnhancer.checkHealth();
    if (!isHealthy) {
      throw new Error('AI 增强服务未启动，请先运行 npm run server');
    }

    _enhancedDataUrl = await aiEnhancer.enhance(_originalDataUrl);
    console.log('[Export] AI enhancement complete');

    // Refresh display with enhanced result + signature
    _refreshDisplay();

  } catch (error) {
    console.error('[Export] AI enhancement failed:', error);
    showToast(`AI 润色失败: ${error.message}`);
    _exportDataUrl = _originalDataUrl;
  } finally {
    _isEnhancing = false;
    aiEnhanceOverlay.classList.remove('active');
  }
}

function closeExportPreview() {
  exportPreview.classList.remove('visible');
  _exportDataUrl = '';
  _originalDataUrl = '';
  _enhancedDataUrl = '';
  _exportOpts = null;
}

async function downloadExport() {
  if (!_exportDataUrl) return;
  const themeName = themeManager.currentThemeId || 'flow';
  const suffix = (currentState === State.CODANCE_COMPLETE) ? '-codance' : '';
  const filename = `qi-flow-${themeName}${suffix}-${Date.now()}.png`;

  // Mobile: try Web Share API first (opens system share sheet → save to photos)
  if (isMobile && canWebShare()) {
    const shared = await shareImage(_exportDataUrl, filename);
    if (shared) {
      closeExportPreview();
      showToast('作品已分享');
      return;
    }
  }

  // iOS fallback: open in new tab (long press to save)
  if (isIOS) {
    const w = window.open();
    if (w) {
      w.document.write(`<img src="${_exportDataUrl}" style="width:100%;max-width:100vw" />`);
      w.document.title = '长按图片保存';
    }
    closeExportPreview();
    showToast('长按图片以保存到相册');
    return;
  }

  // Desktop / Android fallback: standard download
  const a = document.createElement('a');
  a.href = _exportDataUrl;
  a.download = filename;
  a.click();
  closeExportPreview();
  showToast('作品已保存');
}

// Signature input → refresh display only (no AI re-generation)
let _sigDebounce = 0;
exportSigInput?.addEventListener('input', () => {
  clearTimeout(_sigDebounce);
  _sigDebounce = setTimeout(() => _refreshDisplay(), 300);
});

// AI toggle → switch between original/enhanced display (no AI re-generation)
exportAiToggle?.addEventListener('change', () => {
  _refreshDisplay();
});

// 🔁 Redo button → re-trigger AI enhancement
aiRedoBtn?.addEventListener('click', () => {
  _enhancedDataUrl = '';
  _enhanceImage();
});

exportBtnSave?.addEventListener('click', () => downloadExport());
exportBtnCancel?.addEventListener('click', () => closeExportPreview());

// ─── Completion Actions ────────────────────────────────────

btnExport?.addEventListener('click', () => {
  openExportPreview();
});

btnShare?.addEventListener('click', () => {
  saveArtworkToGallery();
});

btnRestart?.addEventListener('click', () => {
  if (currentState === State.VIEWING || currentState === State.CODANCE_COMPLETE) {
    // From viewing or co-dance → return to landing
    stopViewing();
    returnToLanding();
  } else {
    // From normal practice → re-calibrate
    completionScreen.classList.remove('visible');
    activeInkRenderer.clear();
    guideRenderer.clear();
    matchingEngine.reset();
    playback.stop();
    audioEngine.deactivate();
    motionRecorder.reset();
    hud.classList.remove('visible');
    startCalibration();
  }
});

// ─── Keyboard Shortcuts ────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Escape closes overlays
  if (e.key === 'Escape') {
    if (exportPreview.classList.contains('visible')) {
      closeExportPreview(); return;
    }
    if (currentState === State.GALLERY) {
      closeGallery(); return;
    }
  }
  switch (e.key.toLowerCase()) {
    case 'd':
      debugPanel.classList.toggle('visible');
      break;
    case 'l':
      debugOverlay.toggleLabels();
      break;
    case 's':
      debugOverlay.toggle();
      break;
    case 'r':
      if (currentState === State.PRACTICING || currentState === State.COMPLETE) {
        completionScreen.classList.remove('visible');
        activeInkRenderer.deactivate();
        activeInkRenderer.clear();
        guideRenderer.deactivate();
        guideRenderer.clear();
        playback.stop();
        matchingEngine.reset();
        audioEngine.deactivate();
        hud.classList.remove('visible');
        startCalibration();
      }
      break;
    case 'c':
      if (currentState === State.PRACTICING) {
        activeInkRenderer.clear();
        showToast('画布已清空');
      }
      break;
    case 'e':
      if (currentState === State.PRACTICING || currentState === State.COMPLETE
        || currentState === State.CODANCE || currentState === State.CODANCE_COMPLETE) {
        openExportPreview();
      }
      break;
    case ' ':
      e.preventDefault();
      if (currentState === State.PRACTICING) {
        if (playback.isPlaying) { playback.pause(); showToast('已暂停'); }
        else { playback.play(); showToast('继续'); }
      }
      break;
    case 'g':
      if (currentState === State.PRACTICING) {
        if (guideRenderer.isActive) {
          guideRenderer.deactivate(); guideRenderer.clear();
          showToast('引导层已隐藏');
        } else {
          guideRenderer.activate();
          showToast('引导层已显示');
        }
      }
      break;
    case 't':
      if (currentState === State.PRACTICING || currentState === State.COMPLETE
        || currentState === State.CODANCE || currentState === State.CODANCE_COMPLETE) {
        stopViewing();
        returnToLanding();
      } else if (currentState === State.VIEWING) {
        stopViewing();
        returnToLanding();
      } else if (currentState === State.GALLERY) {
        closeGallery();
      }
      break;
  }
});

// ─── Window Resize + Orientation ──────────────────────────
let resizeTimer;
const handleResize = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (currentState !== State.IDLE && currentState !== State.GALLERY) {
      resizeCanvases();
    }
  }, 200);
};
window.addEventListener('resize', handleResize);

// Orientation change — re-layout + landscape warning on mobile
if (isMobile) {
  window.addEventListener('orientationchange', () => {
    // Wait for new dimensions to settle
    setTimeout(handleResize, 300);
  });

  // Landscape warning (gentle, non-blocking)
  const checkOrientation = () => {
    if (window.innerWidth > window.innerHeight && FULLSCREEN_STATES.has(currentState)) {
      showToast('建议竖屏使用，效果更佳', 3000);
    }
  };
  screen.orientation?.addEventListener('change', checkOrientation);
}

// ─── Utilities ─────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Boot ──────────────────────────────────────────────────

// Build theme circles on landing
buildThemeCircles();

// Initialize artwork store (loads seed content + localStorage)
artworkStore.init().then(() => {
  // Create gallery after store is ready
  gallery = new GalleryScreen(galleryScreen, artworkStore);
  gallery
    .onView((artworkId) => startViewing(artworkId))
    .onCoDance((artworkId) => startCoDance(artworkId))
    .onClose(() => closeGallery());
  console.log(`[App] Gallery ready: ${artworkStore.count} artworks`);
});

// Start button → begin practice with selected theme
btnStart.addEventListener('click', () => {
  startPractice();
});

// Gallery button on landing
btnGallery?.addEventListener('click', () => {
  openGallery();
});

// Gallery close button
btnGalleryClose?.addEventListener('click', () => {
  closeGallery();
});

// Start splash animation
splash.start();

console.log(
  '%c行气 Qi-Flow%c · Week 4 — 遇见·行气\n' +
  '[D] 调试 · [S] 骨骼 · [L] 标签 · [R] 重新校准\n' +
  '[C] 清墨 · [E] 导出 · [G] 引导层 · [T] 返回首屏\n' +
  '[Space] 暂停/继续',
  'color: #c4a35a; font-size: 14px; font-weight: bold;',
  'color: #8a8078; font-size: 12px;'
);
