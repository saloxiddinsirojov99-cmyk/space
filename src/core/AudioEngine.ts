/**
 * AudioEngine — Real-Time Web Audio API Spatial Sound Synthesizer
 * Barcha tovushlar sof matematik/fizik to'lqinlar orqali sintez qilinadi (0ms yuklanish, yuqori sifat, 0 tashqi dependency).
 */
import { GestureType } from './GestureRecognizer';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private isInitialized: boolean = false;

  // Spatial Panner & Master Filter
  private pannerNode: StereoPannerNode | null = null;
  private masterFilter: BiquadFilterNode | null = null;

  // Active Sound Nodes for Looping Gestures
  private activeAmbientNodes: {
    oscillators: OscillatorNode[];
    gains: GainNode[];
    filters: BiquadFilterNode[];
    cleanup: () => void;
  } | null = null;

  private currentPlayingGesture: GestureType = 'IDLE';
  private lastTriggerTime: number = 0;
  private heartPulseTimer: number | null = null;
  private butterflyFlutterTimer: number | null = null;

  constructor() {
    // Brauzer autoplay siyosati: AudioContext birinchi foydalanuvchi bosishida ochiladi
  }

  /**
   * Foydalanuvchi interaksiyasidan keyin AudioContext ni ishga tushirish
   */
  public async init(): Promise<boolean> {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return true;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        console.warn('[AudioEngine] Web Audio API ushbu brauzerda qo\'llab-quvvatlanmaydi.');
        return false;
      }

      this.ctx = new AudioContextClass();

      // Master Limiter / Gain (clipping va haddan tashqari balandlikdan himoya)
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.7; // Optimal balandlik

      // Spatial Stereo Panner (qo'l chap/o'ng harakatiga moslashadi)
      if (this.ctx.createStereoPanner) {
        this.pannerNode = this.ctx.createStereoPanner();
        this.pannerNode.pan.value = 0;
      }

      // Master Filter (qo'l balandligiga qarab ochiladi/yopiladi)
      this.masterFilter = this.ctx.createBiquadFilter();
      this.masterFilter.type = 'lowpass';
      this.masterFilter.frequency.value = 16000;

      // Audio Graph ulash
      if (this.pannerNode) {
        this.masterGain.connect(this.pannerNode);
        this.pannerNode.connect(this.masterFilter);
        this.masterFilter.connect(this.ctx.destination);
      } else {
        this.masterGain.connect(this.masterFilter);
        this.masterFilter.connect(this.ctx.destination);
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.isInitialized = true;
      console.log('[AudioEngine] ✅ Web Audio API muvaffaqiyatli ishga tushdi.');
      return true;
    } catch (err: any) {
      console.warn('[AudioEngine] AudioContext boshlashda xatolik:', err.message);
      return false;
    }
  }

  /**
   * Ovozni yoqish / o'chirish (Mute / Unmute)
   */
  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(this.isMuted ? 0 : 0.7, now + 0.05);
    }
    return !this.isMuted;
  }

  public isAudioActive(): boolean {
    return !this.isMuted && this.isInitialized && (this.ctx?.state === 'running');
  }

  /**
   * Real-time qo'l holati va tezligiga ko'ra ovozni fazoviy modulyatsiya qilish
   */
  public updateHandDynamics(x: number, y: number, velocity: number, pinchDist: number = 0.1): void {
    if (!this.ctx || !this.isInitialized || this.isMuted) return;

    const now = this.ctx.currentTime;

    // 1. Stereo Panning (qo'l chapda bo'lsa chapga, o'ngda bo'lsa o'ngga)
    if (this.pannerNode) {
      // x: 0..1 oralig'ida bo'ladi, uni -0.85 .. +0.85 ga o'giramiz
      const targetPan = Math.max(-0.85, Math.min(0.85, (x - 0.5) * 1.8));
      this.pannerNode.pan.setTargetAtTime(targetPan, now, 0.05);
    }

    // 2. Master Filter Cutoff (qo'l yuqorida bo'lsa yorqinroq, pastda bo'lsa chuqurroq)
    if (this.masterFilter) {
      const targetFreq = 1200 + (1.0 - y) * 12000;
      this.masterFilter.frequency.setTargetAtTime(targetFreq, now, 0.08);
    }

    // 3. Tez harakatda yengil Whoosh effekti
    if (velocity > 0.04 && Date.now() - this.lastTriggerTime > 350) {
      this.playWhooshSound(Math.min(velocity * 15, 1.0));
      this.lastTriggerTime = Date.now();
    }
  }

  /**
   * Yangi gesture aniqlanganda ovoz transition va sintezini boshlash
   */
  public handleGestureChange(gesture: GestureType): void {
    if (this.currentPlayingGesture === gesture) return;

    this.currentPlayingGesture = gesture;

    // Eski looping ovozdan silliq chiqish (crossfade out)
    this.stopActiveAmbient();

    if (!this.isAudioActive()) return;

    switch (gesture) {
      // 👍 1. LIKE / THUMBS UP: Yorqin, kuchli, yoqimli "cosmic success chime"
      case 'THUMBS_UP':
        this.playThumbsUpSuccessChime();
        break;

      // 🫶 2. HEART HANDS (NARGIZA): Iliq, romantik ambient heart-chime + yurak urishi
      case 'LOVE':
        this.startNargizaHeartAmbient();
        break;

      // 🫶 3. ONE-HAND HALF HEART: Havodor sehrli chime + kapalak qanot qoqishi
      case 'HALF_HEART':
        this.startHalfHeartButterflySound();
        break;

      // ✋ 4. OPEN PALM / STOP: Keng kosmik energy release + spatial swirl
      case 'OPEN_PALMS':
      case 'WAVE':
        this.startGalaxySwirlSound();
        break;

      // ✊ 5. FIST: Chuqur kosmik bass rumble + orbital hum
      case 'FIST':
        this.startCosmicPlanetRumble();
        break;

      // ✌️ 6. PEACE: Yengil, quvnoq uchuvchi kapalak fluttering sound
      case 'PEACE':
        this.startPeaceButterflyFlutter();
        break;

      // 🤏 7. PINCH: Sci-fi gravitational vortex / wormhole suction
      case 'PINCH':
        this.startVortexSuctionSound();
        break;

      // ☝️ 8. POINTING: Aniq, yorqin sci-fi beam / star trail
      case 'ONE_FINGER':
        this.playSciFiBeamLaser();
        break;

      // 🤘 9. ROCK: Pulsar star periodic cosmic pulse
      case 'ROCK':
        this.playPulsarStarPulse();
        break;

      // 🧬 10. CROSSED: Intertwined twin helix harmonic chime
      case 'CROSSED':
        this.playDnaHelixChime();
        break;

      // 👌 11. OK / SATURN: Resonant sci-fi ring pulse
      case 'OK':
        this.playSaturnRingPulse();
        break;

      // ✨ IDLE
      case 'IDLE':
      default:
        // Silliq sukunat
        break;
    }
  }

  // ===========================================================================
  // 🔊 PROCEDURAL SOUND GENERATORS (Web Audio API)
  // ===========================================================================

  /**
   * 👍 THUMBS UP: Yorqin, garmonik "Cosmic Success Chime"
   */
  private playThumbsUpSuccessChime(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Pentatonic garmoniya (E5, G#5, B5, E6, G#6) — yorqin muvaffaqiyat akkordi
    const chordFreqs = [659.25, 830.61, 987.77, 1318.51, 1661.22];

    chordFreqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const filter = this.ctx!.createBiquadFilter();

      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);

      // Shimmer detuning
      osc.detune.setValueAtTime((idx - 2) * 6, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(4500, now);

      const delay = idx * 0.045;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.28 / (idx + 1), now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 1.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(now + delay);
      osc.stop(now + delay + 1.3);
    });

    // Sub-bass thump (kuch bag'ishlash uchun)
    this.playSubBassThump(now, 110, 0.4);
  }

  /**
   * 🫶 LOVE (NARGIZA): Iliq, yoqimli ambient heart-chime + yurak urishi (pulse)
   */
  private startNargizaHeartAmbient(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Warm Ambient Pad (F maj9: F3, A3, C4, E4)
    const padFreqs = [174.61, 220.00, 261.63, 329.63];
    const oscillators: OscillatorNode[] = [];
    const gains: GainNode[] = [];

    padFreqs.forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.8);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(now);
      oscillators.push(osc);
      gains.push(gain);
    });

    // Periodik yurak urishi (soft rhythmic heartbeat pulse ~60 BPM)
    const triggerHeartPulse = () => {
      if (!this.ctx || !this.masterGain || this.currentPlayingGesture !== 'LOVE') return;
      const t = this.ctx.currentTime;

      // Birinchi urish (Lub)
      this.playHeartbeatThud(t, 55, 0.35);
      // Ikkinchi urish (Dub)
      this.playHeartbeatThud(t + 0.28, 48, 0.25);
    };

    triggerHeartPulse();
    this.heartPulseTimer = window.setInterval(triggerHeartPulse, 1100);

    // Sparkle chime for NARGIZA letter appearance
    this.playSparkleChime(now + 0.2);

    this.activeAmbientNodes = {
      oscillators,
      gains,
      filters: [],
      cleanup: () => {
        if (this.heartPulseTimer !== null) {
          window.clearInterval(this.heartPulseTimer);
          this.heartPulseTimer = null;
        }
      }
    };
  }

  /**
   * 🫶 HALF HEART: Havodor, sehrli chime + kapalak flutter whoosh
   */
  private startHalfHeartButterflySound(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Magical Fairy Chime arpeggio
    const chimeNotes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    chimeNotes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);

      const t = now + i * 0.08;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t);
      osc.stop(t + 0.85);
    });

    // Kapalak qanot qoqishi (flutter)
    const flutter = () => {
      if (this.currentPlayingGesture !== 'HALF_HEART') return;
      this.playWingFlapSound(0.2);
    };

    flutter();
    this.butterflyFlutterTimer = window.setInterval(flutter, 300);

    this.activeAmbientNodes = {
      oscillators: [],
      gains: [],
      filters: [],
      cleanup: () => {
        if (this.butterflyFlutterTimer !== null) {
          window.clearInterval(this.butterflyFlutterTimer);
          this.butterflyFlutterTimer = null;
        }
      }
    };
  }

  /**
   * ✋ OPEN PALMS / GALAXY: Keng kosmik stereo swirl
   */
  private startGalaxySwirlSound(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Kosmik Shimmering Drone (D minor: D3, A3, F4)
    const freqs = [146.83, 220.00, 349.23];
    const oscillators: OscillatorNode[] = [];
    const gains: GainNode[] = [];

    freqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      // LFO kabi detune
      osc.detune.setValueAtTime((idx - 1) * 8, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.6);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(now);
      oscillators.push(osc);
      gains.push(gain);
    });

    this.playWhooshSound(0.4);

    this.activeAmbientNodes = {
      oscillators,
      gains,
      filters: [],
      cleanup: () => {}
    };
  }

  /**
   * ✊ FIST: Chuqur kosmik planet rumble & sub-bass
   */
  private startCosmicPlanetRumble(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(42, now); // Chuqur 42 Hz sub-bass

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, now); // Yumshoq va iliq lowpass

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);

    this.activeAmbientNodes = {
      oscillators: [osc],
      gains: [gain],
      filters: [filter],
      cleanup: () => {}
    };
  }

  /**
   * ✌️ PEACE: Qanot qoqayotgan quvnoq kapalak
   */
  private startPeaceButterflyFlutter(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // High sparkling bells
    const bellNotes = [783.99, 987.77, 1174.66, 1567.98];
    bellNotes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      const t = now + idx * 0.06;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t);
      osc.stop(t + 0.65);
    });

    const flutter = () => {
      if (this.currentPlayingGesture !== 'PEACE') return;
      this.playWingFlapSound(0.25);
    };

    flutter();
    this.butterflyFlutterTimer = window.setInterval(flutter, 240);

    this.activeAmbientNodes = {
      oscillators: [],
      gains: [],
      filters: [],
      cleanup: () => {
        if (this.butterflyFlutterTimer !== null) {
          window.clearInterval(this.butterflyFlutterTimer);
          this.butterflyFlutterTimer = null;
        }
      }
    };
  }

  /**
   * 🤏 PINCH: Gravitatsion wormhole / vortex suction
   */
  private startVortexSuctionSound(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    // Suction pitch sweep pastga qarab
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.7);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450, now);
    filter.Q.value = 4.0;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.1);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.7);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);

    this.activeAmbientNodes = {
      oscillators: [osc],
      gains: [gain],
      filters: [filter],
      cleanup: () => {}
    };
  }

  /**
   * ☝️ POINTING: Sci-Fi Star Beam Laser
   */
  private playSciFiBeamLaser(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1450, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.35);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.42);
  }

  /**
   * 🤘 ROCK: Pulsar Star Periodic Cosmic Pulse
   */
  private playPulsarStarPulse(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.25);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.32);
  }

  /**
   * 🧬 CROSSED: DNA Helix Twin Crystal Chime
   */
  private playDnaHelixChime(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    [587.33, 880.00].forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      const t = now + idx * 0.06;
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t);
      osc.stop(t + 0.65);
    });
  }

  /**
   * 👌 OK: Saturn Ring Resonant Pulse
   */
  private playSaturnRingPulse(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(554.37, now + 0.3);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.52);
  }

  // ===========================================================================
  // 🎵 HELPER PROCEDURAL SOUND EFFECTS
  // ===========================================================================

  private playSubBassThump(time: number, freq: number, volume: number): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(35, time + 0.25);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.32);
  }

  private playHeartbeatThud(time: number, freq: number, volume: number): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(28, time + 0.16);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.2);
  }

  private playSparkleChime(time: number): void {
    if (!this.ctx || !this.masterGain) return;
    const freqs = [1046.50, 1318.51, 1567.98, 2093.00];

    freqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time + idx * 0.05);

      const t = time + idx * 0.05;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(t);
      osc.stop(t + 0.55);
    });
  }

  private playWingFlapSound(volume: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playWhooshSound(intensity: number): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(1600, now + 0.08);
    filter.Q.value = 2.0;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(Math.min(0.25 * intensity, 0.3), now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 0.15);
  }

  private stopActiveAmbient(): void {
    if (!this.activeAmbientNodes || !this.ctx) return;

    const now = this.ctx.currentTime;
    this.activeAmbientNodes.cleanup();

    this.activeAmbientNodes.gains.forEach((g) => {
      try {
        g.gain.cancelScheduledValues(now);
        g.gain.linearRampToValueAtTime(0.0001, now + 0.25);
      } catch { /* ignore */ }
    });

    setTimeout(() => {
      this.activeAmbientNodes?.oscillators.forEach((osc) => {
        try { osc.stop(); osc.disconnect(); } catch { /* ignore */ }
      });
      this.activeAmbientNodes = null;
    }, 280);
  }

  public destroy(): void {
    this.stopActiveAmbient();
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
  }
}
