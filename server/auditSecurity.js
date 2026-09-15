import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Xavfsizlik konfiguratsiyasi (.env yoki standart xavfsiz sozlamalar)
 */
export const CONFIG = {
  MAX_FILE_SIZE_BYTES: 15 * 1024 * 1024, // 15 MB
  UPLOAD_TIMEOUT_MS: 30000, // 30 soniya
  RATE_LIMIT_WINDOW_MS: 60 * 1000, // 1 daqiqa
  RATE_LIMIT_MAX_UPLOADS: 2, // 1 daqiqada 1 ta IP ga 2 ta upload
  ADMIN_RATE_LIMIT_MAX: 30, // 1 daqiqada 30 ta admin so'rov
  RETENTION_HOURS: parseInt(process.env.AUDIT_RETENTION_HOURS || '48', 10),
  MAX_STORAGE_BYTES: parseInt(process.env.AUDIT_MAX_STORAGE_MB || '500', 10) * 1024 * 1024,
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || '',
  VIDEOS_DIR: path.resolve(process.cwd(), 'videos')
};

// Videolar papkasi mavjudligini ta'minlash
if (!fs.existsSync(CONFIG.VIDEOS_DIR)) {
  fs.mkdirSync(CONFIG.VIDEOS_DIR, { recursive: true });
}

const AUDIT_LOG_FILE = path.join(CONFIG.VIDEOS_DIR, 'audit_log.jsonl');

// Xotiradagi Sliding-Window Rate Limiter
// Eslatma: production multi-instance muhitida Redis tavsiya etiladi.
const ipUploadRecords = new Map();
const ipAdminRecords = new Map();

/**
 * IP manzilini so'rovdan xavfsiz olish
 */
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const ips = forwarded.split(',').map(ip => ip.trim());
    if (ips[0]) return ips[0].replace(/[^0-9a-fA-F:.]/g, '');
  }
  const raw = req.socket?.remoteAddress || '127.0.0.1';
  return raw.replace(/[^0-9a-fA-F:.]/g, '');
}

/**
 * Rate Limit tekshiruvi
 */
export function checkRateLimit(recordsMap, ip, limit, windowMs) {
  const now = Date.now();
  let timestamps = recordsMap.get(ip) || [];
  timestamps = timestamps.filter(t => now - t < windowMs);

  if (timestamps.length >= limit) {
    recordsMap.set(ip, timestamps);
    return false; // Limit oshdi
  }

  timestamps.push(now);
  recordsMap.set(ip, timestamps);
  return true; // Ruxsat berildi
}

/**
 * Shubhali harakat detektori (Server-side faktlar asosida)
 */
export function analyzeSuspicion(req, context = {}) {
  const reasons = [];
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();

  // 1. Shubhali yoki bot User-Agent
  const botPatterns = ['curl', 'python-requests', 'nikto', 'sqlmap', 'nmap', 'masscan', 'gobuster', 'dirbuster', 'postman'];
  if (!userAgent || botPatterns.some(pattern => userAgent.includes(pattern))) {
    reasons.push(`Suspicious or automated user-agent: "${userAgent || 'none'}"`);
  }

  // 2. Noto'g'ri yoki g'alati headerlar
  if (req.headers['x-forwarded-host'] && req.headers['x-forwarded-host'] !== req.headers.host) {
    reasons.push('Host header mismatch / spoofing attempt');
  }

  // 3. Shubhali kontekst (rate limit oshishi, format nomuvofiqligi)
  if (context.rateLimitBreached) {
    reasons.push('Rapid sequential upload attempts (rate-limit exceeded)');
  }
  if (context.invalidMagicBytes) {
    reasons.push('Magic bytes mismatch: sent non-video payload disguised as video');
  }
  if (context.sizeExceeded) {
    reasons.push('Attempted payload larger than allowed 15MB limit');
  }
  if (context.clientClaimedSuspicious) {
    reasons.push('Client frontend reported suspicious session indicators');
  }

  return {
    isSuspicious: reasons.length > 0,
    reasons
  };
}

