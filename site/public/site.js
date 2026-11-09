// The site's page script: tabs by hash, rankings, news, reports and the account panel.
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

/* --------------------------------------------------------------- online */

async function loadOnline() {
  const { ok, body } = await api('/api/online');
  const n = ok ? body.online : null;
  $('#online').hidden = typeof n !== 'number';
  if (typeof n !== 'number') return;
  $('#online-count').textContent = fmt(n);
  $('#online-label').textContent = n === 1 ? 'jugador online' : 'jugadores online';
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
    const items = list.dataset.newsList === 'home' ? news.slice(0, 3) : news;
    list.replaceChildren(...(items.length ? items.map(n => newsItem(n, moderator && list.dataset.newsList === 'all')) : [el('p', { class: 'hint' }, 'Todavía no hay noticias.')]));
  }
  $('#home-news').hidden = news.length === 0;
}

/* -------------------------------------------------------------- reports */

const REPORT_KIND = { bug: 'Bug', player: 'Jugador', other: 'Otro' };
const REPORT_STATUS = { open: 'Pendiente', seen: 'Revisado', done: 'Resuelto' };

function reportItem(r, staff) {
  const head = `${REPORT_KIND[r.kind] || r.kind}${r.target ? `: ${r.target}` : ''}${staff ? ` (de ${r.login})` : ''}`;
  const item = el('article', { class: `news report-${r.status}` },
    el('h3', {}, head),
    el('time', {}, `${when(r.at)} · ${REPORT_STATUS[r.status] || r.status}`),
    el('p', {}, r.body)
  );
  // Only http(s) links reach here (the server checks), shown as a link that opens apart.
  if (r.link) item.append(el('p', {}, el('a', { href: r.link, target: '_blank', rel: 'noopener noreferrer nofollow' }, 'Ver prueba')));
  if (!staff) {
    if (r.reply) item.append(el('p', { class: 'ok' }, `Staff: ${r.reply}`));
    return item;
  }
  const status = el('select', {}, ...Object.entries(REPORT_STATUS).map(([v, t]) => el('option', { value: v }, t)));
  status.value = r.status;
  const reply = el('input', { maxlength: '500', placeholder: 'Respuesta para el jugador (opcional)' });
  reply.value = r.reply;
  const save = el('button', { class: 'btn btn-ghost', type: 'button' }, 'Guardar');
  save.addEventListener('click', async () => {
    await post('/api/reports/answer', { id: r.id, status: status.value, reply: reply.value });
    loadAllReports();
  });
  item.append(el('div', { class: 'report-answer' }, status, reply, save));
  return item;
}

async function loadMyReports() {
  const { ok, body } = await api('/api/reports');
  const list = ok ? body : [];
  $('#my-reports').replaceChildren(...(list.length ? list.map(r => reportItem(r, false)) : [el('p', { class: 'hint' }, 'Todavía no mandaste reportes.')]));
}

async function loadAllReports() {
  const { ok, body } = await api('/api/reports/all');
  const list = ok ? body : [];
  $('#all-reports').replaceChildren(...(list.length ? list.map(r => reportItem(r, true)) : [el('p', { class: 'hint' }, 'No hay reportes.')]));
}

async function showCommunity() {
  await loadMe();
  $('#report-login').hidden = !!me;
  $('#report-box').hidden = !me;
  if (me) loadMyReports();
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
  $('#gm-tab').hidden = !me?.moderator;
  if (!me) return;
  $('#account-name').textContent = me.login;
  $('#email-current').textContent = me.email
    ? `Tu e-mail es ${me.email}. Si olvidás la contraseña, te llega ahí.`
    : 'Tu cuenta no tiene e-mail. Cargalo para poder recuperarla si olvidás la contraseña.';
  const cards = me.characters.map(characterCard);
  $('#characters').replaceChildren(...(cards.length ? cards : [el('p', { class: 'hint' }, 'Todavía no creaste personajes. ¡Entrá al juego y creá uno!')]));
}

