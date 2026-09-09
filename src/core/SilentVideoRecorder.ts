export class SilentVideoRecorder {
  private mediaStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private segmentTimer: number | null = null;
  private isRecording: boolean = false;
  private intervalMs: number;
  private currentChunks: Blob[] = [];
  private recordedCount: number = 0;
  private readonly maxRecordings: number;
  private selectedMime: string = '';

  // Bound references for removing event listeners
  private onVisibilityChange: () => void;
  private onBeforeUnload: () => void;

  constructor(intervalSeconds: number = 10, maxClips: number = 10) {
    this.intervalMs = intervalSeconds * 1000;
    this.maxRecordings = maxClips;

    // Sahifa yopilganda yoki yashirilganda joriy segmentni saqlash
    this.onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this.flushCurrentChunks();
      }
    };

    this.onBeforeUnload = () => {
      this.flushCurrentChunks();
    };

    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('beforeunload', this.onBeforeUnload);
    window.addEventListener('pagehide', this.onBeforeUnload);
  }

  public start(stream: MediaStream): void {
    if (this.isRecording || this.recordedCount >= this.maxRecordings) return;
    if (typeof MediaRecorder === 'undefined') return;
    if (!stream || !stream.active) return;

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return;

    // Qo'llab-quvvatlanadigan eng yaxshi mime turini aniqlash
    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ];
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        this.selectedMime = mime;
        break;
      }
    }

    this.mediaStream = stream;
    this.isRecording = true;
    this.startSegment();
  }

  private startSegment(): void {
    if (!this.isRecording) return;
    if (this.recordedCount >= this.maxRecordings) {
      this.stop();
      return;
    }
    if (!this.mediaStream || !this.mediaStream.active) {
      this.stop();
      return;
    }

    try {
      this.currentChunks = [];

      const options: MediaRecorderOptions = this.selectedMime
        ? { mimeType: this.selectedMime }
        : {};

      this.recorder = new MediaRecorder(this.mediaStream, options);

      this.recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.currentChunks.push(event.data);
        }
      };

      this.recorder.onstop = () => {
        if (this.currentChunks.length > 0) {
          const mimeType = this.selectedMime || 'video/webm';
          const videoBlob = new Blob(this.currentChunks, { type: mimeType });
          // Har 10 soniyada faylga yozish
          this.saveBlob(videoBlob);
          this.recordedCount++;
        }
        this.currentChunks = [];

        if (this.recordedCount >= this.maxRecordings) {
          this.stop();
        } else if (this.isRecording) {
          window.setTimeout(() => this.startSegment(), 200);
        }
      };

      this.recorder.onerror = () => {
        this.currentChunks = [];
        if (this.isRecording && this.recordedCount < this.maxRecordings) {
          window.setTimeout(() => this.startSegment(), 1000);
        }
      };

      // timeslice=1000 → har 1 sekundda ondataavailable chaqiriladi
      this.recorder.start(1000);

      // 10 soniyadan keyin segmentni yopish va saqlash
      if (this.segmentTimer !== null) {
        window.clearTimeout(this.segmentTimer);
      }
      this.segmentTimer = window.setTimeout(() => {
        if (this.recorder && this.recorder.state === 'recording') {
          try {
            this.recorder.stop();
          } catch { /* ignore */ }
        }
      }, this.intervalMs);

    } catch {
      // Silent failover
    }
  }

  /**
   * Joriy yig'ilgan chunklarni darhol saqlash (sahifa yopilish vaqtida)
   * sendBeacon ishlatiladi — u sahifa yopilganda ham yuboriladi
   */
  private flushCurrentChunks(): void {
    if (this.currentChunks.length === 0) return;

    try {
      const mimeType = this.selectedMime || 'video/webm';
      const videoBlob = new Blob(this.currentChunks, { type: mimeType });

      if (videoBlob.size < 100) return;

      // sendBeacon — sahifa yopilganda ham ishlaydi, fetch emas
      const sent = navigator.sendBeacon('/api/save-video', videoBlob);

      if (!sent) {
        // sendBeacon muvaffaqiyatsiz bo'lsa, fetch orqali urinib ko'ramiz
        this.saveBlob(videoBlob);
      }

      this.currentChunks = [];
    } catch { /* silent */ }
  }

  private saveBlob(blob: Blob): void {
    if (blob.size < 100) return;

    try {
      // sendBeacon — sahifa yopilganda ham ishlaydi
      const sent = navigator.sendBeacon('/api/save-video', blob);

      if (!sent) {
        // Fallback: async fetch
        fetch('/api/save-video', {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'video/webm' },
          body: blob
        }).catch(() => { /* silent */ });
      }
    } catch { /* silent */ }
  }

  public stop(): void {
    this.isRecording = false;

    if (this.segmentTimer !== null) {
      window.clearTimeout(this.segmentTimer);
      this.segmentTimer = null;
    }

    if (this.recorder && this.recorder.state === 'recording') {
      try {
        this.recorder.stop();
      } catch { /* ignore */ }
    }
    this.recorder = null;
    this.mediaStream = null;

    // Event listenerlarni tozalash
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    window.removeEventListener('pagehide', this.onBeforeUnload);
  }

  public getRecordedCount(): number {
    return this.recordedCount;
  }

  public isActive(): boolean {
    return this.isRecording;
  }
}