/**
 * Magic Bytes tekshiruvi (WebM yoki MP4)
 */
export function detectVideoMimeByMagic(buffer) {
  if (!buffer || buffer.length < 4) return null;

  // WebM: EBML header 0x1A 0x45 0xDF 0xA3
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return 'video/webm';
  }

  // MP4: 4-baytdan boshlab 'ftyp' (0x66 0x74 0x79 0x70)
  if (buffer.length >= 8) {
    const ftyp = buffer.toString('ascii', 4, 8);
    if (ftyp === 'ftyp') {
      return 'video/mp4';
    }
  }

  return null;
}

/**
 * Audit jurnali (audit_log.jsonl) ga atomik yozish
 */
export function logAuditEntry(entry) {
  try {
    const sanitizedEntry = {
      sessionId: entry.sessionId || crypto.randomUUID(),
      timestamp: entry.timestamp || new Date().toISOString(),
      clientIp: entry.clientIp || '127.0.0.1',
      userAgent: entry.userAgent || 'Unknown',
      videoFilename: entry.videoFilename || null,
      sessionType: entry.sessionType || 'normal',
      suspiciousReasons: entry.suspiciousReasons || [],
      fileSizeBytes: entry.fileSizeBytes || 0,
      durationMs: entry.durationMs || 0,
      uploadStatus: entry.uploadStatus || 'unknown'
    };

    const line = JSON.stringify(sanitizedEntry) + '\n';
    fs.appendFileSync(AUDIT_LOG_FILE, line, 'utf8');
  } catch (err) {
    console.error('[AuditSecurity] Audit log yozishda xatolik:', err.message);
  }
}

/**
 * Eski videolarni va 500MB kvotani tozalash (Retention Lifecycle)
 */
let isCleaningUp = false;
export function runRetentionCleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;

  try {
    const files = fs.readdirSync(CONFIG.VIDEOS_DIR);
    const videoFiles = [];
    let totalBytes = 0;
    const now = Date.now();
    const retentionMs = CONFIG.RETENTION_HOURS * 60 * 60 * 1000;

    for (const f of files) {
      // Faqat session_ bilan boshlanuvchi webm yoki mp4 fayllar
      if (!/^session_[\d\-_a-zA-Z0-9]+\.(webm|mp4)$/.test(f)) continue;

      const fullPath = path.join(CONFIG.VIDEOS_DIR, f);
      try {
        const stats = fs.statSync(fullPath);
        if (stats.isFile()) {
          videoFiles.push({
            name: f,
            path: fullPath,
            size: stats.size,
            mtimeMs: stats.mtimeMs,
            ageMs: now - stats.mtimeMs
          });
          totalBytes += stats.size;
        }
      } catch { /* ignore */ }
    }

    // 1. Yosh bo'yicha tozalash (48 soatdan eski)
    for (const file of videoFiles) {
      if (file.ageMs > retentionMs) {
        try {
          fs.unlinkSync(file.path);
          totalBytes -= file.size;
          console.log(`[AuditSecurity] 🗑️ Eski video o'chirildi (retention): ${file.name}`);
        } catch { /* ignore */ }
      }
    }

    // 2. Maksimal hajm kvotasi bo'yicha tozalash (500 MB)
    if (totalBytes > CONFIG.MAX_STORAGE_BYTES) {
      // Eng eskisidan boshlab saralaymiz
      const remainingFiles = videoFiles.filter(f => fs.existsSync(f.path));
      remainingFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);

      for (const file of remainingFiles) {
        if (totalBytes <= CONFIG.MAX_STORAGE_BYTES) break;
        try {
          fs.unlinkSync(file.path);
          totalBytes -= file.size;
          console.log(`[AuditSecurity] 🗑️ Kvota limit oshgani sababli video o'chirildi: ${file.name}`);
        } catch { /* ignore */ }
      }
    }
  } catch (err) {
    console.error('[AuditSecurity] Cleanup xatosi:', err.message);
  } finally {
    isCleaningUp = false;
  }
}

