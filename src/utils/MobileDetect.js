/**
 * MobileDetect — 移动端检测 + 性能配置
 *
 * Single source of truth for "are we on mobile?"
 * Used by CameraManager, renderers, and UI logic.
 */

const ua = navigator.userAgent || '';

export const isMobile = /Android|iPhone|iPad|iPod|Mobile|webOS/i.test(ua)
  || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua)); // iPad with desktop UA

export const isIOS = /iPhone|iPad|iPod/i.test(ua)
  || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);

export const isAndroid = /Android/i.test(ua);

/**
 * Performance budgets — mobile gets reduced counts
 */
export const perfConfig = {
  // Bird boid particles
  boidCount:      isMobile ? 150 : 300,
  // Stream wave grid
  waveLineCount:  isMobile ? 30 : 45,
  wavePointsPerLine: isMobile ? 50 : 80,
  // Splash particles
  splashCount:    isMobile ? 18 : 35,
  // Camera
  cameraWidth:    isMobile ? 640 : 1280,
  cameraHeight:   isMobile ? 480 : 720,
  cameraFps:      isMobile ? 24 : 30,
};

/**
 * Check if Web Share API is available (for mobile save-to-photos)
 */
export function canWebShare() {
  return !!navigator.share && !!navigator.canShare;
}

/**
 * Share an image via Web Share API (mobile)
 * @param {string} dataUrl - PNG data URL
 * @param {string} filename
 * @returns {Promise<boolean>}
 */
export async function shareImage(dataUrl, filename = 'qi-flow.png') {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: '行气 · Qi-Flow',
        text: '以身运笔，虚实相生',
        files: [file],
      });
      return true;
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('[MobileDetect] Share failed:', err);
    }
  }
  return false;
}

/**
 * Lock body scroll (prevent iOS rubber-banding during practice)
 */
export function lockScroll() {
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.width = '100%';
  document.body.style.height = '100%';
}

/**
 * Unlock body scroll
 */
export function unlockScroll() {
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.width = '';
  document.body.style.height = '';
}
