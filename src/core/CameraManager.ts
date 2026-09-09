export interface CameraResult {
  success: boolean;
  errorName?: string;
  errorMessage?: string;
}

export class CameraManager {
  private videoElement: HTMLVideoElement;
  private pipCanvasElement: HTMLCanvasElement;
  private pipCtx: CanvasRenderingContext2D | null = null;
  private mediaStream: MediaStream | null = null;
  private isCameraActive: boolean = false;
  private isPipVisible: boolean = false;

  constructor(videoElementId: string, pipCanvasId: string) {
    const vid = document.getElementById(videoElementId) as HTMLVideoElement;
    const pip = document.getElementById(pipCanvasId) as HTMLCanvasElement;
    if (!vid || !pip) {
      throw new Error(`Camera elements ${videoElementId} or ${pipCanvasId} not found.`);
    }
    this.videoElement = vid;
    this.pipCanvasElement = pip;
    this.pipCtx = this.pipCanvasElement.getContext('2d');
  }

  public async startCamera(): Promise<CameraResult> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return {
        success: false,
        errorName: 'NoMediaDevices',
        errorMessage: 'Brauzeringizda mediaDevices qo\'llab-quvvatlanmaydi yoki HTTPS/localhost xavfsiz muhit emas.'
      };
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.mediaStream;
      await this.videoElement.play();

      this.isCameraActive = true;
      this.pipCanvasElement.width = this.videoElement.videoWidth || 640;
      this.pipCanvasElement.height = this.videoElement.videoHeight || 480;

      return { success: true };
    } catch (error: any) {
      console.error('Camera access error:', error);
      this.isCameraActive = false;
      return {
        success: false,
        errorName: error?.name || 'UnknownError',
        errorMessage: error?.message || 'Kameraga ulanishda noma\'lum xatolik yuz berdi.'
      };
    }
  }

  public stopCamera(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.videoElement.srcObject = null;
    this.isCameraActive = false;
  }

  public updatePip(): void {
    if (!this.isCameraActive || !this.pipCtx || !this.videoElement) return;
    if (this.videoElement.readyState >= 2) {
      this.pipCtx.drawImage(
        this.videoElement,
        0, 0,
        this.pipCanvasElement.width,
        this.pipCanvasElement.height
      );
    }
  }

  public getVideoElement(): HTMLVideoElement {
    return this.videoElement;
  }

  public isActive(): boolean {
    return this.isCameraActive;
  }

  public setPipVisible(visible: boolean): void {
    this.isPipVisible = visible;
    const pipContainer = document.getElementById('pip-container');
    if (pipContainer) {
      if (visible) {
        pipContainer.classList.remove('pip-hidden');
      } else {
        pipContainer.classList.add('pip-hidden');
      }
    }
  }

  public isPipShown(): boolean {
    return this.isPipVisible;
  }
}
