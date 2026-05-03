const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const REACTIONS_FILE = path.join(ROOT, 'reactions.json');
const CAPTIONS_FILE = path.join(ROOT, 'captions.json');
const PINS_FILE = path.join(ROOT, 'pins.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'xenuser';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']);

app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(ROOT, 'public')));

const ensureJson = (file) => { if (!fs.existsSync(file)) fs.writeFileSync(file, '{}', 'utf8'); };
const readJson = (file) => { ensureJson(file); try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
const writeJson = (file, data) => {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
};


ensureJson(REACTIONS_FILE);
ensureJson(CAPTIONS_FILE);
ensureJson(PINS_FILE);
function collectImages(baseDir, relativePrefix = '') {
  const out = [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = path.join(relativePrefix, entry.name);
    const fullPath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) out.push(...collectImages(fullPath, relPath));
    if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(relPath.replace(/\\/g, '/'));
  }
  return out;
}

function getClips() {
  if (!fs.existsSync(UPLOADS_DIR)) return [];
  const reactions = readJson(REACTIONS_FILE);
  const captions = readJson(CAPTIONS_FILE);
  const pins = readJson(PINS_FILE);
  const users = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  const clips = [];
  for (const userDir of users) {
    const user = userDir.name;
    for (const relFile of collectImages(path.join(UPLOADS_DIR, user))) {
      const clipId = `${user}/${relFile}`;
      clips.push({
        id: clipId,
        user,
        src: `/uploads/${encodeURIComponent(user)}/${relFile.split('/').map(encodeURIComponent).join('/')}`,
        caption: captions[clipId] || '',
        reactions: reactions[clipId] || {},
        pinned: Boolean(pins[clipId])
      });
    }
  }
  return clips.sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.user.localeCompare(b.user));
}

const isAdmin = (req) => ADMIN_TOKEN && req.header('x-admin-token') === ADMIN_TOKEN;

app.get('/api/clips', (req, res) => res.json({ clips: getClips(), canEditCaptions: isAdmin(req) }));
app.post('/api/react', (req, res) => {
  const { clipId, reaction, remove } = req.body || {};
  if (!clipId || !reaction) return res.status(400).json({ error: 'clipId and reaction are required' });
  if (!getClips().some((c) => c.id === clipId)) return res.status(404).json({ error: 'Clip not found' });
  const all = readJson(REACTIONS_FILE);
  const clip = all[clipId] || {};
  const current = Number(clip[reaction] || 0);
  clip[reaction] = remove ? Math.max(0, current - 1) : current + 1;
  all[clipId] = clip;
  writeJson(REACTIONS_FILE, all);
  return res.json({ count: clip[reaction] });
});

app.post('/api/caption', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin token required' });
  const { clipId, caption } = req.body || {};
  if (!clipId || typeof caption !== 'string') return res.status(400).json({ error: 'clipId and caption are required' });
  const all = readJson(CAPTIONS_FILE);
  all[clipId] = caption.slice(0, 180);
  writeJson(CAPTIONS_FILE, all);
  return res.json({ ok: true, caption: all[clipId] });
});

app.post('/api/pin', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin token required' });
  const { clipId, pinned } = req.body || {};
  if (!clipId) return res.status(400).json({ error: 'clipId is required' });
  if (!getClips().some((c) => c.id === clipId)) return res.status(404).json({ error: 'Clip not found' });
  const all = readJson(PINS_FILE);
  if (pinned) all[clipId] = true;
  else delete all[clipId];
  writeJson(PINS_FILE, all);
  return res.json({ ok: true, pinned: Boolean(pinned) });
});

app.post('/api/admin/reaction', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin token required' });
  const { clipId, reaction, count } = req.body || {};
  const nextCount = Number(count);
  if (!clipId || !reaction || !Number.isFinite(nextCount)) return res.status(400).json({ error: 'clipId, reaction, and count are required' });
  if (!getClips().some((c) => c.id === clipId)) return res.status(404).json({ error: 'Clip not found' });
  const all = readJson(REACTIONS_FILE);
  const clip = all[clipId] || {};
  clip[reaction] = Math.max(0, Math.floor(nextCount));
  all[clipId] = clip;
  writeJson(REACTIONS_FILE, all);
  return res.json({ ok: true, count: clip[reaction] });
});

app.get('*', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));
app.listen(PORT, () => console.log(`spf-files listening on http://localhost:${PORT}`));
