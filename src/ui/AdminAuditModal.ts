/**
 * AdminAuditModal — Xavfsiz Audit Jurnali va Video Ko'rish Interfeysi
 */
export class AdminAuditModal {
  private modalEl: HTMLElement;
  private authViewEl: HTMLElement;
  private dataViewEl: HTMLElement;
  private inputTokenEl: HTMLInputElement;
  private btnVerifyEl: HTMLButtonElement;
  private authErrorEl: HTMLElement;
  private btnCloseEl: HTMLElement;
  private btnRefreshEl: HTMLElement;
  private tbodyEl: HTMLElement;
  private totalCountEl: HTMLElement;

  private playerContainerEl: HTMLElement;
  private playerLabelEl: HTMLElement;
  private videoPlayerEl: HTMLVideoElement;
  private btnClosePlayerEl: HTMLElement;

  private currentToken: string = '';
  private activeVideoBlobUrl: string | null = null;

  constructor() {
    this.modalEl = document.getElementById('admin-audit-modal')!;
    this.authViewEl = document.getElementById('audit-auth-view')!;
    this.dataViewEl = document.getElementById('audit-data-view')!;
    this.inputTokenEl = document.getElementById('input-admin-token') as HTMLInputElement;
    this.btnVerifyEl = document.getElementById('btn-verify-admin-token') as HTMLButtonElement;
    this.authErrorEl = document.getElementById('audit-auth-error')!;
    this.btnCloseEl = document.getElementById('btn-close-audit-modal')!;
    this.btnRefreshEl = document.getElementById('btn-refresh-audit') as HTMLButtonElement;
    this.tbodyEl = document.getElementById('audit-logs-tbody')!;
    this.totalCountEl = document.getElementById('audit-total-count')!;

    this.playerContainerEl = document.getElementById('audit-player-container')!;
    this.playerLabelEl = document.getElementById('audit-player-label')!;
    this.videoPlayerEl = document.getElementById('audit-video-player') as HTMLVideoElement;
    this.btnClosePlayerEl = document.getElementById('btn-close-audit-player') as HTMLButtonElement;

    // LocalStorage dan saqlangan token bormi tekshirish
    try {
      const savedToken = sessionStorage.getItem('audit_admin_token');
      if (savedToken) {
        this.currentToken = savedToken;
        this.inputTokenEl.value = savedToken;
      }
    } catch { /* ignore */ }

    this.initEvents();
  }

