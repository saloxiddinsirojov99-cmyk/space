import { HandData } from './HandTracker';

export type GestureType =
  | 'LOVE'
  | 'HANDS_UP'
  | 'CLAP'
  | 'OPEN_PALMS'
  | 'HANDSHAKE'
  | 'THUMBS_DOWN'
  | 'FIST'
  | 'PEACE'
  | 'CROSSED'
  | 'ROCK'
  | 'OK'
  | 'ONE_FINGER'
  | 'STOP'
  | 'BUTTERFLY'
  | 'WAVE'
  | 'RIGHT_HAND'
  | 'LEFT_HAND'
  | 'IDLE';

export interface GestureResult {
  gesture: GestureType;
  confidence: number;
  handsCount: number;
  primaryHandPosition: { x: number; y: number; z: number };
  secondaryHandPosition?: { x: number; y: number; z: number };
  handVelocity: { x: number; y: number };
}

export class GestureRecognizer {
  private historyBuffer: GestureType[] = [];
  private readonly bufferSize: number = 9;
  private lastStableGesture: GestureType = 'IDLE';
  private smoothedPrimaryPos = { x: 0.5, y: 0.5, z: 0 };
  private currentVelocity = { x: 0, y: 0 };

  public recognize(hands: HandData[]): GestureResult {
    let rawGesture: GestureType = 'IDLE';

    if (hands.length === 0) {
      this.pushHistory('IDLE');
      this.currentVelocity = { x: 0, y: 0 };
      return {
        gesture: this.lastStableGesture,
        confidence: 1.0,
        handsCount: 0,
        primaryHandPosition: this.smoothedPrimaryPos,
        handVelocity: { x: 0, y: 0 }
      };
    }

    const h1 = hands[0].landmarks;
    const h2 = hands.length > 1 ? hands[1].landmarks : null;

    // Raw primary hand position (centered around palm/wrist/middle MCP)
    const rawP1 = {
      x: (h1[0].x + h1[9].x) / 2,
      y: (h1[0].y + h1[9].y) / 2,
      z: (h1[0].z + h1[9].z) / 2
    };

    // Smooth hand position
    const alpha = 0.3;
    this.smoothedPrimaryPos = {
      x: this.smoothedPrimaryPos.x + (rawP1.x - this.smoothedPrimaryPos.x) * alpha,
      y: this.smoothedPrimaryPos.y + (rawP1.y - this.smoothedPrimaryPos.y) * alpha,
      z: this.smoothedPrimaryPos.z + (rawP1.z - this.smoothedPrimaryPos.z) * alpha
    };

    // Calculate hand velocity
    const vx = rawP1.x - this.smoothedPrimaryPos.x;
    const vy = rawP1.y - this.smoothedPrimaryPos.y;
    this.currentVelocity = {
      x: this.currentVelocity.x * 0.7 + vx * 0.3,
      y: this.currentVelocity.y * 0.7 + vy * 0.3
    };

    const speed = Math.hypot(this.currentVelocity.x, this.currentVelocity.y);

    // Check two-handed gestures first
    if (hands.length >= 2 && h2) {
      const p2 = {
        x: (h2[0].x + h2[9].x) / 2,
        y: (h2[0].y + h2[9].y) / 2,
        z: (h2[0].z + h2[9].z) / 2
      };

      const handsDist = Math.hypot(rawP1.x - p2.x, rawP1.y - p2.y);

      // 🫶🏻 LOVE: Index tips and Thumb tips touching forming a heart
      const indexDist = Math.hypot(h1[8].x - h2[8].x, h1[8].y - h2[8].y);
      const thumbDist = Math.hypot(h1[4].x - h2[4].x, h1[4].y - h2[4].y);
      if (indexDist < 0.15 && thumbDist < 0.15) {
        rawGesture = 'LOVE';
      }
      // 👏🏻 CLAP: Both palms very close
      else if (handsDist < 0.12 && speed > 0.01) {
        rawGesture = 'CLAP';
      }
      // 🤝 HANDSHAKE: Center distance small, horizontal orientations
      else if (handsDist < 0.18 && Math.abs(rawP1.y - p2.y) < 0.1) {
        rawGesture = 'HANDSHAKE';
      }
      // 🙌🏻 HANDS UP: Both wrists in top half, fingers pointing up
      else if (rawP1.y < 0.45 && p2.y < 0.45 && this.areFingersExtendedUp(h1) && this.areFingersExtendedUp(h2)) {
        rawGesture = 'HANDS_UP';
      }
      // 🤲🏻 OPEN PALMS: Both palms facing camera/up close together
      else if (handsDist < 0.32 && this.areFingersExtendedUp(h1) && this.areFingersExtendedUp(h2)) {
        rawGesture = 'OPEN_PALMS';
      }
    }

    // If no two-hand gesture matched, evaluate single hand
    if (rawGesture === 'IDLE') {
      const extIndex = this.isFingerExtended(h1, 5, 8);
      const extMiddle = this.isFingerExtended(h1, 9, 12);
      const extRing = this.isFingerExtended(h1, 13, 16);
      const extPinky = this.isFingerExtended(h1, 17, 20);
      const extThumb = this.isThumbExtended(h1);

      const thumbIndexDist = Math.hypot(h1[8].x - h1[4].x, h1[8].y - h1[4].y);
      const allFourExtended = extIndex && extMiddle && extRing && extPinky;

      // ✋🏻 STOP: All 5 fingers clearly extended — check FIRST before WAVE
      // Require thumb also extended to avoid confusion with WAVE
      if (allFourExtended && extThumb && speed <= 0.03) {
        rawGesture = 'STOP';
      }
      // 👋🏻 WAVE: All 4+ fingers extended AND rapid horizontal movement
      else if (allFourExtended && speed > 0.03) {
        rawGesture = 'WAVE';
      }
      // ✊🏻 FIST / 👎🏻 THUMBS_DOWN: ALL 4 fingers curled — check BEFORE BUTTERFLY
      // (Fist closes all fingers, thumb can touch index from outside → avoid BUTTERFLY)
      else if (!extIndex && !extMiddle && !extRing && !extPinky) {
        if (h1[4].y > h1[2].y + 0.04 && h1[4].y > h1[0].y) {
          rawGesture = 'THUMBS_DOWN';
        } else {
          rawGesture = 'FIST';
        }
      }
      // 👌🏻 OK: Thumb & Index touching tightly, Middle+Ring extended
      else if (thumbIndexDist < 0.07 && extMiddle && extRing) {
        rawGesture = 'OK';
      }
      // 🫰 BUTTERFLY (Finger Snap / Pinch):
      // Thumb tip & Index tip very close + Index IS extended (not curled like fist),
      // Middle, Ring, Pinky curled — distinct from FIST because index extends toward thumb
      else if (thumbIndexDist < 0.075 && extIndex && !extMiddle && !extRing && !extPinky) {
        rawGesture = 'BUTTERFLY';
      }
      // ✌🏻 PEACE / 🤞🏻 CROSSED: Index & Middle extended, Ring & Pinky curled
      else if (extIndex && extMiddle && !extRing && !extPinky) {
        const crossedDist = Math.hypot(h1[8].x - h1[12].x, h1[8].y - h1[12].y);
        if (crossedDist < 0.042) {
          rawGesture = 'CROSSED';
        } else {
          rawGesture = 'PEACE';
        }
      }
      // 🤘🏻 ROCK: Index & Pinky extended, Middle & Ring curled
      else if (extIndex && extPinky && !extMiddle && !extRing) {
        rawGesture = 'ROCK';
      }
      // ☝🏻 ONE FINGER: Only index clearly extended
      else if (extIndex && !extMiddle && !extRing && !extPinky) {
        rawGesture = 'ONE_FINGER';
      }
      // 🫱🏻 RIGHT HAND: Hand orientation pointing right
      else if (h1[9].x - h1[0].x > 0.12 && Math.abs(h1[9].y - h1[0].y) < 0.1) {
        rawGesture = 'RIGHT_HAND';
      }
      // 🫲🏻 LEFT HAND: Hand orientation pointing left
      else if (h1[0].x - h1[9].x > 0.12 && Math.abs(h1[9].y - h1[0].y) < 0.1) {
        rawGesture = 'LEFT_HAND';
      }
    }

    // Temporal smoothing with ring buffer
    this.pushHistory(rawGesture);
    const stabilizedGesture = this.getDominantGesture();
    this.lastStableGesture = stabilizedGesture;

    return {
      gesture: stabilizedGesture,
      confidence: 0.95,
      handsCount: hands.length,
      primaryHandPosition: this.smoothedPrimaryPos,
      secondaryHandPosition: hands.length > 1 && h2 ? {
        x: (h2[0].x + h2[9].x) / 2,
        y: (h2[0].y + h2[9].y) / 2,
        z: (h2[0].z + h2[9].z) / 2
      } : undefined,
      handVelocity: this.currentVelocity
    };
  }

