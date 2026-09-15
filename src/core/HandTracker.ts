import { FilesetResolver, HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface HandData {
  landmarks: NormalizedLandmark[];
  handedness: 'Left' | 'Right';
}

export class HandTracker {
  private handLandmarker: HandLandmarker | null = null;
  private isInitialized: boolean = false;
  private lastVideoTime: number = -1;
  private cachedHands: HandData[] = [];
  private lastDetectionTime: number = 0;
  private readonly gracePeriodMs: number = 350; // Grace period before dropping hands (tezkor javob)

  public async initialize(): Promise<void> {
    const options = {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: 'GPU' as const
      },
      runningMode: 'VIDEO' as const,
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6
    };

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      this.handLandmarker = await HandLandmarker.createFromOptions(vision, options);
      this.isInitialized = true;
      console.log('MediaPipe HandLandmarker initialized successfully (GPU).');
    } catch (err) {
      console.warn('GPU mode failed for MediaPipe, falling back to CPU:', err);
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        const cpuOptions = {
          ...options,
          baseOptions: {
            ...options.baseOptions,
            delegate: 'CPU' as const
          }
        };
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, cpuOptions);
        this.isInitialized = true;
        console.log('MediaPipe HandLandmarker initialized successfully (CPU).');
      } catch (cpuErr) {
        console.error('Failed to initialize HandLandmarker:', cpuErr);
        throw cpuErr;
      }
    }
  }

  public detectHands(videoElement: HTMLVideoElement, timestamp: number): HandData[] {
    if (!this.isInitialized || !this.handLandmarker) return this.cachedHands;

    const now = performance.now();

    // Check if new video frame is available
    if (videoElement.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = videoElement.currentTime;
      const results = this.handLandmarker.detectForVideo(videoElement, timestamp);

      if (results && results.landmarks && results.landmarks.length > 0) {
        const newHands: HandData[] = [];
        for (let i = 0; i < results.landmarks.length; i++) {
          const rawLandmarks = results.landmarks[i];
          const handednessCategory = results.handednesses[i]?.[0]?.categoryName || 'Right';
          const prevHand = this.cachedHands[i];

          // Adaptiv EMA smoothing: qo'l tez harakatlansa alpha katta (kechikish yo'q),
          // sekin turganda alpha kichik (jitter yo'qoladi)
          let deltaDist = 0;
          if (prevHand && prevHand.landmarks[0]) {
            deltaDist = Math.hypot(rawLandmarks[0].x - prevHand.landmarks[0].x, rawLandmarks[0].y - prevHand.landmarks[0].y);
          }
          const dynamicAlpha = Math.min(0.85, Math.max(0.48, deltaDist * 10.0));

          const smoothedLandmarks: NormalizedLandmark[] = rawLandmarks.map((lm, idx) => {
            if (prevHand && prevHand.landmarks[idx]) {
              const prev = prevHand.landmarks[idx];
              return {
                x: prev.x + (lm.x - prev.x) * dynamicAlpha,
                y: prev.y + (lm.y - prev.y) * dynamicAlpha,
                z: prev.z + (lm.z - prev.z) * dynamicAlpha,
                visibility: lm.visibility
              };
            }
            return { ...lm };
          });

          newHands.push({
            landmarks: smoothedLandmarks,
            handedness: handednessCategory as 'Left' | 'Right'
          });
        }

        this.cachedHands = newHands;
        this.lastDetectionTime = now;
        return this.cachedHands;
      }
    }

    // If camera frame hasn't changed or landmark detection missed a frame,
    // return cached hands if within grace period to prevent sudden jumping/freezing
    if (now - this.lastDetectionTime < this.gracePeriodMs) {
      return this.cachedHands;
    }

    // Grace period expired, clear cached hands
    this.cachedHands = [];
    return [];
  }

  public ready(): boolean {
    return this.isInitialized;
  }
}