  private initEvents(): void {
    this.btnCloseEl.addEventListener('click', () => this.close());

    this.btnVerifyEl.addEventListener('click', () => {
      const token = this.inputTokenEl.value.trim();
      if (!token) {
        this.showError('Iltimos, admin tokenini kiriting');
        return;
      }
      this.currentToken = token;
      this.fetchLogs();
    });

    this.inputTokenEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.btnVerifyEl.click();
      }
    });

    this.btnRefreshEl.addEventListener('click', () => {
      this.fetchLogs();
    });

    this.btnClosePlayerEl.addEventListener('click', () => {
      this.stopAndClosePlayer();
    });
  }

  public open(): void {
    this.modalEl.classList.remove('hidden');
    if (this.currentToken) {
      this.fetchLogs();
    } else {
      this.showAuthView();
    }
  }

  public close(): void {
    this.stopAndClosePlayer();
    this.modalEl.classList.add('hidden');
  }

  private showAuthView(): void {
    this.authViewEl.classList.remove('hidden');
    this.dataViewEl.classList.add('hidden');
    this.authErrorEl.classList.add('hidden');
    this.inputTokenEl.focus();
  }

  private showError(msg: string): void {
    this.authErrorEl.textContent = msg;
    this.authErrorEl.classList.remove('hidden');
  }

  private async fetchLogs(): Promise<void> {
    this.btnVerifyEl.disabled = true;
    this.btnVerifyEl.textContent = 'Tekshirilmoqda...';
    this.authErrorEl.classList.add('hidden');

    try {
      const res = await fetch('/api/audit/logs', {
        headers: {
          'Authorization': `Bearer ${this.currentToken}`
        }
      });

      if (res.status === 401 || res.status === 403) {
        this.showError('Noto\'g\'ri token yoki serverda ADMIN_TOKEN belgilanmagan.');
        this.showAuthView();
        return;
      }

      if (!res.ok) {
        this.showError(`Xatolik yuz berdi (${res.status})`);
        return;
      }

      const data = await res.json();
      try {
        sessionStorage.setItem('audit_admin_token', this.currentToken);
      } catch { /* ignore */ }

      this.renderLogs(data.logs || []);
      this.authViewEl.classList.add('hidden');
      this.dataViewEl.classList.remove('hidden');

    } catch (err: any) {
      this.showError('Serverga ulanib bo\'lmadi: ' + (err.message || 'Tarmoq xatosi'));
    } finally {
      this.btnVerifyEl.disabled = false;
      this.btnVerifyEl.textContent = 'Kirish';
    }
  }

  private renderLogs(logs: any[]): void {
    this.totalCountEl.textContent = `Jami yozuvlar: ${logs.length}`;
    this.tbodyEl.innerHTML = '';

    if (logs.length === 0) {
      this.tbodyEl.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--text-muted);">Hozircha audit yozuvlari mavjud emas</td></tr>`;
      return;
    }

    logs.forEach((item) => {
      const tr = document.createElement('tr');
      const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleString('uz-UZ') : '--';
      const isSuspicious = item.sessionType === 'suspicious';
      const statusClass = isSuspicious ? 'status-suspicious' : 'status-normal';
      const statusLabel = isSuspicious ? 'SHUBHALI' : 'ODDIY';
      const sizeKb = item.fileSizeBytes ? (item.fileSizeBytes / 1024).toFixed(1) + ' KB' : '0 KB';
      const hasVideo = !!item.videoFilename;

      const suspiciousTooltip = (item.suspiciousReasons && item.suspiciousReasons.length > 0)
        ? `title="${item.suspiciousReasons.join(', ')}"`
        : '';

      tr.innerHTML = `
        <td style="white-space: nowrap;">${dateStr}</td>
        <td><code>${item.clientIp || 'Unknown'}</code></td>
        <td><span class="audit-status-badge ${statusClass}" ${suspiciousTooltip}>${statusLabel}</span></td>
        <td>${sizeKb}</td>
        <td>
          ${hasVideo ? `<button class="btn-play-video" data-file="${item.videoFilename}">▶ Ko'rish</button>` : '<span style="color:var(--text-muted);">-</span>'}
        </td>
      `;

      if (hasVideo) {
        const btnPlay = tr.querySelector('.btn-play-video') as HTMLButtonElement;
        btnPlay.addEventListener('click', () => {
          this.playVideo(item.videoFilename);
        });
      }

      this.tbodyEl.appendChild(tr);
    });
  }

  /**
   * Video faylni xavfsiz Authorization headeri orqali yuklab olib blob URL sifatida o'ynatish
   */
  private async playVideo(filename: string): Promise<void> {
    this.stopAndClosePlayer();
    this.playerContainerEl.classList.remove('hidden');
    this.playerLabelEl.textContent = `Yuklanmoqda: ${filename}...`;

    try {
      const res = await fetch(`/api/audit/video/${encodeURIComponent(filename)}`, {
        headers: {
          'Authorization': `Bearer ${this.currentToken}`
        }
      });

      if (!res.ok) {
        alert(`Videoni ochib bo'lmadi (${res.status}). Ruxsat berilmagan yoki fayl o'chirilgan.`);
        this.stopAndClosePlayer();
        return;
      }

      const blob = await res.blob();
      this.activeVideoBlobUrl = URL.createObjectURL(blob);
      this.videoPlayerEl.src = this.activeVideoBlobUrl;
      this.playerLabelEl.textContent = `Ijro: ${filename}`;
      this.videoPlayerEl.play().catch(() => {});

    } catch (err: any) {
      alert('Video yuklashda xatolik: ' + err.message);
      this.stopAndClosePlayer();
    }
  }

  private stopAndClosePlayer(): void {
    if (this.videoPlayerEl) {
      this.videoPlayerEl.pause();
      this.videoPlayerEl.removeAttribute('src');
      this.videoPlayerEl.load();
    }
    if (this.activeVideoBlobUrl) {
      URL.revokeObjectURL(this.activeVideoBlobUrl);
      this.activeVideoBlobUrl = null;
    }
    this.playerContainerEl.classList.add('hidden');
  }
}
