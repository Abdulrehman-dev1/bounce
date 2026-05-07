import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const port = Number(process.env.REMOTE_BROWSER_PORT || 3100);
const workerSecret = process.env.REMOTE_BROWSER_SECRET || '';
const maxSessions = Number(process.env.REMOTE_BROWSER_MAX_SESSIONS || 10);
const sessions = new Map();
const wsClientsBySession = new Map();
const frameInFlight = new Map();
let browser;
const STREAM_PROFILES = {
  balanced: { frameIntervalMs: 110, quality: 52 },
  fast: { frameIntervalMs: 55, quality: 32 },
};

app.use((req, res, next) => {
  if (!workerSecret) return next();
  const supplied = req.header('x-remote-browser-secret') || '';
  if (supplied !== workerSecret) return res.status(401).json({ message: 'Unauthorized worker request' });
  next();
});

async function ensureBrowser() {
  if (!browser) browser = await chromium.launch({ headless: true });
  return browser;
}

async function createSession({ url, viewportWidth = 1366, viewportHeight = 900 }) {
  if (sessions.size >= maxSessions) throw new Error('Worker session capacity reached');

  const b = await ensureBrowser();
  const context = await b.newContext({
    viewport: { width: Math.max(800, Number(viewportWidth) || 1366), height: Math.max(600, Number(viewportHeight) || 900) },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

  const id = randomUUID();
  sessions.set(id, {
    context,
    page,
    createdAt: Date.now(),
    streamProfile: 'balanced',
    lastFrameAt: 0,
  });
  return id;
}

function getSession(id) {
  const s = sessions.get(id);
  if (!s) throw new Error('Session not found');
  return s;
}

app.get('/health', (_req, res) => res.json({ ok: true, sessions: sessions.size, maxSessions }));

app.post('/sessions', async (req, res) => {
  try {
    const { url, viewportWidth, viewportHeight } = req.body;
    if (!url) return res.status(422).json({ message: 'url is required' });
    const sessionId = await createSession({ url, viewportWidth, viewportHeight });
    res.json({ sessionId });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Failed to create session' });
  }
});

app.post('/sessions/:id/viewport', async (req, res) => {
  try {
    const { page } = getSession(req.params.id);
    const { viewportWidth = 1366, viewportHeight = 900 } = req.body;
    await page.setViewportSize({ width: Math.max(800, Number(viewportWidth)), height: Math.max(600, Number(viewportHeight)) });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Viewport resize failed' });
  }
});

app.post('/sessions/:id/stream-profile', async (req, res) => {
  try {
    const session = getSession(req.params.id);
    const profile = String(req.body.profile || 'balanced').toLowerCase();
    if (!STREAM_PROFILES[profile]) {
      return res.status(422).json({ message: 'Invalid stream profile' });
    }
    session.streamProfile = profile;
    res.json({ ok: true, profile });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Stream profile update failed' });
  }
});

for (const cmd of ['navigate', 'back', 'forward', 'reload']) {
  app.post(`/sessions/:id/${cmd}`, async (req, res) => {
    try {
      const { page } = getSession(req.params.id);
      if (cmd === 'navigate') await page.goto(req.body.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (cmd === 'back') await page.goBack({ waitUntil: 'domcontentloaded', timeout: 20000 });
      if (cmd === 'forward') await page.goForward({ waitUntil: 'domcontentloaded', timeout: 20000 });
      if (cmd === 'reload') await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
      res.json({ ok: true, url: page.url() });
    } catch (e) {
      res.status(500).json({ message: e.message || `${cmd} failed` });
    }
  });
}

app.post('/sessions/:id/scroll', async (req, res) => {
  try {
    const { page } = getSession(req.params.id);
    const { deltaX = 0, deltaY = 0 } = req.body;
    await page.evaluate(({ dx, dy }) => window.scrollBy(dx, dy), { dx: Number(deltaX), dy: Number(deltaY) });
    const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    res.json({ ok: true, scroll });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Scroll failed' });
  }
});

app.post('/sessions/:id/click', async (req, res) => {
  try {
    const { page } = getSession(req.params.id);
    await page.mouse.click(Number(req.body.x), Number(req.body.y));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Click failed' });
  }
});

app.post('/sessions/:id/mousemove', async (req, res) => {
  try {
    const { page } = getSession(req.params.id);
    await page.mouse.move(Number(req.body.x), Number(req.body.y));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Mouse move failed' });
  }
});

app.post('/sessions/:id/mousedown', async (req, res) => {
  try {
    const { page } = getSession(req.params.id);
    const button = ['left', 'middle', 'right'].includes(req.body.button) ? req.body.button : 'left';
    await page.mouse.move(Number(req.body.x), Number(req.body.y));
    await page.mouse.down({ button });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Mouse down failed' });
  }
});

app.post('/sessions/:id/mouseup', async (req, res) => {
  try {
    const { page } = getSession(req.params.id);
    const button = ['left', 'middle', 'right'].includes(req.body.button) ? req.body.button : 'left';
    await page.mouse.move(Number(req.body.x), Number(req.body.y));
    await page.mouse.up({ button });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Mouse up failed' });
  }
});

app.post('/sessions/:id/type', async (req, res) => {
  try {
    const { page } = getSession(req.params.id);
    await page.keyboard.type(String(req.body.text || ''));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Type failed' });
  }
});

app.post('/sessions/:id/key', async (req, res) => {
  try {
    const { page } = getSession(req.params.id);
    const key = String(req.body.key || '').trim();
    if (!key) return res.status(422).json({ message: 'key is required' });
    await page.keyboard.press(key);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Key press failed' });
  }
});

app.post('/sessions/:id/keydown', async (req, res) => {
  try {
    const { page } = getSession(req.params.id);
    const key = String(req.body.key || '').trim();
    if (!key) return res.status(422).json({ message: 'key is required' });
    await page.keyboard.down(key);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Key down failed' });
  }
});

app.post('/sessions/:id/keyup', async (req, res) => {
  try {
    const { page } = getSession(req.params.id);
    const key = String(req.body.key || '').trim();
    if (!key) return res.status(422).json({ message: 'key is required' });
    await page.keyboard.up(key);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Key up failed' });
  }
});

app.get('/sessions/:id/state', async (req, res) => {
  try {
    const { page } = getSession(req.params.id);
    const state = await page.evaluate(() => ({
      url: window.location.href,
      scroll: { x: window.scrollX, y: window.scrollY },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }));
    res.json({ ok: true, ...state });
  } catch (e) {
    res.status(500).json({ message: e.message || 'State failed' });
  }
});

app.get('/sessions/:id/screenshot', async (req, res) => {
  try {
    const { page } = getSession(req.params.id);
    const buffer = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: false });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ message: e.message || 'Screenshot failed' });
  }
});

