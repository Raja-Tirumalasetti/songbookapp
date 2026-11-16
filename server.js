const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const SONGS_FILE = path.join(PUBLIC_DIR, 'songs.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const MIN_ADMIN_PASSWORD_LENGTH = 16;
const ADMIN_SESSION_TTL = 12 * 60 * 60 * 1000;
const adminSessions = new Map();
const adminLoginAttempts = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
};

function readSongsSafe() {
  try {
    if (!fs.existsSync(SONGS_FILE)) return [];
    const content = fs.readFileSync(SONGS_FILE, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Error reading songs.json:', err);
    return [];
  }
}

function writeSongsSafe(songs) {
  try {
    fs.writeFileSync(SONGS_FILE, JSON.stringify(songs, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing songs.json:', err);
    return false;
  }
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || ('song-' + Date.now().toString(36));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) { // 5MB limit
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function getAdminSession(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  const sessionCookie = cookies.map(cookie => cookie.trim()).find(cookie => cookie.startsWith('mvs_admin_session='));
  if (!sessionCookie) return null;

  const sessionId = sessionCookie.slice('mvs_admin_session='.length);
  const expiresAt = adminSessions.get(sessionId);
  if (!expiresAt || expiresAt <= Date.now()) {
    adminSessions.delete(sessionId);
    return null;
  }
  return sessionId;
}

function requireAdmin(req, res) {
  if (getAdminSession(req)) return true;
  sendJson(res, 401, { ok: false, error: 'Administrator sign-in required' });
  return false;
}

function canAttemptAdminLogin(req) {
  const address = req.socket.remoteAddress || 'unknown';
  const attempt = adminLoginAttempts.get(address);
  if (!attempt || attempt.resetAt <= Date.now()) {
    adminLoginAttempts.delete(address);
    return true;
  }
  return attempt.count < 10;
}

function recordAdminLoginFailure(req) {
  const address = req.socket.remoteAddress || 'unknown';
  const attempt = adminLoginAttempts.get(address);
  if (!attempt || attempt.resetAt <= Date.now()) {
    adminLoginAttempts.set(address, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
    return;
  }
  attempt.count += 1;
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return sendJson(res, 400, { ok: false, error: 'Invalid request path' });
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // API Routes
  if (pathname === '/api/status') {
    const songs = readSongsSafe();
    return sendJson(res, 200, {
      ok: true,
      name: 'Maranatha Visvasa Samajam Songbook API',
      church: 'Maranatha Visvasa Samajam',
      songsCount: songs.length,
      time: new Date().toISOString()
    });
  }

  if (pathname === '/api/admin/status' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      configured: ADMIN_PASSWORD.length >= MIN_ADMIN_PASSWORD_LENGTH,
      authenticated: Boolean(getAdminSession(req))
    });
  }

  if (pathname === '/api/admin/login' && req.method === 'POST') {
    if (ADMIN_PASSWORD.length < MIN_ADMIN_PASSWORD_LENGTH) {
      return sendJson(res, 503, { ok: false, error: 'Configure an administrator password with at least 16 characters' });
    }
    if (!canAttemptAdminLogin(req)) {
      return sendJson(res, 429, { ok: false, error: 'Too many sign-in attempts. Try again later.' });
    }

    try {
      const body = await parseBody(req);
      const submitted = Buffer.from(String(body.password || ''));
      const expected = Buffer.from(ADMIN_PASSWORD);
      const valid = submitted.length === expected.length && crypto.timingSafeEqual(submitted, expected);
      if (!valid) {
        recordAdminLoginFailure(req);
        return sendJson(res, 401, { ok: false, error: 'Invalid administrator password' });
      }

      adminLoginAttempts.delete(req.socket.remoteAddress || 'unknown');
      const sessionId = crypto.randomBytes(32).toString('hex');
      adminSessions.set(sessionId, Date.now() + ADMIN_SESSION_TTL);
      const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `mvs_admin_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ADMIN_SESSION_TTL / 1000}${secure}`);
      return sendJson(res, 200, { ok: true, authenticated: true });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message || 'Invalid request' });
    }
  }

  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    const sessionId = getAdminSession(req);
    if (sessionId) adminSessions.delete(sessionId);
    res.setHeader('Set-Cookie', 'mvs_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/songs') {
    if (req.method === 'GET') {
      const songs = readSongsSafe();
      return sendJson(res, 200, songs);
    }

    if (req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      try {
        const body = await parseBody(req);
        if (!body.title || !body.title.trim()) {
          return sendJson(res, 400, { ok: false, error: 'Song title is required' });
        }

        const songs = readSongsSafe();
        const rawId = body.id ? slugify(body.id) : slugify(body.title);
        let id = rawId;
        let counter = 1;
        while (songs.some(s => s.id === id)) {
          id = `${rawId}-${counter++}`;
        }

        const newSong = {
          id,
          day: Number(body.day) || 1,
          title: body.title.trim(),
          artist: (body.artist || 'Maranatha Worship').trim(),
          album: (body.album || 'Maranatha Songs').trim(),
          category: (body.category || 'Worship').trim(),
          language: (body.language || 'Telugu').trim(),
          cover: typeof body.cover === 'number' ? body.cover : Math.floor(Math.random() * 50) + 1,
          tags: Array.isArray(body.tags) ? body.tags : (body.tags ? String(body.tags).split(',').map(t => t.trim()).filter(Boolean) : ['telugu', 'worship']),
          lyrics: {
            te: body.lyrics?.te ? body.lyrics.te.trim() : (body.lyricsTe ? body.lyricsTe.trim() : ''),
            rom: body.lyrics?.rom ? body.lyrics.rom.trim() : (body.lyricsRom ? body.lyricsRom.trim() : ''),
            ...(body.lyrics?.en ? { en: body.lyrics.en.trim() } : (body.lyricsEn ? { en: body.lyricsEn.trim() } : {}))
          },
          videoUrl: body.videoUrl ? body.videoUrl.trim() : undefined,
          addedAt: new Date().toISOString()
        };

        // If neither te nor rom lyrics provided
        if (!newSong.lyrics.te && !newSong.lyrics.rom) {
          return sendJson(res, 400, { ok: false, error: 'Please provide lyrics in Telugu or Romanized English' });
        }

        songs.unshift(newSong); // Add to beginning so newly added songs show up first
        writeSongsSafe(songs);

        return sendJson(res, 201, {
          ok: true,
          message: 'Song added successfully!',
          song: newSong,
          total: songs.length
        });
      } catch (err) {
        console.error('Error adding song:', err);
        return sendJson(res, 500, { ok: false, error: err.message || 'Server error' });
      }
    }
  }

  // PUT /api/songs/:id
  if (pathname.startsWith('/api/songs/') && req.method === 'PUT') {
    if (!requireAdmin(req, res)) return;
    const songId = pathname.replace('/api/songs/', '').trim();
    try {
      const body = await parseBody(req);
      const songs = readSongsSafe();
      const index = songs.findIndex(s => s.id === songId);
      if (index === -1) {
        return sendJson(res, 404, { ok: false, error: 'Song not found' });
      }

      const existing = songs[index];
      const updated = {
        ...existing,
        title: body.title !== undefined ? body.title.trim() : existing.title,
        day: body.day !== undefined ? (Number(body.day) || existing.day) : existing.day,
        artist: body.artist !== undefined ? body.artist.trim() : existing.artist,
        album: body.album !== undefined ? body.album.trim() : existing.album,
        category: body.category !== undefined ? body.category.trim() : existing.category,
        language: body.language !== undefined ? body.language.trim() : existing.language,
        tags: Array.isArray(body.tags) ? body.tags : (body.tags !== undefined ? String(body.tags).split(',').map(t => t.trim()).filter(Boolean) : existing.tags),
        lyrics: {
          te: body.lyrics?.te !== undefined ? body.lyrics.te.trim() : (body.lyricsTe !== undefined ? body.lyricsTe.trim() : existing.lyrics?.te || ''),
          rom: body.lyrics?.rom !== undefined ? body.lyrics.rom.trim() : (body.lyricsRom !== undefined ? body.lyricsRom.trim() : existing.lyrics?.rom || ''),
          en: body.lyrics?.en !== undefined ? body.lyrics.en.trim() : (body.lyricsEn !== undefined ? body.lyricsEn.trim() : existing.lyrics?.en || '')
        },
        videoUrl: body.videoUrl !== undefined ? body.videoUrl.trim() : existing.videoUrl,
        updatedAt: new Date().toISOString()
      };

      songs[index] = updated;
      writeSongsSafe(songs);
      return sendJson(res, 200, { ok: true, message: 'Song updated successfully', song: updated });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message || 'Server error' });
    }
  }

  // DELETE /api/songs/:id
  if (pathname.startsWith('/api/songs/') && req.method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    const songId = pathname.replace('/api/songs/', '').trim();
    const songs = readSongsSafe();
    const filtered = songs.filter(s => s.id !== songId);
    if (filtered.length === songs.length) {
      return sendJson(res, 404, { ok: false, error: 'Song not found' });
    }
    writeSongsSafe(filtered);
    return sendJson(res, 200, { ok: true, message: 'Song deleted successfully', total: filtered.length });
  }

  // Static file serving
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, pathname);

  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for client-side routing
      const indexFallback = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexFallback, (err2, content) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Always serve fresh files in dev so changes appear instantly
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  MARANATHA VISVASA SAMAJAM - SONGBOOK APP`);
  console.log(`  Server running at: http://localhost:${PORT}`);
  console.log(`  Admin endpoint:    http://localhost:${PORT}/#/admin`);
  console.log(`====================================================`);
});
