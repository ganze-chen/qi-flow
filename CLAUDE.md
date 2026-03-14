# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Qi-Flow (行气)** is a body-motion-based interactive art application that uses MediaPipe pose detection to create ink-brush artwork. Users follow guided movements with their body, and the system renders Chinese ink-style visuals synchronized with traditional instrument audio feedback based on pose matching quality.

**Core Concept**: "以身运笔，虚实相生" (Body as brush, balance of presence and absence)

## Development Commands

```bash
# Development server (runs on http://localhost:3000)
npm run dev

# Backend AI enhancement server (runs on http://localhost:3001)
npm run server

# Start both frontend and backend together
npm run dev:full

# Production build
npm run build

# Preview production build
npm run preview
```

## AI Co-Creation Feature

The application includes an AI-powered image enhancement feature that transforms exported ink artwork into Wu Guanzhong-style minimalist landscape paintings using Google Gemini 3 Pro Image Preview.

**Architecture:**
- Backend: Express.js server (`server.js`) proxies Gemini API calls
- Frontend: `AIEnhancer.js` module handles client-side integration
- API endpoint: `POST /api/enhance-image`

**Usage:**
1. Start backend: `npm run server` (port 3001)
2. Start frontend: `npm run dev` (port 3000)
3. Complete a practice session
4. Click export → AI enhancement checkbox is enabled by default
5. System automatically enhances the image (10-30 seconds)
6. Save the enhanced artwork

**Configuration:**
- API key is configured in `server.js` line 13
- Enhancement prompt is in `src/core/AIEnhancer.js` line 5
- Default prompt: Wu Guanzhong minimalist style with preserved ink spontaneity

**Error Handling:**
- If backend is unavailable, falls back to original image
- Health check endpoint: `GET /api/health`
- User receives toast notification on failure

## Architecture

### State Machine Flow
```
IDLE → LOADING → CAMERA_READY → CALIBRATING → PRACTICING → COMPLETE
IDLE → GALLERY → VIEWING (artwork playback) → IDLE
IDLE → GALLERY → CODANCE_LOADING → CODANCE → CODANCE_COMPLETE → IDLE
```

### Module Structure

**Core Engine** (`src/core/`):
- `PoseDetector.js` — MediaPipe Tasks Vision integration (33-joint detection)
- `JointMapper.js` — Maps 33 MediaPipe joints → 17 application joints
- `CameraManager.js` — Webcam access and video stream management
- `EnvironmentCalibrator.js` — User position/scale calibration before practice
- `TemplateLoader.js` — Loads pre-recorded motion templates (JSON)
- `TemplatePlayback.js` — Playback controller with lookahead (1.5s) and trail (2s) windows
- `GuideRenderer.js` — Renders golden "wind" guide trails on guide-canvas
- `MatchingEngine.js` — **Joint angle cosine similarity** (not absolute position) with 3-tier thresholds
- `AudioEngine.js` — Web Audio API synthesis (pentatonic scale + ambient sounds)
- `InkRenderer.js` — Base ink rendering (user motion trails)

**Matching Algorithm**:
- Uses 9 joint angle groups (shoulders, elbows, torso, head tilt, wrist direction)
- Computes weighted cosine similarity between user angles and template angles
- **Scale/position invariant** — only pose shape matters
- Thresholds: >0.85 = "丰盈" (rich), 0.6-0.85 = "流动" (flowing), <0.6 = "枯" (sparse)
- EMA smoothing (α=0.15) to prevent jitter

**Theme System** (`src/themes/`):
- 4 themes: SNOW (踏雪留痕), BAMBOO (翠竹风声), BIRD (月下鸟群), STREAM (曲水流觞)
- Each theme defines: visual identity, ink behavior type, audio instrument, guide colors, template data
- Theme-specific ink renderers: `BambooInkRenderer.js`, `BirdInkRenderer.js`, `StreamInkRenderer.js`
- `ThemeRegistry.js` — Central theme configuration
- `ThemeManager.js` — Runtime theme switching

