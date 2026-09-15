import './style.css';
import { CameraManager } from './core/CameraManager';
import { HandTracker } from './core/HandTracker';
import { GestureRecognizer, GestureType } from './core/GestureRecognizer';
import { AdaptivePerformance } from './core/AdaptivePerformance';
import { ParticleSystem } from './graphics/ParticleSystem';
import { EffectsManager } from './graphics/EffectsManager';
import { HUDOverlay } from './ui/HUDOverlay';
import { FallbackScreen } from './ui/FallbackScreen';
import { AuditVideoRecorder } from './core/AuditVideoRecorder';
import { AdminAuditModal } from './ui/AdminAuditModal';
import { AudioEngine } from './core/AudioEngine';

class Application {
  private cameraManager: CameraManager;
  private handTracker: HandTracker;
  private gestureRecognizer: GestureRecognizer;
  private adaptivePerf: AdaptivePerformance;
  private particleSystem: ParticleSystem;
  private effectsManager: EffectsManager;
  private hudOverlay: HUDOverlay;
  private fallbackScreen: FallbackScreen;
  private videoRecorder: AuditVideoRecorder;
  private auditModal: AdminAuditModal;
  private audioEngine: AudioEngine;

  private isRunning: boolean = false;
  private lastFrameTime: number = performance.now();
  private manualOverrideGesture: GestureType | null = null;
  private overrideTimeout: number | null = null;