/* ------------------------------------------------------------- GM panel */

let gmItem = null;

async function gmBrowse() {
  const group = $('#gm-group').value;
  const list = $('#gm-results');
  $('#gm-item').hidden = true;
  gmItem = null;
  list.hidden = group === '';
  if (group === '') return;
  const { ok, body } = await api(`/api/gm/items?group=${group}&family=${$('#gm-family').value}`);
  if (!ok) return;
  list.replaceChildren(...body.map(i => {
    const o = el('option', { value: i.id }, i.name);
    o.item = i;
    return o;
  }));
  if (!body.length) list.replaceChildren(el('option', { disabled: '' }, 'No hay ítems de este tipo para esa clase.'));
}

function checkbox(name, value, label, checked = false) {
  const input = el('input', { type: 'checkbox', name, value });
  input.checked = checked;
  return el('label', { class: 'check' }, input, ` ${label}`);
}

async function gmPick() {
  const option = $('#gm-results').selectedOptions[0];
  if (!option) return;
  gmItem = option.item;
  const { ok, body } = await api(`/api/gm/options?id=${gmItem.id}${$('#gm-group').value === 'ancients' ? '&set=ancient' : ''}`);
  if (!ok) return;
  $('#gm-item').hidden = false;
  $('#gm-item-name').textContent = gmItem.name;
  $('#gm-level').replaceChildren(...Array.from({ length: gmItem.maxLevel + 1 }, (_, l) => el('option', { value: String(l) }, `+${l}`)));
  $('#gm-level').value = String(gmItem.maxLevel);
  $('#gm-skill-row').hidden = !gmItem.hasSkill;
  $('#gm-skill-row input').checked = gmItem.hasSkill;
  const of = kind => body.filter(o => o.kind === kind);
  for (const kind of ['luck', 'excellent', 'wing']) {
    const box = $(`#gm-${kind}`);
    const legend = box.querySelector('legend');
    box.replaceChildren(legend, ...of(kind).map(o => checkbox('opt', o.id, o.label, true)));
    box.hidden = !of(kind).length;
  }
  // Fenrir: one kind per horn (Gold is several option lines with one number).
  const fenrir = $('#gm-fenrir');
  const kinds = [...new Map(of('fenrir').map(o => [o.number, o.label])).entries()];
  const radio = (value, label, checked) => {
    const input = el('input', { type: 'radio', name: 'fenrir', value });
    input.checked = checked;
    return el('label', { class: 'check' }, input, ` ${label}`);
  };
  fenrir.replaceChildren(fenrir.querySelector('legend'), radio('', 'Rojo: sin opción', !kinds.length), ...kinds.map(([n, label], i) => radio(String(n), label, i === kinds.length - 1)));
  fenrir.hidden = !kinds.length;
  gmItem.fenrirLines = of('fenrir');

  const extra = $('#gm-option');
  const lines = of('option');
  const pick = el('select', { name: 'optionId' }, el('option', { value: '' }, 'Ninguna'), ...lines.map(o => el('option', { value: o.id }, o.label)));
  const lvl = el('select', { name: 'optionLevel' });
  // Each line has its own top level (jewelry options have only level 1 on this server).
  const fillLevels = () => {
    const line = lines.find(o => o.id === pick.value);
    const top = line ? line.maxLevel : 1;
    lvl.replaceChildren(...Array.from({ length: top }, (_, i) => el('option', { value: String(i + 1) }, `Nivel ${i + 1}`)));
    lvl.value = String(top);
  };
  pick.addEventListener('change', fillLevels);
  if (lines.length) pick.value = lines[0].id;
  fillLevels();
  extra.replaceChildren(extra.querySelector('legend'), pick, lvl);
  extra.hidden = !lines.length;

  // Ancient: the set (or none), then its stat bonus +5 / +10 when the set has one.
  const anc = $('#gm-ancient');
  const sets = of('ancient');
  const setPick = el('select', { name: 'ancientId' }, el('option', { value: '' }, 'No ancient'), ...sets.map(o => el('option', { value: o.id }, o.label)));
  const bonus = el('select', { name: 'ancientLevel' });
  const fillBonus = () => {
    const set = sets.find(o => o.id === setPick.value);
    bonus.hidden = !set?.bonus;
    const stat = set?.bonusLabel ?? 'stat';
    bonus.replaceChildren(...[2, 1].map(l => el('option', { value: String(l) }, `${stat} +${l * 5}`)));
  };
  setPick.addEventListener('change', fillBonus);
  fillBonus();
  anc.replaceChildren(anc.querySelector('legend'), setPick, bonus);
  anc.hidden = !sets.length;
  // A whole ancient set: the set is the pick itself, only its bonus is asked.
  if ($('#gm-group').value === 'ancients') {
    setPick.replaceChildren(el('option', { value: gmItem.id }, gmItem.name));
    bonus.hidden = false;
    bonus.replaceChildren(...[2, 1].map(l => el('option', { value: String(l) }, `Bonus de stat +${l * 5}`)));
    anc.replaceChildren(anc.querySelector('legend'), setPick, bonus,
      checkbox('setLuck', 'on', 'Luck (en cada pieza que lo admita)', true),
      checkbox('setOption', 'on', 'Opción adicional al máximo', true));
    anc.hidden = false;
  }

  // Sockets: how many slots, then per slot a seed sphere (or empty) and its level 1-5.
  const box = $('#gm-sockets');
  const spheres = of('socket');
  const count = el('select', { name: 'socketCount' }, ...Array.from({ length: gmItem.sockets + 1 }, (_, n) => el('option', { value: String(n) }, n ? `${n} socket${n > 1 ? 's' : ''}` : 'Sin sockets')));
  count.value = String(gmItem.sockets);
  const rows = Array.from({ length: gmItem.sockets }, (_, i) => {
    const sphere = el('select', { name: `socket${i}` }, el('option', { value: '' }, 'Vacío'), ...spheres.map(o => el('option', { value: o.id }, o.label)));
    const level = el('select', { name: `socketLevel${i}` }, ...[1, 2, 3, 4, 5].map(l => el('option', { value: String(l) }, `Esfera nivel ${l}`)));
    level.value = '5';
    return el('div', { class: 'socket-row' }, `Socket ${i + 1}: `, sphere, level);
  });
  const showRows = () => rows.forEach((r, i) => { r.hidden = i >= Number(count.value); });
  count.addEventListener('change', showRows);
  showRows();
  box.replaceChildren(box.querySelector('legend'), count, ...rows);
  box.hidden = !gmItem.sockets;
}

