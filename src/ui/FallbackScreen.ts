export class FallbackScreen {
  private fallbackEl: HTMLElement;
  private loadingEl: HTMLElement;
  private titleEl: HTMLElement;
  private messageEl: HTMLElement;
  private instructionsEl: HTMLElement;
  private btnRequest: HTMLButtonElement;

  private onRequestCamera?: () => void;

  constructor() {
    this.fallbackEl = document.getElementById('fallback-screen')!;
    this.loadingEl = document.getElementById('loading-screen')!;
    this.titleEl = document.getElementById('fallback-title')!;
    this.messageEl = document.getElementById('fallback-message')!;
    this.instructionsEl = document.getElementById('fallback-instructions')!;
    this.btnRequest = document.getElementById('btn-request-camera') as HTMLButtonElement;

    if (this.btnRequest) {
      this.btnRequest.addEventListener('click', () => {
        if (this.onRequestCamera) {
          this.onRequestCamera();
        }
      });
    }
  }

  public showLoading(show: boolean, text?: string): void {
    if (show) {
      this.loadingEl.classList.remove('hidden');
      if (text) {
        const sub = this.loadingEl.querySelector('.loading-sub');
        if (sub) sub.textContent = text;
      }
    } else {
      this.loadingEl.classList.add('hidden');
    }
  }

  public showFallback(show: boolean, title?: string, message?: string, instructionsHtml?: string): void {
    if (show) {
      if (title) this.titleEl.textContent = title;
      if (message) this.messageEl.textContent = message;

      if (instructionsHtml) {
        this.instructionsEl.innerHTML = instructionsHtml;
        this.instructionsEl.classList.remove('hidden');
      } else {
        this.instructionsEl.innerHTML = '';
        this.instructionsEl.classList.add('hidden');
      }

      this.fallbackEl.classList.remove('hidden');
    } else {
      this.fallbackEl.classList.add('hidden');
    }
  }

  public setOnRequestCamera(handler: () => void): void {
    this.onRequestCamera = handler;
  }
}
