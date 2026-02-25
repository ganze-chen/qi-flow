/**
 * AudioEngine — 主题化音效系统
 *
 * Supports multiple instrument types via theme configuration:
 *   - guqin:      古琴 pluck (踏雪留痕)
 *   - shakuhachi: 尺八 breath tone (翠竹风声)
 *
 * Ambient types:
 *   - wind-snow:    风雪声 (bandpass wind + highpass ice sparkle)
 *   - bamboo-wind:  竹林风声 (rustling + occasional whistle harmonics)
 *
 * PRD 3.3: 音乐本身就是反馈。动作越流畅、越贴合，音乐越丰富。
 */

const DEFAULT_SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];

export class AudioEngine {
  /** @type {AudioContext|null} */
  ctx = null;
  isActive = false;
  _initialized = false;

  _masterGain = null;
  _ambientGain = null;
  _instrumentGain = null;
  _ambientSource = null;
  _ambientLfo = null;
  _ambientExtras = [];  // additional oscillators to clean up

  _lastTriggerTime = 0;
  _triggerCooldown = 400;
  _noteIndex = 0;

  _richInterval = null;
  _flowingInterval = null;

  // Theme config
  _instrumentType = 'guqin';
  _ambientType = 'wind-snow';
  _scale = [...DEFAULT_SCALE];

  config = {
    masterVolume: 0.6,
    ambientVolume: 0.08,
    instrumentVolume: 0.35,
    richTriggerMs: 1200,
    flowingTriggerMs: 2500,
  };

  /**
   * Configure from theme audio settings
   */
  configure(audioConfig) {
    if (!audioConfig) return;

    this._instrumentType = audioConfig.type || 'guqin';
    this._ambientType = audioConfig.ambientType || 'wind-snow';
    this._scale = audioConfig.scale || [...DEFAULT_SCALE];

    if (audioConfig.ambientVolume != null) this.config.ambientVolume = audioConfig.ambientVolume;
    if (audioConfig.instrumentVolume != null) this.config.instrumentVolume = audioConfig.instrumentVolume;

    if (this._instrumentGain) {
      this._instrumentGain.gain.value = this.config.instrumentVolume;
    }

    const cooldowns = { guqin: 400, shakuhachi: 600, birdsong: 300, water: 500 };
    this._triggerCooldown = cooldowns[this._instrumentType] || 400;

    console.log(`[AudioEngine] Configured: instrument=${this._instrumentType}, ambient=${this._ambientType}`);
  }

