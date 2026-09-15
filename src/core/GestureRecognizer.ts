import type { HandData } from './HandTracker';

export type GestureType =
  | 'THUMBS_UP'
  | 'LOVE'
  | 'HALF_HEART'
  | 'OPEN_PALMS'
  | 'FIST'
  | 'PEACE'
  | 'PINCH'
  | 'ONE_FINGER'
  | 'ROCK'
  | 'OK'
  | 'CROSSED'
  | 'THUMBS_DOWN'
  | 'STOP'
  | 'BUTTERFLY'
  | 'WAVE'
  | 'HANDS_UP'
  | 'HANDSHAKE'
  | 'CLAP'
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
  pinchDistance: number;
  handScale: number;
  handRotation: number;
  twoHandsDistance: number;
}

export class GestureRecognizer {
  private historyBuffer: GestureType[] = [];
  private readonly bufferSize: number = 7; // Tezkor va barqaror ring buffer
  private lastStableGesture: GestureType = 'IDLE';
  private smoothedPrimaryPos = { x: 0.5, y: 0.5, z: 0 };
  private currentVelocity = { x: 0, y: 0 };

  public recognize(hands: HandData[]): GestureResult {
    let rawGesture: GestureType = 'IDLE';
    let pinchDistance = 1.0;
    let handScale = 1.0;
    let handRotation = 0;
    let twoHandsDistance = 0;

    if (hands.length === 0) {
      this.pushHistory('IDLE');
      this.currentVelocity = { x: 0, y: 0 };
      return {
        gesture: this.lastStableGesture,
        confidence: 1.0,
        handsCount: 0,
        primaryHandPosition: this.smoothedPrimaryPos,
        handVelocity: { x: 0, y: 0 },
        pinchDistance: 1.0,
        handScale: 1.0,
        handRotation: 0,
        twoHandsDistance: 0
      };
    }

    const h1 = hands[0].landmarks;
    const h2 = hands.length > 1 ? hands[1].landmarks : null;

    // Primary hand scale (wrist to middle MCP distance)
    const wrist = h1[0];
    const middleMcp = h1[9];
    handScale = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y) * 5.0;

    // Hand rotation (angle of wrist -> middle finger base)
    handRotation = Math.atan2(middleMcp.y - wrist.y, middleMcp.x - wrist.x) + Math.PI / 2;

    // Raw primary hand position (centered around palm)
    const rawP1 = {
      x: (wrist.x + middleMcp.x) / 2,
      y: (wrist.y + middleMcp.y) / 2,
      z: (wrist.z + middleMcp.z) / 2
    };

    // Smooth hand position
    const alpha = 0.45;
    this.smoothedPrimaryPos = {
      x: this.smoothedPrimaryPos.x + (rawP1.x - this.smoothedPrimaryPos.x) * alpha,
      y: this.smoothedPrimaryPos.y + (rawP1.y - this.smoothedPrimaryPos.y) * alpha,
      z: this.smoothedPrimaryPos.z + (rawP1.z - this.smoothedPrimaryPos.z) * alpha
    };

    // Hand velocity calculation
    const vx = rawP1.x - this.smoothedPrimaryPos.x;
    const vy = rawP1.y - this.smoothedPrimaryPos.y;
    this.currentVelocity = {
      x: this.currentVelocity.x * 0.65 + vx * 0.35,
      y: this.currentVelocity.y * 0.65 + vy * 0.35
    };
    const speed = Math.hypot(this.currentVelocity.x, this.currentVelocity.y);