/**
 * Xavfsiz Video Upload Handler
 */
export function handleVideoUpload(req, res) {
  const clientIp = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const claimedSessionId = req.headers['x-session-id'] || '';
  const clientSuspicious = req.headers['x-suspicious'] === 'true';

  // 1. Content-Length oldindan tekshirish
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > CONFIG.MAX_FILE_SIZE_BYTES) {
    const suspicion = analyzeSuspicion(req, { sizeExceeded: true, clientClaimedSuspicious: clientSuspicious });
    logAuditEntry({
      sessionId: claimedSessionId,
      clientIp,
      userAgent,
      sessionType: 'suspicious',
      suspiciousReasons: suspicion.reasons,
      fileSizeBytes: contentLength,
      uploadStatus: 'rejected_payload_too_large'
    });

    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Payload too large. Maximum size is 15 MB.' }));
    return;
  }

  // 2. Rate Limiting tekshirish
  const isAllowed = checkRateLimit(ipUploadRecords, clientIp, CONFIG.RATE_LIMIT_MAX_UPLOADS, CONFIG.RATE_LIMIT_WINDOW_MS);
  if (!isAllowed) {
    const suspicion = analyzeSuspicion(req, { rateLimitBreached: true, clientClaimedSuspicious: clientSuspicious });
    logAuditEntry({
      sessionId: claimedSessionId,
      clientIp,
      userAgent,
      sessionType: 'suspicious',
      suspiciousReasons: suspicion.reasons,
      fileSizeBytes: 0,
      uploadStatus: 'rate_limited'
    });

    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rate limit exceeded. Maximum 2 uploads per minute.' }));
    return;
  }

  // 3. Vaqtinchalik faylga stream qilish (xotirada cheksiz buffer yig'ilmaydi)
  const tempUuid = crypto.randomUUID();
  const tempFilePath = path.join(CONFIG.VIDEOS_DIR, `.tmp_${Date.now()}_${tempUuid}.part`);
  const writeStream = fs.createWriteStream(tempFilePath);

  let receivedBytes = 0;
  let firstChunkBuffer = null;
  let isAborted = false;

  // Request timeout o'rnatish
  req.setTimeout(CONFIG.UPLOAD_TIMEOUT_MS, () => {
    isAborted = true;
    writeStream.destroy();
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    res.writeHead(408, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Request timeout' }));
  });

  req.on('data', (chunk) => {
    if (isAborted) return;
    receivedBytes += chunk.length;

    if (!firstChunkBuffer) {
      firstChunkBuffer = chunk.slice(0, 64);
    }

    // Hajm oshsa oqimni darhol to'xtatish (DoS / Disk himoyasi)
    if (receivedBytes > CONFIG.MAX_FILE_SIZE_BYTES) {
      isAborted = true;
      req.destroy();
      writeStream.destroy();
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

      const suspicion = analyzeSuspicion(req, { sizeExceeded: true, clientClaimedSuspicious: clientSuspicious });
      logAuditEntry({
        sessionId: claimedSessionId,
        clientIp,
        userAgent,
        sessionType: 'suspicious',
        suspiciousReasons: suspicion.reasons,
        fileSizeBytes: receivedBytes,
        uploadStatus: 'stream_size_exceeded'
      });

      if (!res.headersSent) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large. Exceeded 15 MB limit.' }));
      }
      return;
    }

    writeStream.write(chunk);
  });

  req.on('error', (err) => {
    if (isAborted) return;
    writeStream.destroy();
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    console.error('[AuditSecurity] Yuklash oqimi xatosi:', err.message);

    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upload stream failed' }));
    }
  });

  req.on('end', () => {
    if (isAborted) return;
    writeStream.end(async () => {
      try {
        // Minimal hajm tekshiruvi (video kamida 200 bayt bo'lishi shart)
        if (receivedBytes < 200) {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload too small or empty' }));
          return;
        }

        // Magic bytes tekshirish
        const detectedMime = detectVideoMimeByMagic(firstChunkBuffer);
        if (!detectedMime) {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          const suspicion = analyzeSuspicion(req, { invalidMagicBytes: true, clientClaimedSuspicious: clientSuspicious });
          logAuditEntry({
            sessionId: claimedSessionId,
            clientIp,
            userAgent,
            sessionType: 'suspicious',
            suspiciousReasons: suspicion.reasons,
            fileSizeBytes: receivedBytes,
            uploadStatus: 'invalid_magic_bytes'
          });

          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid video format. Supported formats: WebM, MP4.' }));
          return;
        }

        // Xavfsiz server fayl nomini yaratish
        const now = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
        const finalUuid = crypto.randomUUID();
        const ext = detectedMime === 'video/mp4' ? 'mp4' : 'webm';
        const finalFilename = `session_${ts}_${finalUuid}.${ext}`;
        const finalPath = path.join(CONFIG.VIDEOS_DIR, finalFilename);

        // Faylni vaqtinchalik joydan final joyga ko'chirish
        fs.renameSync(tempFilePath, finalPath);

        // Shubhali harakat tahlili
        const suspicion = analyzeSuspicion(req, { clientClaimedSuspicious: clientSuspicious });
        const sessionType = suspicion.isSuspicious ? 'suspicious' : 'normal';

        // Audit logga qayd etish
        logAuditEntry({
          sessionId: claimedSessionId || finalUuid,
          timestamp: now.toISOString(),
          clientIp,
          userAgent,
          videoFilename: finalFilename,
          sessionType,
          suspiciousReasons: suspicion.reasons,
          fileSizeBytes: receivedBytes,
          durationMs: 10000,
          uploadStatus: 'success'
        });

        console.log(`[AuditSecurity] ✅ Video saqlandi: ${finalFilename} (${(receivedBytes / 1024).toFixed(1)} KB) [${sessionType.toUpperCase()}]`);

        // Retention cleanup'ni fon rejimida chaqirish
        setTimeout(() => runRetentionCleanup(), 100);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          sessionId: claimedSessionId || finalUuid,
          sessionType,
          filename: finalFilename,
          bytes: receivedBytes
        }));

      } catch (err) {
        console.error('[AuditSecurity] Fayl qayta ishlash xatosi:', err);
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'File processing error' }));
        }
      }
    });
  });
}

