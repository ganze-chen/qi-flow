/**
 * 行气 Qi-Flow — Seed Content Recording Tool
 *
 * Standalone page for recording motion data that can be used as:
 *   1. Seed artworks for the "遇见·行气" gallery (PRD §6.5)
 *   2. Additional template data for guide playback
 *
 * Outputs artwork JSON files compatible with ArtworkSchema,
 * whose motion data is also compatible with TemplateLoader.
 */

import { CameraManager } from './core/CameraManager.js';
import { PoseDetector } from './core/PoseDetector.js';
import { MotionRecorder } from './social/MotionRecorder.js';
import {
  generateAlias,
  artworkToBlob,
  createThumbnail,
} from './social/ArtworkSchema.js';
import { bus, Events } from './utils/EventBus.js';

// ─── DOM ─────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const videoEl = $('#camera-feed');
const skeletonCanvas = $('#skeleton-canvas');
const recIndicator = $('#rec-indicator');
const recTimer = $('#rec-timer');
const statusBadge = $('#status-badge');
const jointCount = $('#joint-count');
const btnCamera = $('#btn-camera');
const btnRecord = $('#btn-record');
const btnExport = $('#btn-export');
const btnExportAll = $('#btn-export-all');
const themeSelect = $('#theme-select');
const titleInput = $('#title-input');
const aliasInput = $('#alias-input');
const recordingList = $('#recording-list');
const recordingCountEl = $('#recording-count');
const toast = $('#toast');

// ─── State ──────────────────────────────────────────────────
const camera = new CameraManager(videoEl);
const poseDetector = new PoseDetector(videoEl);
const recorder = new MotionRecorder();

let cameraReady = false;
let poseReady = false;
let isRecording = false;
let recordingStartTime = 0;
let timerInterval = null;

// All completed recordings in this session
const recordings = [];

// Skeleton drawing context
let skelCtx = null;

// ─── Toast ──────────────────────────────────────────────────
function showToast(msg, duration = 2500) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// ─── Camera Setup ────────────────────────────────────────────

btnCamera.addEventListener('click', async () => {
  btnCamera.disabled = true;
  btnCamera.textContent = '正在启动…';
  statusBadge.textContent = '启动摄像头…';

  const camOk = await camera.start();
  if (!camOk) {
    statusBadge.textContent = '摄像头失败';
    btnCamera.disabled = false;
    btnCamera.textContent = '重试';
    showToast('摄像头启动失败，请检查权限');
    return;
  }

  statusBadge.textContent = '加载模型…';
  const poseOk = await poseDetector.init();
  if (!poseOk) {
    camera.stop();
    statusBadge.textContent = '模型加载失败';
    btnCamera.disabled = false;
    btnCamera.textContent = '重试';
    showToast('姿态检测模型加载失败');
    return;
  }

  // Setup skeleton canvas
  const rect = videoEl.getBoundingClientRect();
  skeletonCanvas.width = rect.width * (window.devicePixelRatio || 1);
  skeletonCanvas.height = rect.height * (window.devicePixelRatio || 1);
  skelCtx = skeletonCanvas.getContext('2d');
  skelCtx.setTransform(
    (window.devicePixelRatio || 1), 0, 0,
    (window.devicePixelRatio || 1), 0, 0
  );

  cameraReady = true;
  poseReady = true;
  poseDetector.start();

  statusBadge.textContent = '就绪';
  btnCamera.textContent = '摄像头已启动';
  btnRecord.disabled = false;
  showToast('摄像头和姿态检测就绪');
});

// ─── Skeleton Drawing ────────────────────────────────────────

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7],  // nose→L_ear→L_wrist
  [0, 2], [2, 4], [4, 8],          // nose→R_ear→R_wrist
  [3, 5], [4, 6],                   // shoulders→elbows
  [5, 7], [6, 8],                   // elbows→wrists
  [3, 4],                           // shoulder span
  [3, 9], [4, 10],                  // shoulders→hips
  [9, 10],                          // hip span
];

