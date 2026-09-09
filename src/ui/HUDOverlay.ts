import { GestureType } from '../core/GestureRecognizer';

export interface GestureMeta {
  emoji: string;
  name: string;
  subtext: string;
}

export const GESTURE_METADATA: Record<GestureType, GestureMeta> = {
  LOVE: { emoji: '🫶🏻', name: 'CHAROS', subtext: 'Glowing neon CHAROS name with floating hearts' },
  HANDS_UP: { emoji: '🙌🏻', name: 'HANDS UP', subtext: 'Rising aurora particle columns' },
  CLAP: { emoji: '👏🏻', name: 'CLAP', subtext: 'Cosmic energy burst' },
  OPEN_PALMS: { emoji: '🤲🏻', name: 'OPEN PALMS', subtext: 'Swirling purple spiral galaxy' },
  HANDSHAKE: { emoji: '🤝', name: 'HANDSHAKE', subtext: 'Central cosmic nebula cloud' },
  THUMBS_DOWN: { emoji: '👎🏻', name: 'THUMBS DOWN', subtext: 'Cosmic waterfall stream' },
  FIST: { emoji: '✊🏻', name: '3D CUBE', subtext: 'Rotating 3D wireframe cyber cube' },
  PEACE: { emoji: '✌🏻', name: 'MINI HEARTS', subtext: 'Endless glowing hearts multiplying' },
  CROSSED: { emoji: '🤞🏻', name: 'DNA HELIX', subtext: 'Twin intertwined DNA strands' },
  ROCK: { emoji: '🤘🏻', name: 'PULSAR STAR', subtext: 'Spinning neutron star & polar jets' },
  OK: { emoji: '👌🏻', name: 'SATURN RING', subtext: 'Ringed planet & dense core' },
  ONE_FINGER: { emoji: '☝🏻', name: 'EARTH', subtext: 'Rotating planet Earth with orbiting Moon' },
  STOP: { emoji: '✋🏻', name: 'STOP', subtext: 'Dense particle cluster following hand motion' },
  BUTTERFLY: { emoji: '🫰', name: 'BUTTERFLY', subtext: 'Living glowing butterfly following your hand' },
  WAVE: { emoji: '👋🏻', name: 'WAVE', subtext: 'High-speed motion particle spray' },
  RIGHT_HAND: { emoji: '🫱🏻', name: 'RIGHT HAND', subtext: 'Eastward particle wind' },
  LEFT_HAND: { emoji: '🫲🏻', name: 'LEFT HAND', subtext: 'Westward particle wind' },
  IDLE: { emoji: '✨', name: 'Show your hands', subtext: 'Move your hand in front of the camera' }
};

export class HUDOverlay {
  private emojiEl: HTMLElement;
  private nameEl: HTMLElement;
  private subtextEl: HTMLElement;
  private cameraBadgeEl: HTMLElement;
  private fpsBadgeEl: HTMLElement;
  private particleBadgeEl: HTMLElement;
  private currentGesture: GestureType = 'IDLE';

  private onChipClick?: (gesture: GestureType) => void;
  private onTogglePip?: () => void;
  private onToggleFullscreen?: () => void;

  constructor() {
    this.emojiEl = document.getElementById('gesture-emoji')!;
    this.nameEl = document.getElementById('gesture-name')!;
    this.subtextEl = document.getElementById('gesture-subtext')!;
    this.cameraBadgeEl = document.getElementById('status-camera')!;
    this.fpsBadgeEl = document.getElementById('status-fps')!;
    this.particleBadgeEl = document.getElementById('status-particles')!;

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
  }): void {
    this.onChipClick = handlers.onChipClick;
    this.onTogglePip = handlers.onTogglePip;
    this.onToggleFullscreen = handlers.onToggleFullscreen;
  }
}
