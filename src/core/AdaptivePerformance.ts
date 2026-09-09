export class AdaptivePerformance {
  private frameCount: number = 0;
  private lastTime: number = performance.now();
  private currentFps: number = 60;
  private minParticles: number = 3000;
  private maxParticles: number = 20000;
  private currentTargetCount: number = 12000;
  private onFpsUpdate?: (fps: number, particleCount: number) => void;

  constructor(
    initialTarget: number = 12000,
    onFpsUpdate?: (fps: number, particleCount: number) => void
  ) {
    this.currentTargetCount = initialTarget;
    this.onFpsUpdate = onFpsUpdate;
  }

  public update(): void {
    this.frameCount++;
    const now = performance.now();
    const delta = now - this.lastTime;

    if (delta >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / delta);
      this.frameCount = 0;
      this.lastTime = now;

      // Adjust particle count dynamically based on performance
      if (this.currentFps < 42 && this.currentTargetCount > this.minParticles) {
        this.currentTargetCount = Math.max(this.minParticles, this.currentTargetCount - 1500);
      } else if (this.currentFps >= 58 && this.currentTargetCount < this.maxParticles) {
        this.currentTargetCount = Math.min(this.maxParticles, this.currentTargetCount + 1000);
      }

      if (this.onFpsUpdate) {
        this.onFpsUpdate(this.currentFps, this.currentTargetCount);
      }
    }
  }

  public getFps(): number {
    return this.currentFps;
  }

  public getTargetParticleCount(): number {
    return this.currentTargetCount;
  }

  public setMaxParticles(max: number): void {
    this.maxParticles = max;
  }
}