app.delete('/sessions/:id', async (req, res) => {
  try {
    const session = getSession(req.params.id);
    await session.context.close();
    sessions.delete(req.params.id);
    const clients = wsClientsBySession.get(req.params.id) || new Set();
    for (const client of clients) {
      try {
        client.close();
      } catch {
        // no-op
      }
    }
    wsClientsBySession.delete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Close failed' });
  }
});

setInterval(async () => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > 1000 * 60 * 20) {
      await session.context.close();
      sessions.delete(id);
    }
  }
}, 60000);

const server = app.listen(port, () => {
  console.log(`Remote browser worker listening on http://localhost:${port}`);
});

const wss = new WebSocketServer({
  server,
  path: '/ws',
});

wss.on('connection', (socket, req) => {
  try {
    const requestUrl = new URL(req.url, `http://127.0.0.1:${port}`);
    const sessionId = requestUrl.searchParams.get('sessionId');
    const secret = req.headers['x-remote-browser-secret'] || requestUrl.searchParams.get('secret') || '';

    if (!sessionId || !sessions.has(sessionId)) {
      socket.close(1008, 'Invalid session');
      return;
    }

    if (workerSecret && secret !== workerSecret) {
      socket.close(1008, 'Unauthorized');
      return;
    }

    const clients = wsClientsBySession.get(sessionId) || new Set();
    clients.add(socket);
    wsClientsBySession.set(sessionId, clients);

    socket.on('close', () => {
      const linked = wsClientsBySession.get(sessionId);
      if (!linked) return;
      linked.delete(socket);
      if (linked.size === 0) {
        wsClientsBySession.delete(sessionId);
      }
    });
  } catch {
    socket.close(1011, 'Bad connection setup');
  }
});

setInterval(async () => {
  const now = Date.now();
  for (const [sessionId, clients] of wsClientsBySession.entries()) {
    if (!clients || clients.size === 0) continue;
    const session = sessions.get(sessionId);
    if (!session) continue;
    if (frameInFlight.get(sessionId)) continue;
    const profile = STREAM_PROFILES[session.streamProfile] || STREAM_PROFILES.balanced;
    if (now - (session.lastFrameAt || 0) < profile.frameIntervalMs) continue;

    try {
      frameInFlight.set(sessionId, true);
      session.lastFrameAt = now;
      const frame = await session.page.screenshot({ type: 'jpeg', quality: profile.quality, fullPage: false });
      for (const client of clients) {
        if (client.readyState === 1) {
          client.send(frame, { binary: true });
        }
      }
    } catch {
      // ignore frame failures for this tick
    } finally {
      frameInFlight.set(sessionId, false);
    }
  }
}, 50);