  private isFingerExtended(landmarks: any[], mcpIdx: number, tipIdx: number): boolean {
    const wrist = landmarks[0];
    const mcp = landmarks[mcpIdx];
    const tip = landmarks[tipIdx];

    const distTipWrist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    const distMcpWrist = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y);

    return distTipWrist > distMcpWrist * 1.25;
  }

  private isThumbExtended(landmarks: any[]): boolean {
    const tip = landmarks[4];
    const ip = landmarks[3];
    const mcp = landmarks[2];
    const wrist = landmarks[0];

    const distTip = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    const distMcp = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y);

    return distTip > distMcp * 1.1;
  }

  private areFingersExtendedUp(landmarks: any[]): boolean {
    return (
      landmarks[8].y < landmarks[5].y &&
      landmarks[12].y < landmarks[9].y &&
      landmarks[16].y < landmarks[13].y &&
      landmarks[20].y < landmarks[17].y
    );
  }

  private pushHistory(gesture: GestureType): void {
    this.historyBuffer.push(gesture);
    if (this.historyBuffer.length > this.bufferSize) {
      this.historyBuffer.shift();
    }
  }

  private getDominantGesture(): GestureType {
    if (this.historyBuffer.length === 0) return 'IDLE';

    const counts: Record<string, number> = {};
    for (const g of this.historyBuffer) {
      counts[g] = (counts[g] || 0) + 1;
    }

    let maxCount = 0;
    let dominant: GestureType = 'IDLE';
    for (const [g, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        dominant = g as GestureType;
      }
    }

    // Require at least 5 out of 9 votes to switch gesture to avoid jitter
    if (maxCount >= 5) {
      return dominant;
    }
    return this.lastStableGesture;
  }

  public forceGesture(gesture: GestureType): void {
    this.historyBuffer = new Array(this.bufferSize).fill(gesture);
    this.lastStableGesture = gesture;
  }
}