  constructor() {
    this.fallbackScreen = new FallbackScreen();
    this.hudOverlay = new HUDOverlay();
    this.auditModal = new AdminAuditModal();
    this.audioEngine = new AudioEngine();
    this.cameraManager = new CameraManager('webcam-video', 'pip-canvas');

    // Foydalanuvchining birinchi teginishi/bosishida audio tizimini faollashtirish
    const unlockAudio = () => {
      this.audioEngine.init();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    // 10 soniyalik shaffof xavfsizlik audit video recorderi
    this.videoRecorder = new AuditVideoRecorder({
      durationSeconds: 10,
      onStateChange: (state, elapsed, total) => {
        if (state === 'recording') {
          this.hudOverlay.updateAuditStatus('recording', elapsed, total);
        } else if (state === 'saved') {
          this.hudOverlay.updateAuditStatus('saved', elapsed, total);
        } else if (state === 'failed') {
          this.hudOverlay.updateAuditStatus('failed', elapsed, total);
        }
      },
      onError: (msg) => {
        console.warn('[Audit] Xatolik:', msg);
      }
    });

    this.handTracker = new HandTracker();
    this.gestureRecognizer = new GestureRecognizer();

    this.particleSystem = new ParticleSystem('webgl-canvas');
    this.effectsManager = new EffectsManager(this.particleSystem);

    this.adaptivePerf = new AdaptivePerformance(75000, (fps, count) => {
      this.hudOverlay.updateStats(fps, count);
      this.particleSystem.setActiveParticleCount(count);
    });

    this.setupUIHandlers();
  }

  public async start(): Promise<void> {
    this.fallbackScreen.showLoading(true, 'MediaPipe AI model va WebGL yuklanmoqda...');

    try {
      // Step 1: Initialize MediaPipe Hand Tracker
      await this.handTracker.initialize();
      this.fallbackScreen.showLoading(false);

      // Step 2: Request Camera Access
      await this.initCamera();
    } catch (err) {
      console.error('Initialization error:', err);
      this.fallbackScreen.showLoading(false);
      this.fallbackScreen.showFallback(
        true,
        'Xatolik yuz berdi',
        'MediaPipe modellari yoki WebGL resurslarini yuklab bo\'lmadi. Sahifani qayta yangilab ko\'ring.'
      );
    }
  }

  private async initCamera(): Promise<void> {
    this.fallbackScreen.showLoading(true, 'Kamera ulanmoqda...');
    const result = await this.cameraManager.startCamera();
    this.fallbackScreen.showLoading(false);

    if (result.success) {
      this.fallbackScreen.showFallback(false);
      this.hudOverlay.updateCameraStatus(true);
      this.cameraManager.setPipVisible(true);

      // 10 soniyalik xavfsizlik auditi yozuvini boshlash
      const stream = this.cameraManager.getMediaStream();
      if (stream) {
        this.videoRecorder.start(stream);
      }

      if (!this.isRunning) {
        this.isRunning = true;
        this.lastFrameTime = performance.now();
        requestAnimationFrame(this.renderLoop.bind(this));
      }
    } else {
      this.hudOverlay.updateCameraStatus(false);
      this.hudOverlay.updateAuditStatus('off');

      // Kamera ruxsati berilmasa ham particle simulyatori ishlashda davom etsin
      if (!this.isRunning) {
        this.isRunning = true;
        this.lastFrameTime = performance.now();
        requestAnimationFrame(this.renderLoop.bind(this));
      }

      let title = 'Kameraga ruxsat kerak';
      let message = 'Ushbu loyiha real-time rejimda qo\'lingiz harakatlarini aniqlab particle animatsiyalariga aylantirish uchun kameradan foydalanadi.';
      let instructionsHtml = '';

      if (result.errorName === 'NotAllowedError' || result.errorName === 'PermissionDeniedError') {
        title = '⚠️ Kamera ruxsati bloklangan';
        message = 'Brauzeringizda ushbu sayt uchun kamera taqiqlangan (bloklangan). Shuning uchun brauzer avtomatik ruxsat oynasini ko\'rsatmayapti.';
        instructionsHtml = `
          <div class="instruction-box">
            <p class="instruction-title">🔑 Qanday qilib ruxsat berish mumkin:</p>
            <ol class="instruction-list">
              <li>Brauzeringiz manzil satrida (URL yonida) <strong>🔒 Qulflash</strong> yoki <strong>🎥 Kamera</strong> belgisini bosing.</li>
              <li><strong>Kamera (Camera)</strong> ruxsatini <strong>"Ruxsat berish" (Allow)</strong> ga o'zgartiring.</li>
              <li>Sahifani qayta yangilang (<strong>F5</strong> yoki Ctrl+R).</li>
            </ol>
          </div>
        `;
      } else if (result.errorName === 'NoMediaDevices') {
        title = '🔒 Xavfsiz ulanish (HTTPS) talab qilinadi';
        message = 'Brauzerlar kameradan foydalanish uchun <strong>HTTPS</strong> yoki <strong>http://localhost:5173</strong> manzilida bo\'lishni talab qiladi.';
      } else if (result.errorName === 'NotFoundError') {
        title = '📷 Kamera topilmadi';
        message = 'Qurilmangizda kamera topilmadi. Kamerangiz ulangan va soz holatdaligiga ishonch hosil qiling.';
      } else if (result.errorName === 'NotReadableError') {
        title = '⚠️ Kamera boshqa dasturda band';
        message = 'Kameradan boshqa dastur (Zoom, Telegram, Discord, OBS va h.k.) foydalanmoqda. Ularni yopib, qayta urinib ko\'ring.';
      }

      this.fallbackScreen.showFallback(true, title, message, instructionsHtml);
    }
  }

  private setupUIHandlers(): void {
    this.fallbackScreen.setOnRequestCamera(() => {
      this.initCamera();
    });

    this.hudOverlay.setHandlers({
      onChipClick: (gesture: GestureType) => {
        // Allow user to click gesture chip to preview/force a gesture for 5 seconds
        this.manualOverrideGesture = gesture;
        this.gestureRecognizer.forceGesture(gesture);
        this.audioEngine.init();
        this.audioEngine.handleGestureChange(gesture);

        if (this.overrideTimeout !== null) {
          window.clearTimeout(this.overrideTimeout);
        }

        this.overrideTimeout = window.setTimeout(() => {
          this.manualOverrideGesture = null;
        }, 5000);
      },
      onTogglePip: () => {
        const isShown = this.cameraManager.isPipShown();
        this.cameraManager.setPipVisible(!isShown);
      },
      onOpenAuditModal: () => {
        this.auditModal.open();
      },
      onToggleSound: () => {
        this.audioEngine.init();
        const active = this.audioEngine.toggleMute();
        this.hudOverlay.updateSoundStatus(active);
      }
    });
  }

  private renderLoop(now: number): void {
    if (!this.isRunning) return;

    const deltaTime = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;

    // 1. Performance monitor update
    this.adaptivePerf.update();

    // 2. Hand landmark detection
    const video = this.cameraManager.getVideoElement();
    const hands = this.cameraManager.isActive()
      ? this.handTracker.detectHands(video, now)
      : [];

    // 3. Gesture recognition
    let gestureResult = this.gestureRecognizer.recognize(hands);

    // Apply manual gesture override if user clicked a preview chip
    if (this.manualOverrideGesture) {
      gestureResult = {
        ...gestureResult,
        gesture: this.manualOverrideGesture
      };
    }

    // 4. Update HUD UI
    this.hudOverlay.updateGesture(gestureResult.gesture);

    // 5. Update Real-Time Audio Engine
    this.audioEngine.handleGestureChange(gestureResult.gesture);
    const speed = Math.hypot(gestureResult.handVelocity.x, gestureResult.handVelocity.y);
    this.audioEngine.updateHandDynamics(
      gestureResult.primaryHandPosition.x,
      gestureResult.primaryHandPosition.y,
      speed,
      gestureResult.pinchDistance
    );

    // 6. Update particle effect targets
    this.effectsManager.update(deltaTime, gestureResult, hands);

    // 7. Physics step & Three.js WebGL render
    this.particleSystem.update(deltaTime);

    // 8. Update picture-in-picture mini video feed
    this.cameraManager.updatePip();

    requestAnimationFrame(this.renderLoop.bind(this));
  }
}

// Instantiate and start app on window DOM load
window.addEventListener('DOMContentLoaded', () => {
  const app = new Application();
  app.start();
});
