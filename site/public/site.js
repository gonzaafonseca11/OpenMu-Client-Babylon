// The site's page script: tabs by hash, rankings, news, the chat and the account panel.
// Data goes in as text, never as HTML.
/* global document, window, location, fetch, FormData, setInterval, clearInterval */
const $ = sel => document.querySelector(sel);
const fmt = n => Number(n).toLocaleString('es-AR');
const when = at => new Date(at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}

async function api(path, init) {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

const post = (path, data) =>
  api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

/** Who is logged in, from /api/me; null when nobody. */
let me = null;

async function loadMe() {
  const { ok, body } = await api('/api/me');
  me = ok ? body : null;
  return me;
}

/* ------------------------------------------------------------- rankings */

const loaded = new Set();

async function loadRanking(table) {
  const key = table.dataset.ranking;
  if (loaded.has(key)) return;
  table.replaceChildren(el('caption', {}, 'Cargando...'));
  const { ok, body } = await api(`/api/ranking/${key}`);
  if (!ok) {
    table.replaceChildren(el('caption', {}, body.error || 'No se pudo cargar el ranking.'));
    return;
  }
  loaded.add(key);
  const head = el('tr', {}, el('th', {}, '#'), el('th', {}, 'Personaje'), el('th', {}, 'Clase'), el('th', { class: 'num' }, table.dataset.scoreLabel), el('th', { class: 'num' }, key === 'pk' ? 'Resets' : 'Nivel'));
  const rows = body.map((c, i) =>
    el('tr', { class: i < 3 ? `top${i + 1}` : '' },
      el('td', {}, String(i + 1)),
      el('td', { class: 'name' }, c.name),
      el('td', {}, c.class),
      el('td', { class: 'num' }, fmt(c[table.dataset.score])),
      el('td', { class: 'num' }, fmt(key === 'pk' ? c.resets : c.level))
    )
  );
  table.replaceChildren(el('thead', {}, head), el('tbody', {}, ...rows));
  if (!rows.length) table.append(el('caption', {}, 'Todavía no hay nadie en este ranking. ¡Sé el primero!'));
}

/* ----------------------------------------------------------------- news */

function newsItem(n, moderator) {
  const item = el('article', { class: 'news' },
    el('h3', {}, n.title),
    el('time', {}, when(n.at)),
    el('p', {}, n.body)
  );
  if (moderator) {
    const del = el('button', { class: 'link-danger', type: 'button' }, 'Borrar');
    del.addEventListener('click', async () => {
      if (!window.confirm('¿Borrar esta noticia?')) return;
      await post('/api/news/delete', { id: n.id });
      loadNews();
    });
    item.append(del);
  }
  return item;
}

async function loadNews() {
  const { ok, body } = await api('/api/news');
  const news = ok ? body : [];
  const moderator = !!me?.moderator;
  for (const list of document.querySelectorAll('[data-news-list]')) {
    const items = list.dataset.newsList === 'home' ? news.slice(0, 2) : news;
    list.replaceChildren(...(items.length ? items.map(n => newsItem(n, moderator && list.dataset.newsList === 'all')) : [el('p', { class: 'hint' }, 'Todavía no hay noticias.')]));
  }
  $('#home-news').hidden = news.length === 0;
}

/* ----------------------------------------------------------------- chat */

let lastChatId = 0;
let chatTimer = 0;
const shown = new Map();

function chatLine(m) {
  const line = el('div', { class: 'chat-line', 'data-id': String(m.id) },
    el('time', {}, when(m.at)),
    el('b', {}, m.author),
    el('span', {}, m.body)
  );
  if (me?.moderator) {
    const del = el('button', { class: 'link-danger', type: 'button', title: 'Borrar mensaje' }, '✕');
    del.addEventListener('click', async () => {
      await post('/api/chat/delete', { id: m.id });
      line.remove();
    });
    line.append(del);
  }
  return line;
}

async function pollChat() {
  const { ok, body } = await api(`/api/chat?after=${lastChatId}`);
  if (!ok) return;
  const log = $('#chat-log');
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  for (const m of body.messages) {
    if (shown.has(m.id)) continue;
    const line = chatLine(m);
    shown.set(m.id, line);
    log.append(line);
    lastChatId = Math.max(lastChatId, m.id);
  }
  for (const id of body.hidden) {
    shown.get(id)?.remove();
    shown.delete(id);
  }
  if (!log.children.length) log.replaceChildren(el('p', { class: 'hint empty' }, 'Nadie escribió todavía. ¡Saludá!'));
  else log.querySelector('.empty')?.remove();
  if (atBottom) log.scrollTop = log.scrollHeight;
}

function stopChat() {
  clearInterval(chatTimer);
  chatTimer = 0;
}

async function showCommunity() {
  await loadMe();
  $('#news-form').hidden = !me?.moderator;
  loadNews();
  const canChat = !!me;
  $('#chat-login').hidden = canChat;
  $('#chat').hidden = !canChat;
  if (!canChat) return stopChat();

  const select = $('#chat-form select');
  select.replaceChildren(...me.characters.map(c => el('option', { value: c.name }, c.name)));
  const input = $('#chat-form input');
  input.disabled = me.chatBanned || !me.characters.length;
  input.placeholder = me.chatBanned ? 'Tenés el chat bloqueado por un rato.' : me.characters.length ? 'Escribí un mensaje...' : 'Creá un personaje en el juego para chatear.';
  await pollChat();
  $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
  if (!chatTimer) chatTimer = setInterval(pollChat, 4000);
}

/* -------------------------------------------------------------- account */

function characterCard(c) {
  const stats = [['Fuerza', c.strength], ['Agilidad', c.agility], ['Vitalidad', c.vitality], ['Energía', c.energy]];
  if (c.leadership) stats.push(['Comando', c.leadership]);
  return el('article', { class: 'card' },
    el('h2', {}, c.name),
    el('p', { class: 'class' }, c.class),
    el('dl', {},
      el('dt', {}, 'Nivel'), el('dd', {}, fmt(c.level)),
      el('dt', {}, 'Resets'), el('dd', {}, fmt(c.resets)),
      el('dt', {}, 'Kills PK'), el('dd', {}, fmt(c.kills)),
      el('dt', {}, 'Mapa'), el('dd', {}, c.map || '-'),
      ...stats.flatMap(([label, value]) => [el('dt', {}, label), el('dd', {}, fmt(value))])
    )
  );
}

async function showAccount() {
  await loadMe();
  $('#login-box').hidden = !!me;
  $('#account').hidden = !me;
  if (!me) return;
  $('#account-name').textContent = me.login;
  const cards = me.characters.map(characterCard);
  $('#characters').replaceChildren(...(cards.length ? cards : [el('p', { class: 'hint' }, 'Todavía no creaste personajes. ¡Entrá al juego y creá uno!')]));
}

/* ----------------------------------------------------------------- tabs */

function showTab() {
  const tab = (location.hash || '#inicio').slice(1);
  const panel = document.getElementById(tab) ? tab : 'inicio';
  for (const s of document.querySelectorAll('main > section')) s.hidden = s.id !== panel;
  for (const a of document.querySelectorAll('.tabs a')) a.classList.toggle('active', a.dataset.tab === panel);
  const table = document.querySelector(`#${panel} table.ranking`);
  if (table) loadRanking(table);
  if (panel === 'cuenta') showAccount();
  if (panel === 'comunidad') showCommunity();
  else stopChat();
  if (panel === 'inicio') loadNews();
}

document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('hashchange', showTab);
  loadMe().then(showTab);

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = new FormData(e.target);
    const button = e.target.querySelector('button');
    button.disabled = true;
    $('#login-error').textContent = '';
    const { ok, body } = await post('/api/login', { username: form.get('username'), password: form.get('password') });
    button.disabled = false;
    if (!ok) {
      $('#login-error').textContent = body.error || 'No se pudo entrar.';
      return;
    }
    e.target.reset();
    showAccount();
  });

  $('#logout').addEventListener('click', async () => {
    await post('/api/logout', {});
    me = null;
    stopChat();
    showAccount();
  });

  $('#chat-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = new FormData(e.target);
    const input = e.target.querySelector('input');
    $('#chat-error').textContent = '';
    const { ok, body } = await post('/api/chat', { character: form.get('character'), body: form.get('body') });
    if (!ok) {
      $('#chat-error').textContent = body.error || 'No se pudo enviar.';
      return;
    }
    input.value = '';
    await pollChat();
    $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
  });

  $('#news-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = new FormData(e.target);
    $('#news-error').textContent = '';
    const { ok, body } = await post('/api/news', { title: form.get('title'), body: form.get('body') });
    if (!ok) {
      $('#news-error').textContent = body.error || 'No se pudo publicar.';
      return;
    }
    e.target.reset();
    loadNews();
  });
});
