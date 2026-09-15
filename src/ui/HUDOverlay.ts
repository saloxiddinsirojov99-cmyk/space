import { GestureType } from '../core/GestureRecognizer';

export interface GestureMeta {
  emoji: string;
  name: string;
  subtext: string;
}

export const GESTURE_METADATA: Record<GestureType, GestureMeta> = {
  THUMBS_UP: { emoji: '👍', name: 'LIKE', subtext: 'Katta 3D Like shakli va yorqin cosmic chime' },
  LOVE: { emoji: '🫶', name: 'NARGIZA', subtext: 'Yurak ichida neon NARGIZA va iliq ambient urish' },
  HALF_HEART: { emoji: '🫶', name: 'YARIM YURAK', subtext: 'Yarim yurakdan uchib chiquvchi kapalaklar' },
  PINCH: { emoji: '🤏', name: 'QORA TUYNUQ', subtext: 'Gravitatsion vorteks va barmoq masofasi bilan radius' },
  OPEN_PALMS: { emoji: '✋', name: 'GALAKTIKA', subtext: 'Keng aylanuvchi spiral galaktika va kosmik swirl' },
  FIST: { emoji: '✊', name: 'SAYYORA', subtext: 'Aylanuvchi sayyora va halqa, chuqur kosmik bass' },
  PEACE: { emoji: '✌️', name: 'KAPALAK', subtext: 'Qanot qoqayotgan jonli kapalak va mayda flutter' },
  ONE_FINGER: { emoji: '☝️', name: 'LAZER BEAM', subtext: 'Kosmik lazer va yo\'nalishli yulduz izi' },
  STOP: { emoji: '✋', name: 'STOP', subtext: 'Qo\'l harakatiga ergashuvchi zich zarrachalar' },
  BUTTERFLY: { emoji: '🫰', name: 'KAPALAK', subtext: 'Barmoq qisish bilan boshqariluvchi kapalak' },
  WAVE: { emoji: '👋', name: 'TO\'LQIN', subtext: 'Tez harakatlanuvchi kosmik zarracha oqimi' },
  OK: { emoji: '👌', name: 'SATURN', subtext: 'Saturn sayyorasi va rezonans halqa' },
  ROCK: { emoji: '🤘', name: 'PULSAR', subtext: 'Aylanuvchi neytron yulduzi va nurlar' },
  CROSSED: { emoji: '🤞', name: 'DNK SPIRAL', subtext: 'Qo\'shaloq aylanuvchi DNK spiral zanjiri' },
  HANDS_UP: { emoji: '🙌', name: 'QUYOSH TIZIMI', subtext: 'Quyosh va orbital sayyoralar tizimi' },
  HANDSHAKE: { emoji: '🤝', name: 'TUMANLIK', subtext: 'Markaziy kosmik tumanlik buluti' },
  CLAP: { emoji: '👏', name: 'PORTLASH', subtext: 'Kosmik energiya chaqnashi' },
  THUMBS_DOWN: { emoji: '👎', name: 'SHARSHARA', subtext: 'Pastga oquvchi kosmik sharshara' },
  RIGHT_HAND: { emoji: '🫱', name: 'SHARQIY SHAMOL', subtext: 'O\'ng tomonga oquvchi zarracha shamoli' },
  LEFT_HAND: { emoji: '🫲', name: 'G\'ARBIY SHAMOL', subtext: 'Chap tomonga oquvchi zarracha shamoli' },
  IDLE: { emoji: '✨', name: 'Qo\'lingizni ko\'rsating', subtext: 'Kameraga qo\'lingizni ko\'rsating (👍, 🫶, ✋, ✊, ✌️, 🤏)' }
};

export class HUDOverlay {
  private emojiEl: HTMLElement;
  private nameEl: HTMLElement;
  private subtextEl: HTMLElement;
  private cameraBadgeEl: HTMLElement;
  private fpsBadgeEl: HTMLElement;
  private particleBadgeEl: HTMLElement;
  private auditBadgeEl: HTMLElement | null;
  private auditBadgeTextEl: HTMLElement | null;
  private btnSoundEl: HTMLButtonElement | null;
  private currentGesture: GestureType = 'IDLE';

  private onChipClick?: (gesture: GestureType) => void;
  private onTogglePip?: () => void;
  private onToggleFullscreen?: () => void;
  private onOpenAuditModal?: () => void;
  private onToggleSound?: () => void;

  constructor() {
    this.emojiEl = document.getElementById('gesture-emoji')!;
    this.nameEl = document.getElementById('gesture-name')!;
    this.subtextEl = document.getElementById('gesture-subtext')!;
    this.cameraBadgeEl = document.getElementById('status-camera')!;
    this.fpsBadgeEl = document.getElementById('status-fps')!;
    this.particleBadgeEl = document.getElementById('status-particles')!;
    this.auditBadgeEl = document.getElementById('status-audit');
    this.auditBadgeTextEl = document.getElementById('status-audit-text');

    this.btnSoundEl = document.getElementById('btn-toggle-sound') as HTMLButtonElement | null;

    this.initEventListeners();
  }

