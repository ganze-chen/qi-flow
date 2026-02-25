/**
 * 行气 Qi-Flow — Main Application (Week 2, Day 5-6)
 *
 * State machine:
 *   IDLE (landing) → LOADING → CAMERA_READY → CALIBRATING → PRACTICING → COMPLETE
 *
 * Landing screen shows animated ink particles + 4 circular theme selectors.
 * Loading screen shows ink-drop animation + rotating stretch tips.
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
import { ThemeManager } from './themes/ThemeManager.js';
import { ThemeId, Themes, getThemeIds } from './themes/ThemeRegistry.js';
import { BambooInkRenderer } from './themes/bamboo/BambooInkRenderer.js';
import { BirdInkRenderer } from './themes/bird/BirdInkRenderer.js';
import { StreamInkRenderer } from './themes/stream/StreamInkRenderer.js';

// ─── App State ─────────────────────────────────────────────
const State = {
  IDLE: 'idle',
  LOADING: 'loading',
  CAMERA_READY: 'camera_ready',
  CALIBRATING: 'calibrating',
  PRACTICING: 'practicing',
  COMPLETE: 'complete',
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

// ─── Module Instances ──────────────────────────────────────
const camera = new CameraManager(videoEl);
const poseDetector = new PoseDetector(videoEl);
const calibrator = new EnvironmentCalibrator();
const templateLoader = new TemplateLoader();
const playback = new TemplatePlayback(templateLoader);
const guideRenderer = new GuideRenderer(guideCanvas);
const matchingEngine = new MatchingEngine();
const audioEngine = new AudioEngine();
const debugOverlay = new DebugOverlay(debugCanvas);
const splash = new SplashCanvas(splashCanvasEl);
const themeManager = new ThemeManager();

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

// ─── State Management ──────────────────────────────────────
function setState(newState) {
  const prev = currentState;
  currentState = newState;
  bus.emit(Events.STATE_CHANGE, { prev, current: newState });
  updateDebug('state', newState);
  console.log(`[App] State: ${prev} → ${newState}`);
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

function onCalibrationComplete(result) {
  calibOverlay.classList.add('fade-out');
  setTimeout(() => calibOverlay.classList.remove('active'), 600);

  hud.classList.add('visible');

  matchingEngine.setCalibration(result);
  guideRenderer.setCalibration(result);

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

  setState(State.PRACTICING);
}

function onPlaybackComplete() {
  setState(State.COMPLETE);
  guideRenderer.deactivate();
  guideRenderer.clear();
  hud.classList.remove('visible');

  setTimeout(() => completionScreen.classList.add('visible'), 500);

  audioEngine.pluck(0.7);
  setTimeout(() => audioEngine.pluck(0.5), 600);
  showToast('习练完成', 3000);
}

function returnToLanding() {
  completionScreen.classList.remove('visible');
  activeInkRenderer.deactivate();
  activeInkRenderer.clear();
  guideRenderer.deactivate();
  guideRenderer.clear();
  playback.stop();
  matchingEngine.reset();
  audioEngine.deactivate();
  hud.classList.remove('visible');
  videoEl.classList.remove('visible');
  setState(State.IDLE);
  showLanding();
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
  onPlaybackComplete();
});

// Pose frame → render + match
bus.on(Events.POSE_FRAME, ({ joints, valid, fps, latency }) => {
  const now = performance.now();

  debugOverlay.drawSkeleton(joints);

  if (currentState === State.PRACTICING && calibrator.result) {
    debugOverlay.drawBaseline(calibrator.result.baseline);
  }

  // Guide rendering
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

  // User ink
  if (currentState === State.PRACTICING && valid) {
    activeInkRenderer.render(joints, now);
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

// ─── Completion Actions ────────────────────────────────────

btnExport?.addEventListener('click', () => {
  const bgColor = themeManager.getExportBackground();
  const dataUrl = activeInkRenderer.exportPNG(bgColor);
  const a = document.createElement('a');
  a.href = dataUrl;
  const themeName = themeManager.currentThemeId || 'flow';
  a.download = `qi-flow-${themeName}-${Date.now()}.png`;
  a.click();
  showToast('作品已导出');
});

btnRestart?.addEventListener('click', () => {
  completionScreen.classList.remove('visible');
  activeInkRenderer.clear();
  guideRenderer.clear();
  matchingEngine.reset();
  playback.stop();
  audioEngine.deactivate();
  hud.classList.remove('visible');
  startCalibration();
});

// ─── Keyboard Shortcuts ────────────────────────────────────
document.addEventListener('keydown', (e) => {
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
      if (currentState === State.PRACTICING || currentState === State.COMPLETE) {
        const bgColor = themeManager.getExportBackground();
        const dataUrl = activeInkRenderer.exportPNG(bgColor);
        const a = document.createElement('a');
        a.href = dataUrl;
        const themeName = themeManager.currentThemeId || 'flow';
        a.download = `qi-flow-${themeName}-${Date.now()}.png`;
        a.click();
        showToast('作品已导出');
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
      if (currentState === State.PRACTICING || currentState === State.COMPLETE) {
        returnToLanding();
      }
      break;
  }
});

// ─── Window Resize ─────────────────────────────────────────
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (currentState !== State.IDLE) {
      resizeCanvases();
    }
  }, 200);
});

// ─── Utilities ─────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Boot ──────────────────────────────────────────────────

// Build theme circles on landing
buildThemeCircles();

// Start button → begin practice with selected theme
btnStart.addEventListener('click', () => {
  startPractice();
});

// Start splash animation
splash.start();

console.log(
  '%c行气 Qi-Flow%c · Week 2 — 四季主题\n' +
  '[D] 调试 · [S] 骨骼 · [L] 标签 · [R] 重新校准\n' +
  '[C] 清墨 · [E] 导出 · [G] 引导层 · [T] 返回首屏\n' +
  '[Space] 暂停/继续',
  'color: #c4a35a; font-size: 14px; font-weight: bold;',
  'color: #8a8078; font-size: 12px;'
);