function drawSkeleton(joints) {
  if (!skelCtx) return;
  const w = skeletonCanvas.width / (window.devicePixelRatio || 1);
  const h = skeletonCanvas.height / (window.devicePixelRatio || 1);
  skelCtx.clearRect(0, 0, w, h);

  if (!joints) return;

  // Mirror X for skeleton (camera is mirrored)
  const mx = (x) => (1 - x) * w;
  const my = (y) => y * h;

  // Draw connections
  skelCtx.strokeStyle = isRecording
    ? 'rgba(180, 68, 68, 0.5)'
    : 'rgba(196, 163, 90, 0.4)';
  skelCtx.lineWidth = 2;
  for (const [a, b] of CONNECTIONS) {
    if (a >= joints.length || b >= joints.length) continue;
    const ja = joints[a], jb = joints[b];
    if (ja[3] < 0.3 || jb[3] < 0.3) continue;
    skelCtx.beginPath();
    skelCtx.moveTo(mx(ja[0]), my(ja[1]));
    skelCtx.lineTo(mx(jb[0]), my(jb[1]));
    skelCtx.stroke();
  }

  // Draw joints
  for (let i = 0; i < joints.length; i++) {
    const j = joints[i];
    if (j[3] < 0.3) continue;
    skelCtx.fillStyle = isRecording
      ? 'rgba(180, 68, 68, 0.8)'
      : 'rgba(196, 163, 90, 0.7)';
    skelCtx.beginPath();
    skelCtx.arc(mx(j[0]), my(j[1]), 4, 0, Math.PI * 2);
    skelCtx.fill();
  }
}

// ─── Pose Frame Handling ─────────────────────────────────────

bus.on(Events.POSE_FRAME, ({ joints, valid, fps }) => {
  drawSkeleton(joints);

  const visibleCount = joints
    ? joints.filter(j => j[3] > 0.3).length
    : 0;
  jointCount.textContent = `${visibleCount}/${joints?.length || 0} joints · ${fps || 0} fps`;

  // Record if active
  if (isRecording && valid && joints) {
    recorder.recordFrame(joints, performance.now());
  }
});

// ─── Recording Controls ──────────────────────────────────────

btnRecord.addEventListener('click', () => {
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
});

function startRecording() {
  const themeId = themeSelect.value;
  recorder.configure({ themeId, targetFps: 12 });
  recorder.start();

  isRecording = true;
  recordingStartTime = performance.now();

  // UI updates
  btnRecord.textContent = '停止录制';
  btnRecord.classList.add('recording');
  recIndicator.classList.add('active');
  recTimer.classList.add('active');
  statusBadge.textContent = '录制中…';
  btnExport.disabled = true;

  // Timer
  timerInterval = setInterval(updateTimer, 100);
  showToast('开始录制 — 请做出动作');
}

function stopRecording() {
  const frameCount = recorder.stop();
  isRecording = false;

  clearInterval(timerInterval);
  timerInterval = null;

  // UI updates
  btnRecord.textContent = '开始录制';
  btnRecord.classList.remove('recording');
  recIndicator.classList.remove('active');
  recTimer.classList.remove('active');
  statusBadge.textContent = '就绪';

  if (frameCount < 10) {
    showToast('录制太短（不到10帧），已丢弃');
    return;
  }

  // Finalize and store
  finalizeRecording();
}

async function finalizeRecording() {
  const title = titleInput.value.trim();
  const alias = aliasInput.value.trim();

  const artwork = await recorder.finalize({
    title: title || undefined,
    alias: alias || undefined,
  });

  if (!artwork) {
    showToast('录制数据异常，无法保存');
    return;
  }

  recordings.push(artwork);
  updateRecordingList();

  btnExport.disabled = false;
  btnExportAll.disabled = recordings.length < 2;

  showToast(`已录制：${artwork.meta.frameCount} 帧，${artwork.meta.duration.toFixed(1)}s`);

  // Clear inputs for next recording
  titleInput.value = '';
}