  async init() {
    if (this._initialized) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();

      this._masterGain = this.ctx.createGain();
      this._masterGain.gain.value = this.config.masterVolume;
      this._masterGain.connect(this.ctx.destination);

      this._ambientGain = this.ctx.createGain();
      this._ambientGain.gain.value = 0;
      this._ambientGain.connect(this._masterGain);

      this._instrumentGain = this.ctx.createGain();
      this._instrumentGain.gain.value = this.config.instrumentVolume;
      this._instrumentGain.connect(this._masterGain);

      this._initialized = true;
      console.log('[AudioEngine] Initialized');
      return true;
    } catch (err) {
      console.error('[AudioEngine] Init failed:', err);
      return false;
    }
  }

  activate() {
    if (!this._initialized || this.isActive) return;
    this.isActive = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this._startAmbient();
    this._ambientGain.gain.linearRampToValueAtTime(
      this.config.ambientVolume, this.ctx.currentTime + 2.0
    );
  }

  deactivate() {
    this.isActive = false;
    this._stopAutoTrigger();

    if (this._ambientGain && this.ctx) {
      this._ambientGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.0);
    }

    setTimeout(() => {
      try { this._ambientSource?.stop(); } catch {}
      this._ambientSource = null;
      try { this._ambientLfo?.stop(); } catch {}
      this._ambientLfo = null;
      for (const n of this._ambientExtras) { try { n.stop(); } catch {} }
      this._ambientExtras = [];
    }, 1200);
  }

  onMatchUpdate(level, levelChanged, score) {
    if (!this.isActive) return;
    if (levelChanged) this._onLevelChange(level);
  }

  pluck(intensity = 0.5) { this._triggerInstrument(intensity); }

  setVolume(vol) {
    this.config.masterVolume = vol;
    if (this._masterGain) {
      this._masterGain.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.1);
    }
  }

  destroy() {
    this._stopAutoTrigger();
    if (this.ctx) { this.ctx.close(); this.ctx = null; }
    this._initialized = false;
    this.isActive = false;
  }

  // ─── Match Level ─────────────────────────────────────────

  _onLevelChange(level) {
    this._stopAutoTrigger();
    switch (level) {
      case 'rich':
        this._triggerInstrument(0.8);
        this._richInterval = setInterval(() => {
          if (this.isActive) this._triggerInstrument(0.5 + Math.random() * 0.3);
        }, this.config.richTriggerMs);
        this._ambientGain.gain.linearRampToValueAtTime(
          this.config.ambientVolume * 1.5, this.ctx.currentTime + 0.5);
        break;
      case 'flowing':
        this._triggerInstrument(0.4);
        this._flowingInterval = setInterval(() => {
          if (this.isActive) this._triggerInstrument(0.25 + Math.random() * 0.2);
        }, this.config.flowingTriggerMs);
        this._ambientGain.gain.linearRampToValueAtTime(
          this.config.ambientVolume, this.ctx.currentTime + 0.5);
        break;
      case 'sparse':
        this._ambientGain.gain.linearRampToValueAtTime(
          this.config.ambientVolume * 0.6, this.ctx.currentTime + 1.0);
        break;
    }
  }

  _stopAutoTrigger() {
    if (this._richInterval) { clearInterval(this._richInterval); this._richInterval = null; }
    if (this._flowingInterval) { clearInterval(this._flowingInterval); this._flowingInterval = null; }
  }

  // ─── Instrument Dispatch ─────────────────────────────────

  _triggerInstrument(intensity) {
    if (!this._initialized || !this.isActive) return;
    const now = performance.now();
    if (now - this._lastTriggerTime < this._triggerCooldown) return;
    this._lastTriggerTime = now;

    const freq = this._scale[this._noteIndex % this._scale.length];
    this._noteIndex++;

    if (this._instrumentType === 'shakuhachi') {
      this._synthShakuhachi(freq, intensity);
    } else if (this._instrumentType === 'birdsong') {
      this._synthBirdsong(freq, intensity);
    } else if (this._instrumentType === 'water') {
      this._synthWaterDrop(freq, intensity);
    } else {
      this._synthGuqin(freq, intensity);
    }
  }

  // ─── Guqin 古琴 ─────────────────────────────────────────

  _synthGuqin(freq, intensity) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = intensity * 0.3;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.98, t + 1.5);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, t);
    osc2.frequency.exponentialRampToValueAtTime(freq * 1.98, t + 0.8);

    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq * 3, t);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + 0.005);
    env.gain.exponentialRampToValueAtTime(vol * 0.3, t + 0.3);
    env.gain.exponentialRampToValueAtTime(0.001, t + 2.5);

    const env2 = ctx.createGain();
    env2.gain.setValueAtTime(0, t);
    env2.gain.linearRampToValueAtTime(vol * 0.15, t + 0.003);
    env2.gain.exponentialRampToValueAtTime(0.001, t + 1.0);

    const env3 = ctx.createGain();
    env3.gain.setValueAtTime(0, t);
    env3.gain.linearRampToValueAtTime(vol * 0.05, t + 0.002);
    env3.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, t);
    filter.frequency.exponentialRampToValueAtTime(800, t + 1.5);
    filter.Q.value = 1.0;

    osc.connect(env); osc2.connect(env2); osc3.connect(env3);
    env.connect(filter); env2.connect(filter); env3.connect(filter);
    filter.connect(this._instrumentGain);

    osc.start(t); osc2.start(t); osc3.start(t);
    osc.stop(t + 3); osc2.stop(t + 1.5); osc3.stop(t + 0.8);
  }

  // ─── Shakuhachi 尺八 ────────────────────────────────────

  _synthShakuhachi(freq, intensity) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = intensity * 0.25;

    // 1. Breath noise burst at attack
    const noiseLen = 0.15;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * 0.4;

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const noiseFilt = ctx.createBiquadFilter();
    noiseFilt.type = 'bandpass';
    noiseFilt.frequency.value = freq * 2;
    noiseFilt.Q.value = 2;

    const noiseEnv = ctx.createGain();
    noiseEnv.gain.setValueAtTime(0, t);
    noiseEnv.gain.linearRampToValueAtTime(vol * 0.6, t + 0.03);
    noiseEnv.gain.exponentialRampToValueAtTime(0.001, t + noiseLen);

    noiseSrc.connect(noiseFilt);
    noiseFilt.connect(noiseEnv);
    noiseEnv.connect(this._instrumentGain);
    noiseSrc.start(t);

    // 2. Fundamental (triangle = hollow bamboo)
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);

    // Vibrato
    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 5;
    const vibG = ctx.createGain();
    vibG.gain.value = freq * 0.015;
    vib.connect(vibG);
    vibG.connect(osc.frequency);
    vib.start(t + 0.2);

    // 3. Overblown 2nd harmonic
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, t);

    // Breath envelope: slow attack, sustain, gentle decay
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + 0.08);
    env.gain.setValueAtTime(vol, t + 0.08);
    env.gain.linearRampToValueAtTime(vol * 0.7, t + 0.5);
    env.gain.exponentialRampToValueAtTime(0.001, t + 3.0);

    const env2 = ctx.createGain();
    env2.gain.setValueAtTime(0, t);
    env2.gain.linearRampToValueAtTime(vol * 0.12, t + 0.12);
    env2.gain.exponentialRampToValueAtTime(0.001, t + 2.0);

    // Hollow bamboo resonance
    const res = ctx.createBiquadFilter();
    res.type = 'bandpass';
    res.frequency.value = freq * 1.5;
    res.Q.value = 2.5;

    osc.connect(env); osc2.connect(env2);
    env.connect(res); env2.connect(res);
    res.connect(this._instrumentGain);

    osc.start(t); osc2.start(t);
    osc.stop(t + 3.5); osc2.stop(t + 2.5); vib.stop(t + 3.5);
  }

  // ─── Birdsong 鸟鸣 ─────────────────────────────────────

  /**
   * Birdsong: short, high-pitched chirp with rapid frequency sweep
   * Character: sine → fast upward glissando → quick decay
   * Multiple chirps with slight delay create naturalistic call
   */
  _synthBirdsong(freq, intensity) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = intensity * 0.18;

    // Number of chirps in this call (1-3)
    const chirpCount = 1 + Math.floor(Math.random() * 2.5);

    for (let c = 0; c < chirpCount; c++) {
      const offset = c * (0.08 + Math.random() * 0.06);
      const chirpFreq = freq * (1 + Math.random() * 0.3);

      // Upward frequency sweep
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(chirpFreq, t + offset);
      osc.frequency.exponentialRampToValueAtTime(
        chirpFreq * (1.3 + Math.random() * 0.5), t + offset + 0.06
      );
      osc.frequency.exponentialRampToValueAtTime(
        chirpFreq * 0.9, t + offset + 0.15
      );

      // Very short envelope
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t + offset);
      env.gain.linearRampToValueAtTime(vol, t + offset + 0.008);
      env.gain.exponentialRampToValueAtTime(vol * 0.5, t + offset + 0.04);
      env.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.2);

      // Slight 2nd harmonic for richness
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(chirpFreq * 2, t + offset);
      osc2.frequency.exponentialRampToValueAtTime(
        chirpFreq * 2.5, t + offset + 0.06
      );

      const env2 = ctx.createGain();
      env2.gain.setValueAtTime(0, t + offset);
      env2.gain.linearRampToValueAtTime(vol * 0.08, t + offset + 0.005);
      env2.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.12);

      // Highpass to keep chirps airy
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 800;

      osc.connect(env); osc2.connect(env2);
      env.connect(hp); env2.connect(hp);
      hp.connect(this._instrumentGain);

      osc.start(t + offset); osc2.start(t + offset);
      osc.stop(t + offset + 0.3); osc2.stop(t + offset + 0.2);
    }
  }

  // ─── Water Drop 水滴 ───────────────────────────────────

  /**
   * Water drop: resonant sine with fast pitch drop
   * Character: initial high ping → rapid descent → ring out
   * Simulates stone dropped in stream or water drip on surface
   */
  _synthWaterDrop(freq, intensity) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = intensity * 0.22;

    // Primary drop tone — fast pitch descent
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const startFreq = freq * 1.8;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, t + 0.4);

    // Envelope: sharp ping, medium decay
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + 0.003);
    env.gain.exponentialRampToValueAtTime(vol * 0.4, t + 0.08);
    env.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

    // Resonant ripple — slightly detuned secondary
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 1.02, t + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.3);

    const env2 = ctx.createGain();
    env2.gain.setValueAtTime(0, t + 0.05);
    env2.gain.linearRampToValueAtTime(vol * 0.15, t + 0.06);
    env2.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

    // Bandpass for watery resonance
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 4;

    osc.connect(env); osc2.connect(env2);
    env.connect(bp); env2.connect(bp);
    bp.connect(this._instrumentGain);

    osc.start(t); osc2.start(t + 0.05);
    osc.stop(t + 1.5); osc2.stop(t + 1.0);
  }

  // ─── Ambient Dispatch ────────────────────────────────────

  _startAmbient() {
    if (this._ambientSource) return;
    switch (this._ambientType) {
      case 'bamboo-wind': this._startBambooWind(); break;
      case 'night-insects': this._startNightInsects(); break;
      case 'stream': this._startStreamAmbient(); break;
      default: this._startWindSnow(); break;
    }
  }

  _startWindSnow() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;

    this._ambientSource = ctx.createBufferSource();
    this._ambientSource.buffer = buf;
    this._ambientSource.loop = true;

    const wind = ctx.createBiquadFilter();
    wind.type = 'bandpass'; wind.frequency.value = 400; wind.Q.value = 0.3;

    const ice = ctx.createBiquadFilter();
    ice.type = 'highpass'; ice.frequency.value = 3000;
    const iceG = ctx.createGain(); iceG.gain.value = 0.02;

    this._ambientSource.connect(wind); wind.connect(this._ambientGain);
    this._ambientSource.connect(ice); ice.connect(iceG); iceG.connect(this._ambientGain);

    this._ambientLfo = ctx.createOscillator();
    this._ambientLfo.type = 'sine'; this._ambientLfo.frequency.value = 0.1;
    const lg = ctx.createGain(); lg.gain.value = 200;
    this._ambientLfo.connect(lg); lg.connect(wind.frequency);
    this._ambientLfo.start();
    this._ambientSource.start();
  }

  _startBambooWind() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;

    this._ambientSource = ctx.createBufferSource();
    this._ambientSource.buffer = buf;
    this._ambientSource.loop = true;

    // Bamboo rustling: higher frequency band
    const rustle = ctx.createBiquadFilter();
    rustle.type = 'bandpass'; rustle.frequency.value = 800; rustle.Q.value = 0.5;

    // Subtle whistle (wind through bamboo hollow)
    const whistle = ctx.createOscillator();
    whistle.type = 'sine'; whistle.frequency.value = 1200;
    const whistleG = ctx.createGain(); whistleG.gain.value = 0.008;

    const wLfo = ctx.createOscillator();
    wLfo.type = 'sine'; wLfo.frequency.value = 0.15;
    const wLfoG = ctx.createGain(); wLfoG.gain.value = 0.008;
    wLfo.connect(wLfoG); wLfoG.connect(whistleG.gain);

    this._ambientSource.connect(rustle); rustle.connect(this._ambientGain);
    whistle.connect(whistleG); whistleG.connect(this._ambientGain);

    this._ambientLfo = ctx.createOscillator();
    this._ambientLfo.type = 'sine'; this._ambientLfo.frequency.value = 0.08;
    const lg = ctx.createGain(); lg.gain.value = 300;
    this._ambientLfo.connect(lg); lg.connect(rustle.frequency);

    this._ambientLfo.start();
    whistle.start(); wLfo.start();
    this._ambientExtras.push(whistle, wLfo);
    this._ambientSource.start();
  }

  /**
   * Night insects ambient: cricket-like chirps + low hum
   * Character: rhythmic high-frequency pulses with slow modulation
   */
  _startNightInsects() {
    const ctx = this.ctx;

    // Base: very quiet filtered noise for dark atmosphere
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.3;

    this._ambientSource = ctx.createBufferSource();
    this._ambientSource.buffer = buf;
    this._ambientSource.loop = true;

    // Dark low-frequency hum
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.value = 200;
    lowFilter.Q.value = 0.5;

    const lowGain = ctx.createGain();
    lowGain.gain.value = 0.4;

    this._ambientSource.connect(lowFilter);
    lowFilter.connect(lowGain);
    lowGain.connect(this._ambientGain);

    // Cricket oscillator 1 — fast amplitude-modulated high tone
    const cricket1 = ctx.createOscillator();
    cricket1.type = 'sine';
    cricket1.frequency.value = 4200;

    const cricketAM = ctx.createOscillator();
    cricketAM.type = 'square';
    cricketAM.frequency.value = 38;  // Rapid pulse

    const cricketAMGain = ctx.createGain();
    cricketAMGain.gain.value = 0.003;

    const cricketEnv = ctx.createGain();
    cricketEnv.gain.value = 0;

    // Slow on/off cycle for cricket (chirp groups)
    const cricketOnOff = ctx.createOscillator();
    cricketOnOff.type = 'sine';
    cricketOnOff.frequency.value = 0.4; // Chirps ~every 2.5 seconds
    const cricketOnOffGain = ctx.createGain();
    cricketOnOffGain.gain.value = 0.003;

    cricketAM.connect(cricketAMGain);
    cricketAMGain.connect(cricketEnv.gain);
    cricketOnOff.connect(cricketOnOffGain);
    cricketOnOffGain.connect(cricketEnv.gain);
    cricket1.connect(cricketEnv);
    cricketEnv.connect(this._ambientGain);

    // Cricket 2 — slightly different frequency and rhythm
    const cricket2 = ctx.createOscillator();
    cricket2.type = 'sine';
    cricket2.frequency.value = 3800;

    const c2AM = ctx.createOscillator();
    c2AM.type = 'square';
    c2AM.frequency.value = 42;

    const c2AMGain = ctx.createGain();
    c2AMGain.gain.value = 0.002;

    const c2Env = ctx.createGain();
    c2Env.gain.value = 0;

    const c2OnOff = ctx.createOscillator();
    c2OnOff.type = 'sine';
    c2OnOff.frequency.value = 0.3;
    const c2OnOffGain = ctx.createGain();
    c2OnOffGain.gain.value = 0.002;

    c2AM.connect(c2AMGain);
    c2AMGain.connect(c2Env.gain);
    c2OnOff.connect(c2OnOffGain);
    c2OnOffGain.connect(c2Env.gain);
    cricket2.connect(c2Env);
    c2Env.connect(this._ambientGain);

    // LFO for atmosphere breathing
    this._ambientLfo = ctx.createOscillator();
    this._ambientLfo.type = 'sine';
    this._ambientLfo.frequency.value = 0.05;
    const lg = ctx.createGain(); lg.gain.value = 80;
    this._ambientLfo.connect(lg);
    lg.connect(lowFilter.frequency);

    this._ambientLfo.start();
    cricket1.start(); cricketAM.start(); cricketOnOff.start();
    cricket2.start(); c2AM.start(); c2OnOff.start();
    this._ambientSource.start();

    this._ambientExtras.push(
      cricket1, cricketAM, cricketOnOff,
      cricket2, c2AM, c2OnOff
    );
  }

  /**
   * Stream ambient: flowing water with variable texture
   * Character: filtered noise bands simulating water at different speeds
   * plus occasional resonant drip tones
   */
  _startStreamAmbient() {
    const ctx = this.ctx;

    // Base: longer noise buffer for water texture
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;

    this._ambientSource = ctx.createBufferSource();
    this._ambientSource.buffer = buf;
    this._ambientSource.loop = true;

    // Low flow: deep water rumble
    const lowFlow = ctx.createBiquadFilter();
    lowFlow.type = 'bandpass';
    lowFlow.frequency.value = 250;
    lowFlow.Q.value = 0.4;

    const lowGain = ctx.createGain();
    lowGain.gain.value = 0.6;

    // Mid flow: main water body
    const midFlow = ctx.createBiquadFilter();
    midFlow.type = 'bandpass';
    midFlow.frequency.value = 800;
    midFlow.Q.value = 0.6;

    const midGain = ctx.createGain();
    midGain.gain.value = 0.4;

    // High sparkle: surface glitter
    const highFlow = ctx.createBiquadFilter();
    highFlow.type = 'highpass';
    highFlow.frequency.value = 4000;

    const highGain = ctx.createGain();
    highGain.gain.value = 0.04;

    // Connect all water layers
    this._ambientSource.connect(lowFlow);
    lowFlow.connect(lowGain);
    lowGain.connect(this._ambientGain);

    this._ambientSource.connect(midFlow);
    midFlow.connect(midGain);
    midGain.connect(this._ambientGain);

    this._ambientSource.connect(highFlow);
    highFlow.connect(highGain);
    highGain.connect(this._ambientGain);

    // Slow modulation — water flow variation
    this._ambientLfo = ctx.createOscillator();
    this._ambientLfo.type = 'sine';
    this._ambientLfo.frequency.value = 0.12;
    const lg = ctx.createGain(); lg.gain.value = 200;
    this._ambientLfo.connect(lg);
    lg.connect(midFlow.frequency);

    // Second LFO for sparkle variation
    const lfo2 = ctx.createOscillator();
    lfo2.type = 'sine';
    lfo2.frequency.value = 0.07;
    const lg2 = ctx.createGain(); lg2.gain.value = 0.02;
    lfo2.connect(lg2);
    lg2.connect(highGain.gain);

    this._ambientLfo.start();
    lfo2.start();
    this._ambientSource.start();
    this._ambientExtras.push(lfo2);
  }
}
