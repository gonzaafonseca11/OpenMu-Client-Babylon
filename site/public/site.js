// The site's page script: tabs by hash, rankings and the account panel. Data goes in as text, never as HTML.
/* global document, window, location, fetch, FormData */
const $ = sel => document.querySelector(sel);
const fmt = n => Number(n).toLocaleString('es-AR');

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
  const { ok, body } = await api('/api/me');
  $('#login-box').hidden = ok;
  $('#account').hidden = !ok;
  if (!ok) return;
  $('#account-name').textContent = body.login;
  const cards = body.characters.map(characterCard);
  $('#characters').replaceChildren(...(cards.length ? cards : [el('p', { class: 'hint' }, 'Todavía no creaste personajes. ¡Entrá al juego y creá uno!')]));
}

function showTab() {
  const tab = (location.hash || '#inicio').slice(1);
  const panel = document.getElementById(tab) ? tab : 'inicio';
  for (const s of document.querySelectorAll('main > section')) s.hidden = s.id !== panel;
  for (const a of document.querySelectorAll('.tabs a')) a.classList.toggle('active', a.dataset.tab === panel);
  const table = document.querySelector(`#${panel} table.ranking`);
  if (table) loadRanking(table);
  if (panel === 'cuenta') showAccount();
}

document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('hashchange', showTab);
  showTab();

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = new FormData(e.target);
    const button = e.target.querySelector('button');
    button.disabled = true;
    $('#login-error').textContent = '';
    const { ok, body } = await api('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
    });
    button.disabled = false;
    if (!ok) {
      $('#login-error').textContent = body.error || 'No se pudo entrar.';
      return;
    }
    e.target.reset();
    showAccount();
  });

  $('#logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    showAccount();
  });
});