function updateTimer() {
  const elapsed = (performance.now() - recordingStartTime) / 1000;
  const min = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const sec = Math.floor(elapsed % 60).toString().padStart(2, '0');
  recTimer.textContent = `${min}:${sec}`;
}

// ─── Recording List ──────────────────────────────────────────

const THEME_COLORS = {
  snow: '#8a8078',
  bamboo: '#6a7a5a',
  bird: '#5a5a8a',
  stream: '#5a7a6a',
};
const THEME_NAMES = {
  snow: '踏雪留痕',
  bamboo: '翠竹风声',
  bird: '月下鸟群',
  stream: '曲水流觞',
};

function updateRecordingList() {
  recordingCountEl.textContent = recordings.length;
  recordingList.innerHTML = '';

  for (let i = 0; i < recordings.length; i++) {
    const art = recordings[i];
    const item = document.createElement('div');
    item.className = 'recording-item';

    const themeName = THEME_NAMES[art.meta.themeId] || art.meta.themeId;
    const themeColor = THEME_COLORS[art.meta.themeId] || '#888';
    const dur = art.meta.duration.toFixed(1);
    const frames = art.meta.frameCount;
    const title = art.meta.title || art.meta.alias;

    item.innerHTML = `
      <div class="theme-dot" style="background:${themeColor}"></div>
      <div class="info">
        <strong>${title}</strong><br/>
        ${themeName} · ${dur}s · ${frames}帧
      </div>
      <div class="actions">
        <button data-action="download" data-index="${i}">下载</button>
        <button data-action="delete" data-index="${i}">删除</button>
      </div>
    `;
    recordingList.appendChild(item);
  }

  // Bind action buttons
  recordingList.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index);
      const action = e.target.dataset.action;
      if (action === 'download') downloadRecording(idx);
      if (action === 'delete') deleteRecording(idx);
    });
  });
}

function downloadRecording(index) {
  const artwork = recordings[index];
  if (!artwork) return;

  const blob = artworkToBlob(artwork);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const theme = artwork.meta.themeId;
  const dur = Math.round(artwork.meta.duration);
  a.href = url;
  a.download = `seed-${theme}-${dur}s-${artwork.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('已下载作品 JSON');
}

function deleteRecording(index) {
  recordings.splice(index, 1);
  updateRecordingList();
  btnExportAll.disabled = recordings.length < 2;
  if (recordings.length === 0) btnExport.disabled = true;
}

// ─── Export ─────────────────────────────────────────────────

btnExport.addEventListener('click', () => {
  if (recordings.length === 0) return;
  downloadRecording(recordings.length - 1);
});

btnExportAll.addEventListener('click', () => {
  if (recordings.length < 2) return;

  // Export as a batch: create a seed index + individual files
  // Package as individual downloads for now
  for (let i = 0; i < recordings.length; i++) {
    setTimeout(() => downloadRecording(i), i * 300);
  }

  // Also generate a seed index.json
  const index = {
    version: 1,
    description: `行气 · 种子内容 · ${new Date().toISOString().split('T')[0]}`,
    artworks: recordings.map((art, i) => ({
      path: `/data/seed/${art.id}.json`,
      themeId: art.meta.themeId,
      duration: art.meta.duration,
      alias: art.meta.alias,
    })),
  };

  const indexBlob = new Blob([JSON.stringify(index, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(indexBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'seed-index.json';
  setTimeout(() => {
    a.click();
    URL.revokeObjectURL(url);
    showToast('已导出所有录制 + 种子索引');
  }, recordings.length * 300 + 200);
});

// ─── Boot ───────────────────────────────────────────────────

console.log(
  '%c行气 Qi-Flow%c · 种子内容录制工具',
  'color: #c4a35a; font-size: 14px; font-weight: bold;',
  'color: #8a8078; font-size: 12px;'
);