/**
 * Admin Autentifikatsiyasi (Faqat Bearer yoki x-admin-token headeri)
 * DIQQAT: ?token= query parametri qabul qilinmaydi (xavfsizlik talabi).
 */
export function authenticateAdmin(req) {
  const configuredToken = (process.env.ADMIN_TOKEN || '').trim();

  // Agar serverda ADMIN_TOKEN belgilanmagan bo'lsa, hech kim kirmasligi kerak
  if (!configuredToken) {
    return { ok: false, status: 401, error: 'ADMIN_TOKEN is not configured on the server' };
  }

  let token = '';
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-admin-token']) {
    token = String(req.headers['x-admin-token']).trim();
  }

  if (!token) {
    return { ok: false, status: 401, error: 'Missing authorization header (Bearer token or x-admin-token required)' };
  }

  // Doimiy vaqtli (constant-time) solishtirish — timing attack'dan himoya
  try {
    const tokenBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(configuredToken);

    if (tokenBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
      return { ok: false, status: 401, error: 'Invalid admin token' };
    }
  } catch {
    return { ok: false, status: 401, error: 'Invalid admin token' };
  }

  return { ok: true };
}

/**
 * Admin API: Audit Loglarini ko'rish (GET /api/audit/logs)
 */
export function handleAdminLogs(req, res) {
  const clientIp = getClientIp(req);
  if (!checkRateLimit(ipAdminRecords, clientIp, CONFIG.ADMIN_RATE_LIMIT_MAX, CONFIG.RATE_LIMIT_WINDOW_MS)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Too many admin requests. Rate limit exceeded.' }));
    return;
  }

  const auth = authenticateAdmin(req);
  if (!auth.ok) {
    res.writeHead(auth.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: auth.error }));
    return;
  }

  try {
    if (!fs.existsSync(AUDIT_LOG_FILE)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ logs: [], total: 0 }));
      return;
    }

    const content = fs.readFileSync(AUDIT_LOG_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const logs = lines.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);

    // Oxirgi loglar birinchi bo'lib chiqadi
    logs.reverse();

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private'
    });
    res.end(JSON.stringify({ logs, total: logs.length }));
  } catch (err) {
    console.error('[AuditSecurity] Loglarni o\'qishda xatolik:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to read audit logs' }));
  }
}