    // -------------------------------------------------------------------------
    // 1. TWO-HANDED GESTURES (Ikki qo'lli imo-ishoralar)
    // -------------------------------------------------------------------------
    if (hands.length >= 2 && h2) {
      const p2 = {
        x: (h2[0].x + h2[9].x) / 2,
        y: (h2[0].y + h2[9].y) / 2,
        z: (h2[0].z + h2[9].z) / 2
      };

      twoHandsDistance = Math.hypot(rawP1.x - p2.x, rawP1.y - p2.y);

      // 🫶 LOVE (NARGIZA): Ikki qo'l ko'rsatkich va bosh barmoqlari birlashib yurak hosil qilishi
      const indexTipsDist = Math.hypot(h1[8].x - h2[8].x, h1[8].y - h2[8].y);
      const thumbTipsDist = Math.hypot(h1[4].x - h2[4].x, h1[4].y - h2[4].y);

      // Kengaytirilgan ishonchli yurak sharti
      if (indexTipsDist < 0.22 && thumbTipsDist < 0.22 && twoHandsDistance < 0.55) {
        rawGesture = 'LOVE';
      }
      // 👏 CLAP: Kaftlar juda yaqin va harakatda
      else if (twoHandsDistance < 0.14 && speed > 0.012) {
        rawGesture = 'CLAP';
      }
      // 🤝 HANDSHAKE: Ikki qo'l markazda tutashgan
      else if (twoHandsDistance < 0.20 && Math.abs(rawP1.y - p2.y) < 0.12) {
        rawGesture = 'HANDSHAKE';
      }
      // 🙌 HANDS UP: Ikkala qo'l ham yuqorida va barcha barmoqlar ochiq
      else if (rawP1.y < 0.50 && p2.y < 0.50 && this.areFingersExtendedUp(h1) && this.areFingersExtendedUp(h2)) {
        rawGesture = 'HANDS_UP';
      }
      // 🤲 OPEN PALMS (Two Hands): Ikkala kaft ochiq
      else if (twoHandsDistance < 0.45 && this.isPalmOpen(h1) && this.isPalmOpen(h2)) {
        rawGesture = 'OPEN_PALMS';
      }
    }

    // -------------------------------------------------------------------------
    // 2. SINGLE-HAND GESTURES (Bir qo'lli imo-ishoralar)
    // -------------------------------------------------------------------------
    if (rawGesture === 'IDLE') {
      const extIndex = this.isFingerExtended(h1, 5, 6, 8);
      const extMiddle = this.isFingerExtended(h1, 9, 10, 12);
      const extRing = this.isFingerExtended(h1, 13, 14, 16);
      const extPinky = this.isFingerExtended(h1, 17, 18, 20);
      const extThumb = this.isThumbExtended(h1);

      // Bosh va ko'rsatkich barmoq uchlari masofasi (Pinch / Half Heart uchun)
      const thumbIndexDist = Math.hypot(h1[8].x - h1[4].x, h1[8].y - h1[4].y);
      pinchDistance = Math.min(1.0, thumbIndexDist * 4.0);

      const allFourCurled = !extIndex && !extMiddle && !extRing && !extPinky;
      const allFourExtended = extIndex && extMiddle && extRing && extPinky;

      // 👍 1. THUMBS_UP / LIKE: 4 barmoq bukilgan, bosh barmoq YUQORIGA qarab cho'zilgan
      if (allFourCurled && h1[4].y < h1[3].y && h1[4].y < h1[2].y - 0.035) {
        rawGesture = 'THUMBS_UP';
      }
      // 👎 2. THUMBS_DOWN: 4 barmoq bukilgan, bosh barmoq PASTGA qarab cho'zilgan
      else if (allFourCurled && h1[4].y > h1[3].y && h1[4].y > h1[2].y + 0.035) {
        rawGesture = 'THUMBS_DOWN';
      }
      // ✊ 3. FIST: Barcha 5 ta barmoq bukilgan
      else if (allFourCurled && !extThumb) {
        rawGesture = 'FIST';
      }
      // 🫶 4. HALF_HEART: Bir qo'l bilan yarim yurak yoyi (bosh va ko'rsatkich yarim yurak yoygan, qolgan 3 barmoq bukilgan)
      else if (
        thumbIndexDist >= 0.04 &&
        thumbIndexDist <= 0.16 &&
        !extMiddle &&
        !extRing &&
        !extPinky &&
        h1[8].y > h1[6].y && // ko'rsatkich barmoq pastga yoyilgan
        h1[4].x > h1[2].x - 0.05
      ) {
        rawGesture = 'HALF_HEART';
      }
      // 🤏 5. PINCH: Bosh va ko'rsatkich barmoq uchlari juda yaqin (< 0.06)
      else if (thumbIndexDist < 0.065 && extMiddle && extRing) {
        rawGesture = 'OK'; // OK belgisi (o'rta va nomsiz ochiq)
      }
      else if (thumbIndexDist < 0.065) {
        rawGesture = 'PINCH'; // Mini wormhole / qora tuynuk
      }
      // ✋ 6. STOP / OPEN_PALMS: Barcha 5 barmoq to'liq ochiq va tinch
      else if (allFourExtended && extThumb && speed <= 0.035) {
        rawGesture = 'STOP';
      }
      // 👋 7. WAVE: Barcha barmoqlar ochiq va tez silkitish
      else if (allFourExtended && speed > 0.035) {
        rawGesture = 'WAVE';
      }
      else if (allFourExtended) {
        rawGesture = 'OPEN_PALMS';
      }
      // ✌️ 8. PEACE: Ko'rsatkich va o'rta barmoq ochiq, nomsiz va jimjiloq bukilgan
      else if (extIndex && extMiddle && !extRing && !extPinky) {
        const crossedDist = Math.hypot(h1[8].x - h1[12].x, h1[8].y - h1[12].y);
        if (crossedDist < 0.04) {
          rawGesture = 'CROSSED'; // 🤞 DNA helix
        } else {
          rawGesture = 'PEACE'; // ✌️ Kapalak
        }
      }
      // 🤘 9. ROCK: Ko'rsatkich va jimjiloq ochiq, o'rta va nomsiz bukilgan
      else if (extIndex && extPinky && !extMiddle && !extRing) {
        rawGesture = 'ROCK';
      }
      // ☝️ 10. ONE_FINGER / POINTING: Faqat ko'rsatkich barmoq ochiq
      else if (extIndex && !extMiddle && !extRing && !extPinky) {
        rawGesture = 'ONE_FINGER';
      }
      // 🫰 11. BUTTERFLY: Barmoq qisishi
      else if (thumbIndexDist < 0.08 && extIndex && !extMiddle && !extRing) {
        rawGesture = 'BUTTERFLY';
      }
    }

