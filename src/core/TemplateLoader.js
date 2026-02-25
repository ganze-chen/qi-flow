/**
 * TemplateLoader — 动作模板数据加载器
 *
 * PRD 5.2: 四段办公室肩颈放松内容，通过MediaPipe导出，
 *          经过抽帧处理，保留17个上半身关键关节点，JSON格式。
 *
 * Data format: [{t: timestamp_sec, j: [[x,y,z,vis], ...]}, ...]
 */

export class TemplateLoader {
  /** @type {Array|null} */
  data = null;
  /** Template metadata */
  meta = {
    totalFrames: 0,
    duration: 0,
    fps: 0,
    jointsPerFrame: 0,
  };

  /**
   * Load template from URL
   * @param {string} url - path to compressed JSON
   */
  async load(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this.data = await resp.json();
      this._computeMeta();
      console.log('[TemplateLoader] Loaded:', this.meta);
      return true;
    } catch (err) {
      console.error('[TemplateLoader] Load failed:', err);
      return false;
    }
  }

  /**
   * Compute metadata from loaded data
   */
  _computeMeta() {
    if (!this.data || this.data.length === 0) return;
    const n = this.data.length;
    const duration = this.data[n - 1].t;
    const interval = n > 1 ? this.data[1].t - this.data[0].t : 0;
    this.meta = {
      totalFrames: n,
      duration,
      fps: interval > 0 ? Math.round(1 / interval) : 0,
      jointsPerFrame: this.data[0].j.length,
    };
  }

  /**
   * Get frame at a given time (nearest frame)
   * @param {number} time - seconds
   * @returns {{ joints: Array, frameIndex: number }|null}
   */
  getFrameAtTime(time) {
    if (!this.data) return null;
    // Binary search for nearest frame
    let lo = 0, hi = this.data.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.data[mid].t < time) lo = mid + 1;
      else hi = mid;
    }
    // Check if previous frame is closer
    if (lo > 0 && Math.abs(this.data[lo - 1].t - time) < Math.abs(this.data[lo].t - time)) {
      lo--;
    }
    return {
      joints: this.data[lo].j,
      frameIndex: lo,
      timestamp: this.data[lo].t,
    };
  }

  /**
   * Get frame by index
   * @param {number} index
   */
  getFrame(index) {
    if (!this.data || index < 0 || index >= this.data.length) return null;
    return {
      joints: this.data[index].j,
      frameIndex: index,
      timestamp: this.data[index].t,
    };
  }

  /**
   * Get all joints as a flat timeline for analysis
   * @param {number} jointIndex - which joint (0-16)
   * @returns {Array<{t: number, x: number, y: number, z: number}>}
   */
  getJointTimeline(jointIndex) {
    if (!this.data) return [];
    return this.data.map((frame) => ({
      t: frame.t,
      x: frame.j[jointIndex][0],
      y: frame.j[jointIndex][1],
      z: frame.j[jointIndex][2],
      vis: frame.j[jointIndex][3],
    }));
  }
}