**Social Features** (`src/social/`):
- `ArtworkStore.js` — localStorage + seed content management (~30 artworks, 5MB limit)
- `ArtworkSchema.js` — Artwork data structure + thumbnail generation
- `MotionRecorder.js` — Records user motion data for replay/sharing

**UI Components** (`src/ui/`):
- `SplashCanvas.js` — Landing screen animated background
- `GalleryScreen.js` — Artwork gallery with seed + user works
- `ExportComposer.js` — Video/image export with ink + motion overlay
- `DebugOverlay.js` — Development debug panel (toggle with 'D' key)

**Utilities** (`src/utils/`):
- `EventBus.js` — Global event system for module communication
- `MobileDetect.js` — Mobile/iOS detection + Web Share API helpers

### Canvas Layers (z-index order)
```
debug-canvas  (z:10)  — Skeleton debug visualization
ink-canvas    (z:5)   — User ink trails (persistent accumulation)
guide-canvas  (z:3)   — Golden guide trails (redrawn each frame)
camera-feed   (z:auto)— Webcam video (10% opacity)
```

### Data Files
- `public/data/pose_push1_data-compressed.json` — Template motion data
- `public/data/pose_upperbody1-2_data-compressed.json` — Alternative template
- `public/data/seed/` — Pre-seeded high-quality artworks for gallery

## Key Technical Details

### MediaPipe Integration
- Uses `@mediapipe/tasks-vision` package
- Excluded from Vite optimizeDeps to prevent bundling issues
- 33-joint pose detection → mapped to 17 application joints

### Multi-Page Setup
- `index.html` — Main practice application
- `recorder.html` — Motion recording tool (separate entry point)
- Vite configured with multiple entry points in `rollupOptions`

### Mobile Considerations
- iOS detection for camera permission handling
- Web Share API integration for artwork sharing
- Scroll locking during practice sessions
- Touch-friendly UI elements

### Keyboard Shortcuts (Development)
- `D` — Toggle debug panel
- `S` — Toggle skeleton overlay
- `L` — Toggle joint labels
- `C` — Clear ink canvas
- `R` — Reset session
- `E` — Export artwork
- `Space` — Pause/resume playback

## Important Patterns

### Event-Driven Architecture
All modules communicate via `EventBus` (src/utils/EventBus.js). Key events:
- `POSE_DETECTED` — New pose data available
- `TEMPLATE_FRAME` — Template playback frame update
- `MATCH_SCORE` — Matching score computed
- `CALIBRATION_COMPLETE` — User calibration finished
- `PRACTICE_COMPLETE` — Session ended

### Calibration System
Before practice, `EnvironmentCalibrator` establishes:
- User center point (shoulder midpoint)
- Scale factor (shoulder width)
- All subsequent coordinates normalized to this baseline
- Ensures matching works regardless of distance from camera

### Theme Extensibility
To add a new theme:
1. Define theme config in `ThemeRegistry.js`
2. Create theme-specific ink renderer (if needed) in `src/themes/<theme-name>/`
3. Add template data file to `public/data/`
4. Update `ThemeManager.js` to handle new theme initialization

### Artwork Storage Schema
Each artwork contains:
- `id` — Unique identifier
- `timestamp` — Creation time
- `themeId` — Theme used
- `motion` — Full motion data (compatible with TemplateLoader)
- `thumbnail` — Base64 image preview
- `metadata` — Duration, frame count, etc.

## Development Notes

- **No test suite currently** — manual testing via dev server
- **HTTPS not required** — camera access works on localhost HTTP
- **Browser compatibility** — Requires WebRTC + Web Audio API support
- **Performance target** — 30fps pose detection + rendering on modern devices
- **Storage limits** — localStorage ~5MB, plan for ~30 user artworks max

## PRD References

Code comments frequently reference PRD sections (e.g., "PRD §4", "PRD 5.3"). These refer to the original product requirements document that guided development. Key PRD principles:
- Themes are not skins but distinct artistic moods
- Matching uses pose shape, not absolute position
- Audio feedback is the primary quality indicator
- Gallery includes both seed content and user creations