    // Temporal Smoothing (Jitter va tasodifiy sakrashlarni yo'qotish)
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
      handVelocity: this.currentVelocity,
      pinchDistance,
      handScale,
      handRotation,
      twoHandsDistance
    };
  }

  /**
   * Barmoqning bukilgan yoki cho'zilganligini to'liq 3-nuqtali geometriya orqali hisoblash
   */
  private isFingerExtended(landmarks: any[], mcpIdx: number, pipIdx: number, tipIdx: number): boolean {
    const wrist = landmarks[0];
    const mcp = landmarks[mcpIdx];
    const pip = landmarks[pipIdx];
    const tip = landmarks[tipIdx];

    // 1. Bilakdan TIP masofasi MCP masofasidan sezilarli katta bo'lishi kerak
    const distTipWrist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    const distPipWrist = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);
    const distMcpWrist = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y);

    // 2. Barmoq bo'g'inining to'g'rilanish darajasi
    return distTipWrist > distMcpWrist * 1.18 && distTipWrist > distPipWrist * 1.05;
  }

  /**
   * Bosh barmoq ochilganligini tekshirish
   */
  private isThumbExtended(landmarks: any[]): boolean {
    const wrist = landmarks[0];
    const mcp = landmarks[2];
    const ip = landmarks[3];
    const tip = landmarks[4];

    const distTipWrist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    const distMcpWrist = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y);
    const distTipIp = Math.hypot(tip.x - ip.x, tip.y - ip.y);

    return distTipWrist > distMcpWrist * 1.15 && distTipIp > 0.04;
  }

  /**
   * Kaft ochiqligi
   */
  private isPalmOpen(landmarks: any[]): boolean {
    return (
      this.isFingerExtended(landmarks, 5, 6, 8) &&
      this.isFingerExtended(landmarks, 9, 10, 12) &&
      this.isFingerExtended(landmarks, 13, 14, 16) &&
      this.isFingerExtended(landmarks, 17, 18, 20)
    );
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

    // Barqarorlik uchun kamida 4 ta ovoz talab qilinadi
    if (maxCount >= 4) {
      return dominant;
    }
    return this.lastStableGesture;
  }

  public forceGesture(gesture: GestureType): void {
    this.historyBuffer = new Array(this.bufferSize).fill(gesture);
    this.lastStableGesture = gesture;
  }
}
