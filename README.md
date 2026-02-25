# 行气 Qi-Flow · Week 1 Day 3-5 Build

> 以身运笔，虚实相生

## Day 3-5 新增功能

### Day 3 — 模板回放引擎 + 引导墨迹
- **TemplatePlayback.js** — 播放控制器：时间同步、前瞻窗口(1.5s)、尾迹(2s)、暂停/继续
- **GuideRenderer.js** — "风"引导墨迹渲染：金色半透明轨迹、当前帧+前瞻+尾迹三层

### Day 4 — 匹配引擎
- **MatchingEngine.js** — 关节角度余弦相似度（非绝对坐标）
  - 9组角度定义（肩、肘、躯干、头部倾斜、腕向）
  - 三级阈值：丰盈(>0.85) / 流动(0.6-0.85) / 枯(<0.6)

### Day 5 — 音效系统 + 双层画布整合
- **AudioEngine.js** — Web Audio API 古琴五声音阶 + 风雪环境音
- **双层画布**：引导层(guide-canvas) + 用户墨迹层(ink-canvas) 独立渲染
- **完成界面**：习练结束 → 保存/再来一次

## 快速开始

```bash
npm install
npm run dev
# → http://localhost:3000
```

## 体验流程

1. 点击"开始习练" → 允许摄像头 → 环境校准
2. 金色轨迹流动 = "风" → 用身体追随
3. 匹配越好 → 古琴声越丰富（音乐就是反馈）
4. 36.7秒完成 → 导出/重来

## 快捷键

| 键 | 功能 |
|---|---|
| `D` | 调试面板 | `S` | 骨骼 | `L` | 标签 |
| `C` | 清墨 | `R` | 重置 | `E` | 导出 | `Space` | 暂停 |

## 架构

```
src/core/
├── PoseDetector.js         # MediaPipe Tasks Vision
├── JointMapper.js          # 33→17 关节映射
├── CameraManager.js        # 摄像头
├── EnvironmentCalibrator.js# 环境校准
├── TemplateLoader.js       # JSON模板
├── TemplatePlayback.js     # ★ 回放引擎 (Day 3)
├── GuideRenderer.js        # ★ 引导渲染 (Day 3)
├── MatchingEngine.js       # ★ 匹配引擎 (Day 4)
├── AudioEngine.js          # ★ 音效系统 (Day 5)
└── InkRenderer.js          # 用户墨点
```

## 画布层次

```
debug-canvas (z:10)  — 骨骼调试
ink-canvas   (z:5)   — 用户墨迹（永久叠加）
guide-canvas (z:3)   — 引导轨迹（每帧重绘）
camera-feed  (z:auto)— 摄像头10%透明
```

## 匹配算法

```
用户9组关节角度 ─→ [cos(θ),sin(θ)] × weight ─→ 加权余弦相似度
模板9组关节角度 ─→ [cos(θ),sin(θ)] × weight ─↗
→ EMA(α=0.15) → smoothScore → Level → 音效
```