  private initEventListeners(): void {
    // Gesture Chips
    const chips = document.querySelectorAll('.gesture-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const gesture = chip.getAttribute('data-gesture') as GestureType;
        if (gesture && this.onChipClick) {
          this.onChipClick(gesture);
          this.setActiveChip(gesture);
        }
      });
    });

    // Buttons
    const btnPip = document.getElementById('btn-toggle-pip');
    if (btnPip) {
      btnPip.addEventListener('click', () => {
        if (this.onTogglePip) this.onTogglePip();
      });
    }

    const btnFullscreen = document.getElementById('btn-toggle-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        if (this.onToggleFullscreen) {
          this.onToggleFullscreen();
        } else {
          this.toggleFullscreen();
        }
      });
    }

    const btnAudit = document.getElementById('btn-open-audit-modal');
    if (btnAudit) {
      btnAudit.addEventListener('click', () => {
        if (this.onOpenAuditModal) this.onOpenAuditModal();
      });
    }

    if (this.btnSoundEl) {
      this.btnSoundEl.addEventListener('click', () => {
        if (this.onToggleSound) this.onToggleSound();
      });
    }
  }

  public updateSoundStatus(active: boolean): void {
    if (!this.btnSoundEl) return;
    const iconEl = this.btnSoundEl.querySelector('#sound-icon');
    const textEl = this.btnSoundEl.querySelector('#sound-text');
    if (active) {
      if (iconEl) iconEl.textContent = '🔊';
      if (textEl) textEl.textContent = 'Ovoz: ON';
      this.btnSoundEl.classList.remove('btn-sound-muted');
    } else {
      if (iconEl) iconEl.textContent = '🔇';
      if (textEl) textEl.textContent = 'Ovoz: OFF';
      this.btnSoundEl.classList.add('btn-sound-muted');
    }
  }

  public updateGesture(gesture: GestureType): void {
    if (this.currentGesture === gesture) return;

    this.currentGesture = gesture;
    const meta = GESTURE_METADATA[gesture] || GESTURE_METADATA.IDLE;

    this.emojiEl.textContent = meta.emoji;
    this.nameEl.textContent = meta.name;
    this.subtextEl.textContent = meta.subtext;

    this.setActiveChip(gesture);
  }

  public updateCameraStatus(active: boolean): void {
    if (active) {
      this.cameraBadgeEl.className = 'badge badge-online';
      this.cameraBadgeEl.querySelector('.badge-text')!.textContent = 'Camera: ON';
    } else {
      this.cameraBadgeEl.className = 'badge badge-offline';
      this.cameraBadgeEl.querySelector('.badge-text')!.textContent = 'Camera: OFF';
    }
  }

  public updateStats(fps: number, particleCount: number): void {
    this.fpsBadgeEl.querySelector('.badge-text')!.textContent = `${fps} FPS`;
    this.particleBadgeEl.querySelector('.badge-text')!.textContent = `${(particleCount / 1000).toFixed(1)}k Pts`;
  }

  public updateAuditStatus(status: 'recording' | 'saved' | 'failed' | 'off', elapsed: number = 0, total: number = 10): void {
    if (!this.auditBadgeEl || !this.auditBadgeTextEl) return;

    this.auditBadgeEl.classList.remove('hidden', 'badge-audit-saved', 'badge-audit-off');

    const pad = (n: number) => n.toString().padStart(2, '0');

    if (status === 'recording') {
      const current = Math.min(elapsed, total);
      this.auditBadgeTextEl.textContent = `REC 00:${pad(current)} / 00:${pad(total)}`;
    } else if (status === 'saved') {
      this.auditBadgeEl.classList.add('badge-audit-saved');
      this.auditBadgeTextEl.textContent = '✓ Audit saqlandi';
      window.setTimeout(() => {
        if (this.auditBadgeEl) this.auditBadgeEl.classList.add('hidden');
      }, 5000);
    } else if (status === 'off') {
      this.auditBadgeEl.classList.add('badge-audit-off');
      this.auditBadgeTextEl.textContent = 'Audit: Kamera o‘chiq';
    } else if (status === 'failed') {
      this.auditBadgeEl.classList.add('badge-audit-off');
      this.auditBadgeTextEl.textContent = 'Audit: Yozilmadi';
      window.setTimeout(() => {
        if (this.auditBadgeEl) this.auditBadgeEl.classList.add('hidden');
      }, 4000);
    }
  }

  private setActiveChip(gesture: GestureType): void {
    const chips = document.querySelectorAll('.gesture-chip');
    chips.forEach(chip => {
      const g = chip.getAttribute('data-gesture');
      if (g === gesture) {
        chip.classList.add('active');
        chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      } else {
        chip.classList.remove('active');
      }
    });
  }

  private toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  public setHandlers(handlers: {
    onChipClick?: (gesture: GestureType) => void;
    onTogglePip?: () => void;
    onToggleFullscreen?: () => void;
    onOpenAuditModal?: () => void;
    onToggleSound?: () => void;
  }): void {
    this.onChipClick = handlers.onChipClick;
    this.onTogglePip = handlers.onTogglePip;
    this.onToggleFullscreen = handlers.onToggleFullscreen;
    this.onOpenAuditModal = handlers.onOpenAuditModal;
    this.onToggleSound = handlers.onToggleSound;
  }
}
