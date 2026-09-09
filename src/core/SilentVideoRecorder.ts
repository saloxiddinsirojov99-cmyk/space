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
  private isPageHiding: boolean = false;

  private _onVisibilityChange: () => void;
  private _onBeforeUnload: () => void;
  private _onPageHide: () => void;

  constructor(intervalSeconds: number = 10, maxClips: number = 10) {
    this.intervalMs = intervalSeconds * 1000;
    this.maxRecordings = maxClips;

    // Sahifa yopilganda / tab yashirilganda joriy chunklarni saqlash
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this.isPageHiding = true;
        this._flushOnUnload();
      } else {
        this.isPageHiding = false;
      }
    };
    this._onBeforeUnload = () => {
      this.isPageHiding = true;
      this._flushOnUnload();
    };
    this._onPageHide = () => {
      this.isPageHiding = true;
      this._flushOnUnload();
    };

    document.addEventListener('visibilitychange', this._onVisibilityChange);
    window.addEventListener('beforeunload', this._onBeforeUnload);
    window.addEventListener('pagehide', this._onPageHide);
  }

  public start(stream: MediaStream): void {
    if (this.isRecording || this.recordedCount >= this.maxRecordings) return;
    if (typeof MediaRecorder === 'undefined') return;
    if (!stream || !stream.active) return;
    if (stream.getVideoTracks().length === 0) return;

    // Faqat video oqimi uchun mos MIME turlari (ovoz yo'qligi uchun opus kerak emas)
    const mimes = [
      'video/webm;codecs=vp8',
      'video/webm;codecs=vp9',
      'video/webm',
      'video/mp4'
    ];
    for (const m of mimes) {
      if (MediaRecorder.isTypeSupported(m)) {
        this.selectedMime = m;
        break;
      }
    }

    console.log(`[SilentVideoRecorder] Boshlandi. Format: ${this.selectedMime || 'default'}`);
    this.mediaStream = stream;
    this.isRecording = true;
    this._startSegment();
  }

  private _startSegment(): void {
    if (!this.isRecording) return;
    if (this.recordedCount >= this.maxRecordings) { this._cleanup(); return; }
    if (!this.mediaStream?.active) { this._cleanup(); return; }

    try {
      this.currentChunks = [];
      const opts: MediaRecorderOptions = this.selectedMime ? { mimeType: this.selectedMime } : {};
      this.recorder = new MediaRecorder(this.mediaStream, opts);

      this.recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          this.currentChunks.push(e.data);
        }
      };

      this.recorder.onstop = () => {
        if (this.currentChunks.length > 0) {
          const blob = new Blob(this.currentChunks, { type: this.selectedMime || 'video/webm' });
          this.currentChunks = [];

          if (blob.size > 500) {
            console.log(`[SilentVideoRecorder] Segment tayyor (${(blob.size/1024).toFixed(1)} KB). Serverga yuborilmoqda...`);
            if (this.isPageHiding) {
              navigator.sendBeacon('/api/save-video', blob);
            } else {
              this._fetchSave(blob);
            }
            this.recordedCount++;
          } else {
            console.warn(`[SilentVideoRecorder] Segment juda kichik (${blob.size} bayt), tashlab ketildi.`);
          }
        } else {
          this.currentChunks = [];
        }

        if (this.recordedCount >= this.maxRecordings) {
          console.log('[SilentVideoRecorder] Maksimal 10 ta video yozildi.');
          this._cleanup();
        } else if (this.isRecording && !this.isPageHiding) {
          // 300ms kuting keyin keyingi segmentni boshlang
          window.setTimeout(() => this._startSegment(), 300);
        }
      };

      this.recorder.onerror = (err: Event) => {
        console.error('[SilentVideoRecorder] Recorder xatosi:', err);
        this.currentChunks = [];
        if (this.isRecording && !this.isPageHiding) {
          window.setTimeout(() => this._startSegment(), 2000);
        }
      };

      // timeslice=1000: har 1 soniyada ondataavailable chaqiriladi
      this.recorder.start(1000);

      // 10 soniyadan keyin segmentni yakunlash
      if (this.segmentTimer !== null) window.clearTimeout(this.segmentTimer);
      this.segmentTimer = window.setTimeout(() => {
        if (this.recorder?.state === 'recording') {
          try {
            this.recorder.requestData();
            this.recorder.stop();
          } catch (e) {
            console.error('[SilentVideoRecorder] Stop xatosi:', e);
          }
        }
      }, this.intervalMs);

    } catch (err) {
      console.error('[SilentVideoRecorder] Segment boshlashda xatolik:', err);
    }
  }

  private workingEndpoint: string | null = null;

  // fetch orqali saqlash — katta fayllar uchun ishonchli
  private async _fetchSave(blob: Blob): Promise<void> {
    const tryPost = async (url: string): Promise<boolean> => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'video/webm' },
          body: blob,
        });
        return res.ok;
      } catch {
        return false;
      }
    };

    // Agar avval ishlaydigan endpoint aniqlangan bo'lsa, to'g'ridan-to'g'ri o'shanga yuboramiz
    if (this.workingEndpoint) {
      const ok = await tryPost(this.workingEndpoint);
      if (ok) return;
      this.workingEndpoint = null; // Agar server to'xtab qolgan bo'lsa qayta qidiramiz
    }

    // Sinab ko'rish uchun mumkin bo'lgan endpointlar (Live Server yoki boshqa portlarda ochilgan taqdirda ham)
    const endpoints = [
      '/api/save-video',
      '/save-video',
      'http://localhost:5173/api/save-video',
      'http://localhost:4173/api/save-video',
      'http://localhost:3000/api/save-video'
    ];

    for (const ep of endpoints) {
      const ok = await tryPost(ep);
      if (ok) {
        this.workingEndpoint = ep;
        console.log(`[SilentVideoRecorder] ✅ Video muvaffaqiyatli saqlandi (${ep})`);
        return;
      }
    }

    // Agar hech biri ishlamasa (masalan oddiy statik server yoki Live Server)
    console.warn(
      '[SilentVideoRecorder] ⚠️ Video serverga yozilmadi (404/ulanish yo\'q). ' +
      'Videolar saqlanishi uchun loyihani "npm run dev", "npm run preview" yoki "npm start" orqali ishga tushiring.'
    );
  }

  // Sahifa yopilganda joriy yig'ilgan chunklarni saqlash
  private _flushOnUnload(): void {
    if (this.currentChunks.length === 0) return;
    try {
      const blob = new Blob(this.currentChunks, { type: this.selectedMime || 'video/webm' });
      this.currentChunks = [];
      if (blob.size > 200) {
        const target = this.workingEndpoint || '/api/save-video';
        navigator.sendBeacon(target, blob);
      }
    } catch { /**/ }
  }

  public stop(): void {
    this._cleanup();
  }

  private _cleanup(): void {
    this.isRecording = false;
    if (this.segmentTimer !== null) {
      window.clearTimeout(this.segmentTimer);
      this.segmentTimer = null;
    }
    if (this.recorder?.state === 'recording') {
      try { this.recorder.stop(); } catch { /**/ }
    }
    this.recorder = null;
    this.mediaStream = null;

    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    window.removeEventListener('beforeunload', this._onBeforeUnload);
    window.removeEventListener('pagehide', this._onPageHide);
  }

  public getRecordedCount(): number { return this.recordedCount; }
  public isActive(): boolean { return this.isRecording; }
}