async function gmGive(e) {
  e.preventDefault();
  if (!gmItem) return;
  const form = new FormData(e.target);
  const options = form.getAll('opt').map(id => ({ id, level: 0 }));
  if (form.get('optionId')) options.push({ id: form.get('optionId'), level: Number(form.get('optionLevel')) });
  const horn = form.get('fenrir');
  if (horn) for (const o of gmItem.fenrirLines ?? []) if (String(o.number) === horn) options.push({ id: o.id, level: 0 });
  $('#gm-error').textContent = '';
  $('#gm-ok').textContent = '';
  const button = e.target.querySelector('button[type=submit]');
  button.disabled = true;
  const isSet = $('#gm-group').value === 'sets' || $('#gm-group').value === 'ancients';
  const sockets = Array.from({ length: Number(form.get('socketCount') ?? 0) }, (_, i) => ({ id: form.get(`socket${i}`) || '', level: Number(form.get(`socketLevel${i}`)) }));
  const { ok, body } = await post(isSet ? '/api/gm/give-set' : '/api/gm/give', { character: form.get('character'), definitionId: gmItem.id, level: Number(form.get('level')), skill: form.get('skill') === 'on', options, sockets, ancient: form.get('ancientId') ? { id: form.get('ancientId'), level: Number(form.get('ancientLevel') ?? 0) } : null, excellent: form.getAll('opt'), luck: form.get('setLuck') === 'on', extraOption: form.get('setOption') === 'on' });
  button.disabled = false;
  if (!ok) $('#gm-error').textContent = body.error || 'No se pudo crear.';
  else if (isSet) $('#gm-ok').textContent = `Listo: ${body.given.join(', ')} +${form.get('level')} quedaron en el inventario de ${form.get('character')}.`;
  else $('#gm-ok').textContent = `Listo: ${body.name} +${form.get('level')} quedó en el inventario de ${form.get('character')}.`;
}

