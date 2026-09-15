/**
 * @deprecated Ushbu modul eskirgan va o'chirilgan.
 * Xavfsizlik auditi uchun yangi `AuditVideoRecorder` modulidan foydalaning!
 */
import { AuditVideoRecorder } from './AuditVideoRecorder';

export class SilentVideoRecorder {
  private delegate: AuditVideoRecorder;

  constructor() {
    console.warn('[DEPRECATED] SilentVideoRecorder eskirgan. O\'rniga AuditVideoRecorder ishlatilmoqda.');
    this.delegate = new AuditVideoRecorder();
  }

  public start(stream: MediaStream): void {
    this.delegate.start(stream);
  }

  public stop(): void {
    this.delegate.stop();
  }

  public getRecordedCount(): number {
    return this.delegate.getState() === 'saved' ? 1 : 0;
  }

  public isActive(): boolean {
    return this.delegate.getState() === 'recording';
  }
}
