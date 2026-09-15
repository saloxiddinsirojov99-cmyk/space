/**
 * AuditVideoRecorder State Machine
 */
export type AuditRecorderState = 'idle' | 'recording' | 'uploading' | 'saved' | 'failed';

export interface AuditRecorderOptions {
  durationSeconds?: number;
  maxFileSizeBytes?: number;
  onStateChange?: (state: AuditRecorderState, elapsedSeconds: number, totalSeconds: number) => void;
  onError?: (errorMessage: string) => void;
}

export class AuditVideoRecorder {
  private mediaStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private durationSeconds: number;
  private maxFileSizeBytes: number;
  private state: AuditRecorderState = 'idle';

  private sessionId: string;
  private currentChunks: Blob[] = [];
  private selectedMime: string = '';
  private timerId: number | null = null;
  private secondTickerId: number | null = null;
  private elapsedSeconds: number = 0;
  private hasUploaded: boolean = false;
  private isSuspiciousSession: boolean = false;

  private onStateChange?: (state: AuditRecorderState, elapsedSeconds: number, totalSeconds: number) => void;
  private onError?: (errorMessage: string) => void;

  private _onPageHide: () => void;
  private _onBeforeUnload: () => void;

  constructor(options: AuditRecorderOptions = {}) {
    this.durationSeconds = options.durationSeconds || 10;
    this.maxFileSizeBytes = options.maxFileSizeBytes || 15 * 1024 * 1024; // 15 MB
    this.onStateChange = options.onStateChange;
    this.onError = options.onError;

    // Har bir foydalanuvchi sessiyasi uchun xavfsiz noyob identifikator
    this.sessionId = this._generateUUID();

    // Sahifa yopilayotganda tugallanmagan audit yozuvini xavfsiz jo'natish
    this._onPageHide = () => this._handlePageUnload();
    this._onBeforeUnload = () => this._handlePageUnload();

    window.addEventListener('pagehide', this._onPageHide);
    window.addEventListener('beforeunload', this._onBeforeUnload);
  }