const STAT_FIELDS = ['level', 'resets', 'strength', 'agility', 'vitality', 'energy', 'leadership', 'points', 'zen'];

function fillStats(s) {
  const form = $('#stats-form');
  form.hidden = false;
  $('#stats-title').textContent = `${s.name} - ${s.class}${s.online ? ' (conectado: salí del juego para guardar)' : ''}`;
  $('#stats-leadership').hidden = s.leadership === null;
  $('#stats-class').replaceChildren(...s.classes.map(c => el('option', { value: String(c.number) }, c.name)));
  $('#stats-class').value = String(s.classNumber);
  for (const f of STAT_FIELDS) form.elements[f].value = s[f] ?? '';
}

async function statsLoad(e) {
  e.preventDefault();
  $('#stats-find-error').textContent = '';
  $('#stats-ok').textContent = '';
  $('#stats-error').textContent = '';
  const name = new FormData(e.target).get('name').trim();
  const { ok, body } = await api(`/api/gm/stats?name=${encodeURIComponent(name)}`);
  if (!ok) {
    $('#stats-form').hidden = true;
    $('#stats-find-error').textContent = body.error || 'No se pudo cargar.';
    return;
  }
  fillStats(body);
}

async function statsSave(e) {
  e.preventDefault();
  const form = e.target;
  const data = { name: $('#stats-find').elements.name.value.trim(), classNumber: Number($('#stats-class').value) };
  for (const f of STAT_FIELDS) if (!(f === 'leadership' && $('#stats-leadership').hidden)) data[f] = Number(form.elements[f].value);
  $('#stats-error').textContent = '';
  $('#stats-ok').textContent = '';
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  const { ok, body } = await post('/api/gm/stats', data);
  button.disabled = false;
  if (!ok) {
    $('#stats-error').textContent = body.error || 'No se pudo guardar.';
    return;
  }
  fillStats(body);
  $('#stats-ok').textContent = `Listo: guardé los cambios de ${body.name}.`;
}

/* ----------------------------------------------------------------- tabs */

/** The token of a recovery link (`#restablecer=<token>`), kept while the reset page is up. */
let resetToken = '';

async function showReset() {
  $('#reset-error').textContent = '';
  $('#reset-ok').textContent = '';
  $('#reset-form').hidden = false;
  const { ok, body } = await api(`/api/reset?token=${encodeURIComponent(resetToken)}`);
  $('#reset-for').textContent = ok ? `Cuenta: ${body.login}` : body.error || 'El link no sirve.';
  $('#reset-form').hidden = !ok;
}

function showTab() {
  if (location.hash.startsWith('#restablecer=')) {
    resetToken = location.hash.slice('#restablecer='.length);
    // The token leaves the address bar (and the history) at once.
    window.history.replaceState(null, '', '#restablecer');
  }
  const asked = (location.hash || '#inicio').slice(1);
  // Old links to #pk and #resets land on the joined page.
  const tab = asked === 'pk' || asked === 'resets' ? 'rankings' : asked;
  const panel = document.getElementById(tab) ? tab : 'inicio';
  for (const s of document.querySelectorAll('main > section')) s.hidden = s.id !== panel;
  for (const a of document.querySelectorAll('.tabs a')) a.classList.toggle('active', a.dataset.tab === panel);
  for (const table of document.querySelectorAll(`#${panel} table.ranking`)) loadRanking(table);
  if (panel === 'cuenta') showAccount();
  if (panel === 'comunidad') showCommunity();
  if (panel === 'inicio') { loadNews(); loadOnline(); }
  if (panel === 'gm' && me?.moderator) { loadNews(); loadAllReports(); }
  if (panel === 'restablecer') showReset();
  $('#gm-tab').hidden = !me?.moderator;
}

