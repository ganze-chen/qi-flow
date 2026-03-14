/**
 * ArtworkStore — 作品存储管理
 *
 * PRD §8.1: localStorage + IndexedDB for user works; 预置JSON for seed content
 * PRD §6.5: 广场内预置3-5组高质量种子内容
 *
 * Architecture:
 *   - User artworks → localStorage (key: 'qi-flow:artworks')
 *   - Seed artworks → loaded from /data/seed/*.json at init
 *   - All artworks share the same schema (ArtworkSchema)
 *   - TemplateLoader can directly consume artwork.motion for playback
 *
 * Storage budget:
 *   Each artwork ~50-150KB (motion data) + ~5KB (thumbnail)
 *   localStorage limit ~5MB → ~30 artworks comfortably
 */

import { validateArtwork, SCHEMA_VERSION } from './ArtworkSchema.js';

const STORAGE_KEY = 'qi-flow:artworks';
const SEED_INDEX_PATH = '/data/seed/index.json';

export class ArtworkStore {
  /** @type {Map<string, Artwork>} all artworks keyed by id */
  _artworks = new Map();
  /** @type {Set<string>} IDs of seed (built-in) artworks */
  _seedIds = new Set();
  _loaded = false;

  /**
   * Initialize store — load from localStorage + seed content
   */
  async init() {
    // 1. Load user artworks from localStorage
    this._loadFromStorage();

    // 2. Load seed content
    await this._loadSeedContent();

    this._loaded = true;
    console.log(`[ArtworkStore] Initialized: ${this._artworks.size} artworks ` +
      `(${this._seedIds.size} seed, ${this._artworks.size - this._seedIds.size} user)`);
  }

  // ─── CRUD ─────────────────────────────────────────────────

  /**
   * Save an artwork (user-created)
   * @param {Artwork} artwork
   * @returns {boolean} success
   */
  save(artwork) {
    const { valid, errors } = validateArtwork(artwork);
    if (!valid) {
      console.warn('[ArtworkStore] Cannot save invalid artwork:', errors);
      return false;
    }

    this._artworks.set(artwork.id, artwork);
    this._persistToStorage();
    console.log(`[ArtworkStore] Saved artwork: ${artwork.id}`);
    return true;
  }

  /**
   * Get an artwork by ID
   * @param {string} id
   * @returns {Artwork|null}
   */
  get(id) {
    return this._artworks.get(id) || null;
  }

  /**
   * Delete a user artwork (cannot delete seed content)
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    if (this._seedIds.has(id)) {
      console.warn('[ArtworkStore] Cannot delete seed content');
      return false;
    }
    const deleted = this._artworks.delete(id);
    if (deleted) this._persistToStorage();
    return deleted;
  }

  /**
   * Get all artworks sorted by creation time (newest first)
   * @param {{ themeId?: string, seedOnly?: boolean }} filter
   * @returns {Artwork[]}
   */
  list({ themeId, seedOnly } = {}) {
    let results = Array.from(this._artworks.values());

    if (themeId) {
      results = results.filter(a => a.meta.themeId === themeId);
    }
    if (seedOnly) {
      results = results.filter(a => this._seedIds.has(a.id));
    }

    // Sort newest first
    results.sort((a, b) => b.meta.createdAt - a.meta.createdAt);
    return results;
  }

  /**
   * Check if an artwork is seed (built-in) content
   * @param {string} id
   * @returns {boolean}
   */
  isSeed(id) {
    return this._seedIds.has(id);
  }

  /**
   * Get count of artworks
   */
  get count() { return this._artworks.size; }
  get userCount() { return this._artworks.size - this._seedIds.size; }
  get seedCount() { return this._seedIds.size; }

  // ─── localStorage Persistence ──────────────────────────────

  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;

      for (const item of arr) {
        const { valid } = validateArtwork(item);
        if (valid) {
          this._artworks.set(item.id, item);
        }
      }
      console.log(`[ArtworkStore] Loaded ${arr.length} user artworks from localStorage`);
    } catch (err) {
      console.warn('[ArtworkStore] Failed to load from localStorage:', err);
    }
  }

  _persistToStorage() {
    try {
      // Only persist user artworks (not seed content)
      const userArtworks = Array.from(this._artworks.values())
        .filter(a => !this._seedIds.has(a.id));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userArtworks));
    } catch (err) {
      console.warn('[ArtworkStore] Failed to persist to localStorage:', err);
      // Likely quota exceeded — try removing thumbnails
      this._persistCompact();
    }
  }

  _persistCompact() {
    try {
      const userArtworks = Array.from(this._artworks.values())
        .filter(a => !this._seedIds.has(a.id))
        .map(a => ({ ...a, thumbnail: '' })); // strip thumbnails
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userArtworks));
      console.log('[ArtworkStore] Persisted without thumbnails (space saving)');
    } catch (err) {
      console.error('[ArtworkStore] Cannot persist even without thumbnails:', err);
    }
  }

  // ─── Seed Content ──────────────────────────────────────────

  async _loadSeedContent() {
    try {
      const resp = await fetch(SEED_INDEX_PATH);
      if (!resp.ok) {
        console.log('[ArtworkStore] No seed index found (this is ok for dev)');
        return;
      }
      const index = await resp.json();
      if (!Array.isArray(index.artworks)) return;

      // Load each seed artwork
      for (const entry of index.artworks) {
        try {
          const artResp = await fetch(entry.path);
          if (!artResp.ok) continue;
          const artwork = await artResp.json();
          const { valid } = validateArtwork(artwork);
          if (valid) {
            this._artworks.set(artwork.id, artwork);
            this._seedIds.add(artwork.id);
          }
        } catch (err) {
          console.warn(`[ArtworkStore] Failed to load seed: ${entry.path}`, err);
        }
      }
    } catch (err) {
      // Seed content is optional — graceful fail
      console.log('[ArtworkStore] Seed content not available');
    }
  }

  // ─── Utilities ─────────────────────────────────────────────

  /**
   * Extract just the motion data from an artwork (for TemplateLoader)
   * Returns array in template format: [{t, j}, ...]
   * @param {string} id
   * @returns {Array|null}
   */
  getMotionData(id) {
    const artwork = this.get(id);
    return artwork ? artwork.motion : null;
  }

  /**
   * Estimate storage usage in bytes
   */
  estimateStorageBytes() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? raw.length * 2 : 0; // UTF-16 ≈ 2 bytes per char
  }

  /**
   * Clear all user artworks (keep seed content)
   */
  clearUserArtworks() {
    for (const [id] of this._artworks) {
      if (!this._seedIds.has(id)) {
        this._artworks.delete(id);
      }
    }
    localStorage.removeItem(STORAGE_KEY);
    console.log('[ArtworkStore] Cleared all user artworks');
  }
}