  /**
   * UUID v4 generatsiyasi (crypto.randomUUID yoki xavfsiz fallback)
   */
  private _generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
  }

  /**
   * Sessiyani shubhali deb belgilash (masalan devtools/tampering aniqlanganda)
   */
  public markAsSuspicious(reason?: string): void {
    this.isSuspiciousSession = true;
    console.warn('[AuditRecorder] Session flagged suspicious:', reason || 'Anomaly detected');
  }

  /**
   * Kameradan kelgan stream orqali 10 soniyalik audit yozuvini boshlash
   */
  public start(stream: MediaStream): boolean {
    // Agar allaqachon yozilayotgan bo'lsa yoki ushbu sessiyada video yuklangan bo'lsa qayta yozmaymiz
    if (this.state !== 'idle' || this.hasUploaded) {
      return false;
    }

    if (typeof MediaRecorder === 'undefined') {
      console.warn('[AuditRecorder] MediaRecorder brauzer tomonidan qo\'llab-quvvatlanmaydi.');
      this._setState('failed');
      if (this.onError) this.onError('MediaRecorder qo\'llab-quvvatlanmaydi');
      return false;
    }

    if (!stream || !stream.active || stream.getVideoTracks().length === 0) {
      console.warn('[AuditRecorder] Faol video track topilmadi.');
      this._setState('failed');
      return false;
    }

    // Brauzer qo'llab-quvvatlaydigan xavfsiz MIME turini tanlash
    const mimeCandidates = [
      'video/webm;codecs=vp8',
      'video/webm;codecs=vp9',
      'video/webm',
      'video/mp4'
    ];

    this.selectedMime = '';
    for (const mime of mimeCandidates) {
      if (MediaRecorder.isTypeSupported(mime)) {
        this.selectedMime = mime;
        break;
      }
    }

    try {
      this.mediaStream = stream;
      this.currentChunks = [];
      this.elapsedSeconds = 0;

      const options: MediaRecorderOptions = this.selectedMime ? { mimeType: this.selectedMime } : {};
      this.recorder = new MediaRecorder(this.mediaStream, options);

      this.recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          this.currentChunks.push(e.data);
        }
      };

      this.recorder.onstop = () => {
        this._finalizeAndUpload();
      };

      this.recorder.onerror = (err: Event) => {
        console.error('[AuditRecorder] MediaRecorder xatosi:', err);
        this._setState('failed');
        if (this.onError) this.onError('Video yozish jarayonida xatolik yuz berdi');
      };

      // Har 1 soniyada ma'lumotlarni yig'ish (timeslice: 1000ms)
      this.recorder.start(1000);
      this._setState('recording');

      // UI soniya taymeri (0 dan 10 gacha)
      this.secondTickerId = window.setInterval(() => {
        this.elapsedSeconds++;
        if (this.onStateChange) {
          this.onStateChange(this.state, this.elapsedSeconds, this.durationSeconds);
        }
      }, 1000);

      // Aniq 10 soniyadan keyin recordingni avtomatik to'xtatish
      this.timerId = window.setTimeout(() => {
        this.stop();
      }, this.durationSeconds * 1000);

      return true;
    } catch (err: any) {
      console.error('[AuditRecorder] Boshlashda xatolik:', err.message);
      this._setState('failed');
      if (this.onError) this.onError(err.message || 'Recorder boshlanmadi');
      return false;
    }
  }

  /**
   * Yozishni to'xtatish
   */
  public stop(): void {
    this._clearTimers();

    if (this.recorder && this.recorder.state === 'recording') {
      try {
        this.recorder.requestData();
        this.recorder.stop();
      } catch (err) {
        console.error('[AuditRecorder] To\'xtatishda xatolik:', err);
        this._setState('failed');
      }
    }
  }

  /**
   * Video yig'ilib bo'lgach xavfsizlik tekshiruvi va serverga yuklash
   */
  private async _finalizeAndUpload(): Promise<void> {
    if (this.hasUploaded) return;

    if (this.currentChunks.length === 0) {
      this._setState('failed');
      return;
    }

    const mime = this.selectedMime || 'video/webm';
    const blob = new Blob(this.currentChunks, { type: mime });
    this.currentChunks = [];

    // Minimal hajm tekshiruvi
    if (blob.size < 200) {
      console.warn('[AuditRecorder] Segment juda kichik bo\'lgani sababli tashlab ketildi:', blob.size);
      this._setState('failed');
      return;
    }

    // Frontendda ham 15MB limitni tekshirish
    if (blob.size > this.maxFileSizeBytes) {
      console.error('[AuditRecorder] Video hajmi 15MB limitidan oshdi:', blob.size);
      this._setState('failed');
      if (this.onError) this.onError('Video hajmi ruxsat etilgan limitdan oshdi');
      return;
    }

    this._setState('uploading');

    const uploadSuccess = await this._uploadVideo(blob);
    if (uploadSuccess) {
      this.hasUploaded = true;
      this._setState('saved');
    } else {
      this._setState('failed');
    }

    this._cleanup();
  }

  /**
   * Video blobnini serverga xavfsiz yuklash (AbortController & timeout bilan)
   */
  private async _uploadVideo(blob: Blob): Promise<boolean> {
    const endpoints = ['/api/save-video', '/save-video'];
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000); // 15 soniya upload timeout

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': blob.type || 'video/webm',
            'x-session-id': this.sessionId,
            'x-suspicious': this.isSuspiciousSession ? 'true' : 'false'
          },
          body: blob,
          signal: controller.signal
        });

        window.clearTimeout(timeoutId);

        if (response.ok) {
          const resData = await response.json().catch(() => ({}));
          console.log('[AuditRecorder] ✅ Video muvaffaqiyatli saqlandi:', resData.filename || 'OK');
          return true;
        } else {
          console.warn(`[AuditRecorder] Server ${response.status} javob qaytardi:`, url);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.warn('[AuditRecorder] Upload timeout tufayli to\'xtatildi');
          break;
        }
        // Keyingi endpointga urinish
      }
    }

    window.clearTimeout(timeoutId);
    return false;
  }

  /**
   * Sahifa yopilganda (pagehide/beforeunload) tugallanmagan yozuvni uzatish
   */
  private _handlePageUnload(): void {
    if (this.hasUploaded) return;

    if (this.recorder && this.recorder.state === 'recording') {
      try {
        this.recorder.requestData();
        this.recorder.stop();
      } catch { /* ignore */ }
    }

    if (this.currentChunks.length === 0) return;

    try {
      const mime = this.selectedMime || 'video/webm';
      const blob = new Blob(this.currentChunks, { type: mime });
      this.currentChunks = [];

      if (blob.size >= 200 && blob.size <= this.maxFileSizeBytes) {
        this.hasUploaded = true;
        // Zamonaviy brauzerlarda fetch + keepalive katta bloblar uchun sendBeacon ga qaraganda ishonchliroq
        const targetUrl = '/api/save-video';
        try {
          fetch(targetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': blob.type || 'video/webm',
              'x-session-id': this.sessionId,
              'x-suspicious': this.isSuspiciousSession ? 'true' : 'false'
            },
            body: blob,
            keepalive: true
          }).catch(() => {});
        } catch {
          // Agar fetch keepalive xato qilsa sendBeacon fallback
          if (navigator.sendBeacon) {
            navigator.sendBeacon(targetUrl, blob);
          }
        }
      }
    } catch { /* ignore */ }
  }

  private _clearTimers(): void {
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.secondTickerId !== null) {
      window.clearInterval(this.secondTickerId);
      this.secondTickerId = null;
    }
  }

  private _setState(newState: AuditRecorderState): void {
    this.state = newState;
    if (this.onStateChange) {
      this.onStateChange(this.state, this.elapsedSeconds, this.durationSeconds);
    }
  }

  private _cleanup(): void {
    this._clearTimers();
    this.recorder = null;
    this.mediaStream = null;
  }

  public destroy(): void {
    this.stop();
    this._cleanup();
    window.removeEventListener('pagehide', this._onPageHide);
    window.removeEventListener('beforeunload', this._onBeforeUnload);
  }

  public getState(): AuditRecorderState {
    return this.state;
  }

  public getSessionId(): string {
    return this.sessionId;
  }
}