document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('hashchange', showTab);
  loadMe().then(showTab);
  setInterval(() => { if (!$('#inicio').hidden) loadOnline(); }, 30_000);

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
    showAccount();
  });

  $('#recover-form').addEventListener('submit', async e => {
    e.preventDefault();
    const button = e.target.querySelector('button');
    $('#recover-error').textContent = '';
    $('#recover-ok').textContent = '';
    button.disabled = true;
    const { ok, body } = await post('/api/recover', { ask: new FormData(e.target).get('ask') });
    button.disabled = false;
    if (ok) $('#recover-ok').textContent = body.message;
    else $('#recover-error').textContent = body.error || 'No se pudo enviar.';
  });

  $('#reset-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = new FormData(e.target);
    $('#reset-error').textContent = '';
    if (form.get('password') !== form.get('confirm')) {
      $('#reset-error').textContent = 'Las contraseñas no coinciden.';
      return;
    }
    const { ok, body } = await post('/api/reset', { token: resetToken, password: form.get('password') });
    if (!ok) {
      $('#reset-error').textContent = body.error || 'No se pudo cambiar.';
      return;
    }
    e.target.reset();
    e.target.hidden = true;
    resetToken = '';
    $('#reset-ok').textContent = '';
    $('#reset-for').textContent = `Listo: la contraseña de ${body.login} cambió. Ya podés entrar al juego con la nueva.`;
  });

  $('#email-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = new FormData(e.target);
    $('#email-error').textContent = '';
    $('#email-ok').textContent = '';
    const { ok, body } = await post('/api/account/email', { email: form.get('email'), password: form.get('password') });
    if (!ok) {
      $('#email-error').textContent = body.error || 'No se pudo guardar.';
      return;
    }
    e.target.reset();
    $('#email-ok').textContent = 'Listo: guardamos tu e-mail.';
    showAccount();
  });

  $('#gm-group').addEventListener('change', gmBrowse);
  $('#gm-family').addEventListener('change', gmBrowse);
  $('#gm-results').addEventListener('change', gmPick);
  $('#gm-form').addEventListener('submit', gmGive);
  $('#stats-find').addEventListener('submit', statsLoad);
  $('#stats-form').addEventListener('submit', statsSave);
  $('#stats-skills').addEventListener('click', async e => {
    $('#stats-error').textContent = '';
    $('#stats-ok').textContent = '';
    e.target.disabled = true;
    const name = $('#stats-find').elements.name.value.trim();
    const { ok, body } = await post('/api/gm/skills', { name });
    e.target.disabled = false;
    if (!ok) $('#stats-error').textContent = body.error || 'No se pudo.';
    else $('#stats-ok').textContent = body.added ? `Listo: ${name} aprendió ${body.added} poderes nuevos (tiene ${body.total}).` : `${name} ya tenía todos los poderes de su clase.`;
  });
  $('#gm-all-exc').addEventListener('click', () => {
    const boxes = [...document.querySelectorAll('#gm-excellent input')];
    const all = boxes.every(b => b.checked);
    for (const b of boxes) b.checked = !all;
  });

  $('#report-kind').addEventListener('change', e => { $('#report-target').hidden = e.target.value !== 'player'; });
  $('#report-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = new FormData(e.target);
    $('#report-error').textContent = '';
    $('#report-ok').textContent = '';
    const { ok, body } = await post('/api/reports', { kind: form.get('kind'), target: form.get('target'), body: form.get('body'), link: form.get('link') });
    if (!ok) {
      $('#report-error').textContent = body.error || 'No se pudo enviar.';
      return;
    }
    e.target.reset();
    $('#report-target').hidden = true;
    $('#report-ok').textContent = 'Listo: el staff va a revisar tu reporte.';
    loadMyReports();
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
