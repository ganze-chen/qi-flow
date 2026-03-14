/**
 * CameraManager — 摄像头权限请求与视频流管理
 *
 * PRD 3.2: 用户点击"开始习练"后请求摄像头权限。
 * PRD 8.3: 所有姿态检测100%在浏览器端完成。
 * PRD 7.4: 移动端默认前置摄像头。
 */
import { bus, Events } from '../utils/EventBus.js';
import { perfConfig } from '../utils/MobileDetect.js';

export class CameraManager {
  /** @type {HTMLVideoElement} */
  videoEl = null;
  /** @type {MediaStream|null} */
  stream = null;
  isReady = false;

  /**
   * @param {HTMLVideoElement} videoEl
   */
  constructor(videoEl) {
    this.videoEl = videoEl;
  }

  /**
   * Request camera permission and start stream
   * PRD spec: 移动端默认前置摄像头
   */
  async start() {
    try {
      const constraints = {
        video: {
          facingMode: 'user',
          width: { ideal: perfConfig.cameraWidth },
          height: { ideal: perfConfig.cameraHeight },
          frameRate: { ideal: perfConfig.cameraFps, max: 30 },
        },
        audio: false,
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoEl.srcObject = this.stream;

      // Wait for video to be playable
      await new Promise((resolve, reject) => {
        this.videoEl.onloadedmetadata = () => {
          this.videoEl.play().then(resolve).catch(reject);
        };
        // Timeout after 5s
        setTimeout(() => reject(new Error('Camera timeout')), 5000);
      });

      this.isReady = true;
      bus.emit(Events.CAMERA_READY, {
        width: this.videoEl.videoWidth,
        height: this.videoEl.videoHeight,
      });

      return true;
    } catch (err) {
      console.error('[CameraManager] Failed:', err);
      bus.emit(Events.CAMERA_ERROR, {
        error: err.name,
        message: this._getErrorMessage(err),
      });
      return false;
    }
  }

  /**
   * Stop camera stream and release resources
   */
  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.videoEl.srcObject = null;
    this.isReady = false;
  }

  /**
   * Get current video dimensions
   */
  getDimensions() {
    return {
      width: this.videoEl.videoWidth || 0,
      height: this.videoEl.videoHeight || 0,
    };
  }

  /**
   * Human-readable error messages
   */
  _getErrorMessage(err) {
    switch (err.name) {
      case 'NotAllowedError':
        return '摄像头权限被拒绝。请在浏览器设置中允许摄像头访问。';
      case 'NotFoundError':
        return '未检测到摄像头设备。';
      case 'NotReadableError':
        return '摄像头被其他应用占用，请关闭后重试。';
      case 'OverconstrainedError':
        return '摄像头不支持所需的分辨率。';
      default:
        return `摄像头启动失败: ${err.message}`;
    }
  }
}