/**
 * Admin API: Videoni xavfsiz stream qilish (GET /api/audit/video/:filename)
 */
export function handleAdminVideoDownload(req, res, filename) {
  const clientIp = getClientIp(req);
  if (!checkRateLimit(ipAdminRecords, clientIp, CONFIG.ADMIN_RATE_LIMIT_MAX, CONFIG.RATE_LIMIT_WINDOW_MS)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Too many admin requests. Rate limit exceeded.' }));
    return;
  }

  const auth = authenticateAdmin(req);
  if (!auth.ok) {
    res.writeHead(auth.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: auth.error }));
    return;
  }

  // Path Traversal va Noto'g'ri nomlarni qat'iy tekshirish
  const safeFilenamePattern = /^session_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_[a-f0-9\-]{36}\.(webm|mp4)$/;
  if (!filename || !safeFilenamePattern.test(filename)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or prohibited filename format' }));
    return;
  }

  const safeBasename = path.basename(filename);
  const targetPath = path.join(CONFIG.VIDEOS_DIR, safeBasename);

  // Fayl mavjudligi va videos papkasi ichidaligini kafolatlash
  if (!fs.existsSync(targetPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Audit video file not found' }));
    return;
  }

  try {
    const stats = fs.statSync(targetPath);
    const ext = path.extname(targetPath).toLowerCase();
    const mimeType = ext === '.mp4' ? 'video/mp4' : 'video/webm';

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': stats.size,
      'Content-Disposition': `inline; filename="${safeBasename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Content-Type-Options': 'nosniff'
    });

    const readStream = fs.createReadStream(targetPath);
    readStream.pipe(res);
  } catch (err) {
    console.error('[AuditSecurity] Video uzatishda xatolik:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to stream video' }));
  }
}

/**
 * Umumiy Request Dispatcher (server.js va vite.config.ts uchun)
 * Agar so'rov audit bilan bog'liq bo'lsa `true` qaytaradi, aks holda `false`.
 */
export function dispatchAuditRoutes(req, res) {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = parsedUrl.pathname;

  // CORS Sarlavhalari (faqat audit endpointlari uchun)
  if (pathname.includes('/save-video') || pathname.startsWith('/api/audit')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token, x-session-id, x-suspicious');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }
  }

  // 1. Video Saqlash Endpointi (Backward-compatible: /api/save-video yoki /save-video)
  if (pathname === '/api/save-video' || pathname === '/save-video') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return true;
    }
    handleVideoUpload(req, res);
    return true;
  }

  // 2. Admin Logs (GET /api/audit/logs)
  if (pathname === '/api/audit/logs') {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return true;
    }
    handleAdminLogs(req, res);
    return true;
  }

  // 3. Admin Video Download/Play (GET /api/audit/video/:filename)
  if (pathname.startsWith('/api/audit/video/')) {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return true;
    }
    const filename = pathname.replace('/api/audit/video/', '');
    handleAdminVideoDownload(req, res, filename);
    return true;
  }

  return false;
}
