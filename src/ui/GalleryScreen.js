/**
 * GalleryScreen — 遇见·行气 · 动作广场
 *
 * PRD §6, §7.3D:
 *   - 瀑布流作品卡片: 墨迹缩略图 + 主题色标签 + 时间戳
 *   - 点击卡片: 全屏overlay → "观看" + "共舞" 两个选项
 *   - No Chat, No Likes, No Followers
 *   - 以"痕迹"代替"内容"，以"共舞"代替"互动"
 */

const THEME_LABELS = {
  snow:   { name: '踏雪留痕', color: '#8a8078', bg: '#f0ece4' },
  bamboo: { name: '翠竹风声', color: '#5a7a4a', bg: '#f2f0e6' },
  bird:   { name: '月下鸟群', color: '#8080b0', bg: '#1a1a2e' },
  stream: { name: '曲水流觞', color: '#5a8a6a', bg: '#e8ece6' },
};

export class GalleryScreen {
  _container = null;
  _artworkStore = null;
  _onView = null;    // callback(artworkId)
  _onCoDance = null; // callback(artworkId)
  _onClose = null;   // callback()
  _built = false;

  /**
   * @param {HTMLElement} container - #gallery-screen element
   * @param {import('../social/ArtworkStore.js').ArtworkStore} store
   */
  constructor(container, store) {
    this._container = container;
    this._artworkStore = store;
  }

  /**
   * Set callbacks for gallery actions
   */
  onView(cb) { this._onView = cb; return this; }
  onCoDance(cb) { this._onCoDance = cb; return this; }
  onClose(cb) { this._onClose = cb; return this; }

  /**
   * Build and show the gallery
   */
  show() {
    this._buildCards();
    this._container.classList.add('visible');
  }

  hide() {
    this._container.classList.remove('visible');
    // Also close any open detail overlay
    const detail = this._container.querySelector('.gallery-detail');
    if (detail) detail.classList.remove('visible');
  }

  /**
   * Build artwork cards from store data
   */
  _buildCards() {
    const grid = this._container.querySelector('.gallery-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const artworks = this._artworkStore.list();

    if (artworks.length === 0) {
      grid.innerHTML = `
        <div class="gallery-empty">
          <p class="gallery-empty-text">尚无作品痕迹</p>
          <p class="gallery-empty-hint">完成一次习练，将你的轨迹分享至此</p>
        </div>
      `;
      return;
    }

    for (const art of artworks) {
      const card = this._createCard(art);
      grid.appendChild(card);
    }
  }

  _createCard(artwork) {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.dataset.artworkId = artwork.id;

    const theme = THEME_LABELS[artwork.meta.themeId] || THEME_LABELS.snow;
    const isSeed = this._artworkStore.isSeed(artwork.id);
    const dur = artwork.meta.duration.toFixed(0);
    const alias = artwork.meta.alias || '匿名';
    const date = formatDate(artwork.meta.createdAt);
    const isDark = artwork.meta.themeId === 'bird';

    // Thumbnail or gradient placeholder
    const thumbStyle = artwork.thumbnail
      ? `background-image: url(${artwork.thumbnail}); background-size: cover; background-position: center;`
      : `background: ${isDark
          ? 'linear-gradient(135deg, #1a1a2e, #16213e)'
          : `linear-gradient(135deg, ${theme.bg}, ${shiftColor(theme.bg, -10)})`};`;

    card.innerHTML = `
      <div class="gallery-card-thumb" style="${thumbStyle}">
        <span class="gallery-card-tag" style="background: ${theme.color}">${theme.name}</span>
        ${isSeed ? '<span class="gallery-card-seed">种子</span>' : ''}
      </div>
      <div class="gallery-card-info">
        <span class="gallery-card-alias">${alias}</span>
        <span class="gallery-card-meta">${dur}s · ${date}</span>
      </div>
    `;

    card.addEventListener('click', () => this._showDetail(artwork));
    return card;
  }

  /**
   * Show artwork detail overlay with "观看" and "共舞" options
   */
  _showDetail(artwork) {
    // Remove any existing detail overlay
    let detail = this._container.querySelector('.gallery-detail');
    if (detail) detail.remove();

    const theme = THEME_LABELS[artwork.meta.themeId] || THEME_LABELS.snow;
    const alias = artwork.meta.alias || '匿名';
    const dur = artwork.meta.duration.toFixed(1);
    const frames = artwork.meta.frameCount;
    const isDark = artwork.meta.themeId === 'bird';

    const thumbStyle = artwork.thumbnail
      ? `background-image: url(${artwork.thumbnail}); background-size: cover; background-position: center;`
      : `background: ${isDark
          ? 'linear-gradient(135deg, #1a1a2e, #16213e)'
          : `linear-gradient(135deg, ${theme.bg}, ${shiftColor(theme.bg, -10)})`};`;

    detail = document.createElement('div');
    detail.className = 'gallery-detail';
    detail.innerHTML = `
      <div class="gallery-detail-backdrop"></div>
      <div class="gallery-detail-content">
        <div class="gallery-detail-thumb" style="${thumbStyle}"></div>
        <div class="gallery-detail-meta">
          <span class="gallery-detail-tag" style="background: ${theme.color}">${theme.name}</span>
          <h3 class="gallery-detail-alias">${alias}</h3>
          <p class="gallery-detail-stats">${dur}秒 · ${frames}帧</p>
        </div>
        <div class="gallery-detail-actions">
          <button class="gallery-btn gallery-btn-view" data-action="view">
            <span class="gallery-btn-icon">▶</span>
            观看
          </button>
          <button class="gallery-btn gallery-btn-codance" data-action="codance">
            <span class="gallery-btn-icon">❖</span>
            共舞
          </button>
        </div>
        <button class="gallery-detail-close" data-action="close">×</button>
      </div>
    `;

    // Bind actions
    detail.querySelector('[data-action="view"]').addEventListener('click', () => {
      detail.classList.remove('visible');
      if (this._onView) this._onView(artwork.id);
    });

    detail.querySelector('[data-action="codance"]').addEventListener('click', () => {
      detail.classList.remove('visible');
      if (this._onCoDance) this._onCoDance(artwork.id);
    });

    detail.querySelector('[data-action="close"]').addEventListener('click', () => {
      detail.classList.remove('visible');
    });

    detail.querySelector('.gallery-detail-backdrop').addEventListener('click', () => {
      detail.classList.remove('visible');
    });

    this._container.appendChild(detail);
    // Trigger reflow then add visible class for animation
    requestAnimationFrame(() => detail.classList.add('visible'));
  }
}

// ── Helpers ──────────────────────────────────────────────────

function formatDate(timestamp) {
  const d = new Date(timestamp);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hour = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hour}:${min}`;
}

function shiftColor(hex, amount) {
  // Simple brightness shift for placeholder gradients
  const num = parseInt(hex.replace('#', ''), 16);
  let r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + amount));
  let g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  let b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}
