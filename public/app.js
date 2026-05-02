const gallery = document.getElementById('gallery');
const empty = document.getElementById('empty');
const folderNav = document.getElementById('folderNav');
const REACTIONS = ['❤️', '🔥', '😂', '😮', '👏'];
let allClips = [];
let selectedUser = 'all';
let canEditCaptions = false;

const params = new URLSearchParams(location.search);
const tokenFromUrl = params.get('admin');
if (tokenFromUrl) localStorage.setItem('spf_admin_token', tokenFromUrl);
const ADMIN_TOKEN = localStorage.getItem('spf_admin_token') || '';

function getCookie(name) {
  const item = document.cookie.split(';').map((p) => p.trim()).find((p) => p.startsWith(name + '='));
  return item ? decodeURIComponent(item.split('=')[1]) : null;
}
function setCookie(name, value, days = 3650) {
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}
const keyFor = (clipId, emoji) => `react_${btoa(unescape(encodeURIComponent(`${clipId}::${emoji}`))).replace(/=/g, '')}`;

function folderButtons(users) {
  folderNav.innerHTML = ['all', ...users].map((u) => `<button class="folder-btn ${u === selectedUser ? 'active' : ''}" data-user="${u}">${u === 'all' ? 'All folders' : '@' + u}</button>`).join('');
  folderNav.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => { selectedUser = btn.dataset.user; folderButtons(users); render(); }));
}

function reactionButton(clip, emoji) {
  const count = Number((clip.reactions && clip.reactions[emoji]) || 0);
  const active = getCookie(keyFor(clip.id, emoji)) === '1';
  return `<button class="react-btn ${active ? 'active' : ''}" data-emoji="${emoji}">${emoji} ${count}</button>`;
}

function captionEditor(clip) {
  if (!canEditCaptions) return `<p class="caption">${clip.caption || ''}</p>`;
  return `<form class="caption-form"><input maxlength="180" name="caption" value="${(clip.caption || '').replace(/"/g, '&quot;')}" placeholder="Add caption..." /><button type="submit">Save</button></form>`;
}

function cardTemplate(clip) {
  return `<article class="card" data-id="${clip.id}"><img src="${clip.src}" alt="${clip.user} clip" loading="lazy" /><div class="meta"><span class="user">@${clip.user}</span>${captionEditor(clip)}<div class="reactions">${REACTIONS.map((e) => reactionButton(clip, e)).join('')}</div></div></article>`;
}

function visibleClips() { return selectedUser === 'all' ? allClips : allClips.filter((c) => c.user === selectedUser); }

function wireReactions() {
  gallery.querySelectorAll('.card').forEach((card) => {
    card.querySelectorAll('.react-btn').forEach((btn) => btn.addEventListener('click', async () => {
      const clipId = card.dataset.id;
      const emoji = btn.dataset.emoji;
      const key = keyFor(clipId, emoji);
      const active = getCookie(key) === '1';
      const res = await fetch('/api/react', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clipId, reaction: emoji, remove: active }) });
      if (!res.ok) return;
      const payload = await res.json();
      setCookie(key, active ? '0' : '1');
      btn.classList.toggle('active', !active);
      btn.textContent = `${emoji} ${payload.count}`;
    }));

    const form = card.querySelector('.caption-form');
    if (form) form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const clipId = card.dataset.id;
      const caption = new FormData(form).get('caption') || '';
      const res = await fetch('/api/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
        body: JSON.stringify({ clipId, caption })
      });
      if (!res.ok) return;
    });
  });
}

function render() {
  const clips = visibleClips();
  empty.classList.toggle('hidden', clips.length > 0);
  gallery.innerHTML = clips.map(cardTemplate).join('');
  wireReactions();
}

async function loadClips() {
  const headers = ADMIN_TOKEN ? { 'x-admin-token': ADMIN_TOKEN } : {};
  const res = await fetch('/api/clips', { headers });
  const data = await res.json();
  allClips = data.clips || [];
  canEditCaptions = Boolean(data.canEditCaptions);
  const users = [...new Set(allClips.map((c) => c.user))].sort();
  folderButtons(users);
  render();
}

loadClips().catch(() => {
  empty.classList.remove('hidden');
  empty.textContent = 'Could not load clips right now.';
});

const bg = document.getElementById('interactiveBg');
window.addEventListener('pointermove', (e) => {
  if (!bg) return;
  bg.style.setProperty('--mx', `${(e.clientX / window.innerWidth) * 100}%`);
  bg.style.setProperty('--my', `${(e.clientY / window.innerHeight) * 100}%`);
});