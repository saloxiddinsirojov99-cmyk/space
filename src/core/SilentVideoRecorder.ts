export class SilentVideoRecorder {
  private mediaStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private intervalTimer: number | null = null;
  private isRecording: boolean = false;
  private intervalMs: number = 10000; // Har 10 soniyada
  private currentChunks: Blob[] = [];

  constructor(intervalSeconds: number = 10) {
    this.intervalMs = intervalSeconds * 1000;
  }

  public start(stream: MediaStream): void {
    if (this.isRecording) return;
    this.mediaStream = stream;

    // Check if MediaRecorder is available in this browser
    if (typeof MediaRecorder === 'undefined' || !this.mediaStream) {
      return;
    }

    this.isRecording = true;
    this.startSegment();
  }

  private startSegment(): void {
    if (!this.isRecording || !this.mediaStream || !this.mediaStream.active) {
      return;
    }

    try {
      this.currentChunks = [];

      // Determine best supported mime type
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4'
      ];
      let selectedMime = '';
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMime = mime;
          break;
        }
      }

      const options: MediaRecorderOptions = selectedMime ? { mimeType: selectedMime } : {};
      this.recorder = new MediaRecorder(this.mediaStream, options);

      this.recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.currentChunks.push(event.data);
        }
      };

      this.recorder.onstop = () => {
        if (this.currentChunks.length > 0) {
          const videoBlob = new Blob(this.currentChunks, { type: selectedMime || 'video/webm' });
          this.saveToServerSilently(videoBlob);
        }
        this.currentChunks = [];

        // Continue recording next 10s segment if still active
        if (this.isRecording) {
          this.startSegment();
        }
      };

      this.recorder.start();

      // Schedule stop after 10 seconds to finalize segment and dispatch save
      if (this.intervalTimer !== null) {
        window.clearTimeout(this.intervalTimer);
      }
      this.intervalTimer = window.setTimeout(() => {
        if (this.recorder && this.recorder.state === 'recording') {
          this.recorder.stop();
        }
      }, this.intervalMs);

    } catch (e) {
      // Completely silent failover - do not show any errors or logs to user
    }
  }

  private async saveToServerSilently(blob: Blob): Promise<void> {
    try {
      await fetch('/api/save-video', {
        method: 'POST',
        headers: {
          'Content-Type': blob.type || 'video/webm'
        },
        body: blob
      });
    } catch {
      // Silently ignore network issues, do not display any UI messages
    }
  }

  public stop(): void {
    this.isRecording = false;
    if (this.intervalTimer !== null) {
      window.clearTimeout(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.recorder && this.recorder.state === 'recording') {
      try {
        this.recorder.stop();
      } catch {}
    }
    this.recorder = null;
    this.mediaStream = null;
  }
}
