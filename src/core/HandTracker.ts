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
  private readonly gracePeriodMs: number = 800; // Grace period before dropping hands
  private readonly smoothingAlpha: number = 0.35; // Landmark EMA smoothing factor

  public async initialize(): Promise<void> {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 2
      });

      this.isInitialized = true;
      console.log('MediaPipe HandLandmarker initialized successfully.');
    } catch (err) {
      console.warn('GPU mode failed for MediaPipe, falling back to CPU:', err);
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: 'CPU'
          },
          runningMode: 'VIDEO',
          numHands: 2
        });
        this.isInitialized = true;
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

          // Apply Exponential Moving Average (EMA) smoothing to eliminate micro-jitter
          const smoothedLandmarks: NormalizedLandmark[] = rawLandmarks.map((lm, idx) => {
            if (prevHand && prevHand.landmarks[idx]) {
              const prev = prevHand.landmarks[idx];
              return {
                x: prev.x + (lm.x - prev.x) * this.smoothingAlpha,
                y: prev.y + (lm.y - prev.y) * this.smoothingAlpha,
                z: prev.z + (lm.z - prev.z) * this.smoothingAlpha,
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
