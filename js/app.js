// Archives des cellules — interface joueurs et MJ
{
const app = document.getElementById('app');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = window.API_OVERRIDE || window.createApi(window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey));

/* ------------------------------------------------------------ état */
const D = { groupes: [], agents: [], secrets: {}, ops: [], seances: [], aides: [], notesC: {}, notePerso: '', profils: [] };
const U = { uid: null, profil: null, discord: '', state: 'loading', err: '', group: null, view: 'tableau', op: null, agent: null, lb: null, filter: 'all', lastLoad: 0, preview: null, savedGroup: null };
const VIEWS = [['tableau', 'Tableau'], ['agents', 'Agents'], ['operations', 'Opérations'], ['notes', 'Notes'], ['aides', 'Aides de jeu']];
const STATS = ['FOR', 'CON', 'DEX', 'INT', 'POU', 'CHA'];
const BASE_SK = [['Armes à feu', 20], ['Athlétisme', 30], ['Bureaucratie', 10], ['Combat à mains nues', 40], ['Combat au contact', 30], ['Comptabilité', 10], ['Conduite', 20], ['Criminologie', 10], ['Déguisement', 10], ['Discrétion', 10], ['Engins lourds', 10], ['Esquive', 30], ['Fouille', 20], ['Natation', 20], ['Occultisme', 10], ['Orientation', 10], ['Persuasion', 20], ['Premiers soins', 10], ['Psychothérapie', 10], ['Renseignement humain', 10], ['Survie', 10], ['Vigilance', 20]];

const realMJ = () => U.profil && U.profil.role === 'mj';
const isMJ = () => realMJ() && !U.preview;
const G = () => U.group;
const agentById = id => D.agents.find(a => a.id === id);
const groupById = id => D.groupes.find(g => g.id === id) || { id, nom: '—', monde: '' };
const opById = id => D.ops.find(o => o.id === id);
const myAgent = () => U.preview ? agentById(U.preview) : D.agents.find(a => a.joueur === U.uid);
const playerOf = a => (D.profils.find(p => p.id === a.joueur) || {}).discord || '';
const canEdit = a => !U.preview && (isMJ() || a.joueur === U.uid);
const groupAgents = () => D.agents.filter(a => a.groupe === G());
const groupOps = () => D.ops.filter(o => o.groupe === G() && (!U.preview || o.statut !== 'verrouillee'));
const groupAides = () => D.aides.filter(h => h.groupe === G() && (!U.preview || (h.visible && (!h.operation || (opById(h.operation) || {}).statut !== 'verrouillee'))));
const seancesOf = id => D.seances.filter(s => s.operation === id).sort((a, b) => a.numero - b.numero);

/* ------------------------------------------------------------ outils */
const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const str = (v, d = '') => typeof v === 'string' ? v : d;
const arr = v => Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [];
const bools = v => [0, 1, 2].map(i => !!(Array.isArray(v) && v[i]));
function norm(d) {
  d = d && typeof d === 'object' ? d : {};
  const st = d.stats || {}, stats = {};
  STATS.forEach(k => { stats[k] = num(st[k], 10); });
  const pvMax = Math.ceil((stats.FOR + stats.CON) / 2);
  return {
    name: str(d.name, 'Agent sans nom'), prof: str(d.prof), stats,
    pv: { cur: num(d.pv && d.pv.cur, pvMax), max: num(d.pv && d.pv.max, pvMax) },
    vol: { cur: num(d.vol && d.vol.cur, stats.POU), max: num(d.vol && d.vol.max, stats.POU) },
    motiv: str(d.motiv), liens: arr(d.liens).map(l => ({ n: str(l.n), s: num(l.s, 0) })),
    comps: Array.isArray(d.comps) ? arr(d.comps).map(c => ({ n: str(c.n), v: num(c.v, 0) })) : BASE_SK.map(([n, v]) => ({ n, v })),
    armes: arr(d.armes).map(w => ({ n: str(w.n), c: str(w.c), d: str(w.d), p: str(w.p) })),
    equip: str(d.equip), bless: str(d.bless), bio: str(d.bio),
    violence: bools(d.violence), impuiss: bools(d.impuiss),
  };
}
const fmtD = d => d ? new Date(d.length === 10 ? d + 'T12:00' : d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const fmtDT = d => new Date(d).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const toLocalInput = d => { if (!d) return ''; const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
const today = () => toLocalInput(new Date()).slice(0, 10);
const initials = s => esc(String(s || '?').replace(/[^\p{L}\d]/gu, '').slice(0, 2).toUpperCase() || '?');
const statusStamp = s => s === 'terminee' ? '<span class="stamp dim">Classée</span>' : s === 'en_cours' ? '<span class="stamp">En cours</span>' : '<span class="stamp dim">Verrouillée</span>';
const SIL = '<svg viewBox="0 0 80 100" aria-hidden="true"><rect width="80" height="100" fill="#7d8274"/><circle cx="40" cy="38" r="17" fill="#5d6256"/><path d="M8 100 C10 72 26 62 40 62 S70 72 72 100Z" fill="#5d6256"/></svg>';
const okImg = u => typeof u === 'string' && (u.startsWith('data:image/') || u.startsWith('https://'));
const portrait = (a, cls) => okImg(a.portrait) ? `<img class="${cls || ''}" src="${esc(a.portrait)}" alt="Portrait de ${esc(a.data.name)}">` : (cls ? `<span class="${cls}">${SIL}</span>` : SIL);

let toastT;
function toast(msg, err) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), err ? 4000 : 1100);
}
const fail = e => { console.error(e); toast('Erreur : ' + (e && e.message || 'enregistrement impossible'), true); };
const timers = {};
function later(key, fn, ms = 700) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => { delete timers[key]; Promise.resolve().then(fn).then(() => toast('Enregistré')).catch(fail); }, ms);
}
async function run(fn, msg) { try { await fn(); if (msg) toast(msg); } catch (e) { fail(e); } }

async function imageFile(file, maxW, maxH, crop) {
  const bmp = await createImageBitmap(file);
  let W, H, sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
  if (crop) { W = maxW; H = maxH; const r = Math.max(W / sw, H / sh); sw = W / r; sh = H / r; sx = (bmp.width - sw) / 2; sy = (bmp.height - sh) / 2; }
  else { const r = Math.min(1, maxW / sw, maxH / sh); if (r === 1 && file.size < 1.5e6) return file; W = Math.round(sw * r); H = Math.round(sh * r); }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, W, H);
  if (crop) return c.toDataURL('image/jpeg', .82);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .88));
  return new File([blob], (file.name || 'image').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

/* ------------------------------------------------------------ données */
async function reload() {
  U.profil = await api.profil(U.uid);
  if (!U.profil || U.profil.role === 'attente') { U.state = 'pending'; return; }
  if (U.profil.role === 'refuse') { U.state = 'refuse'; return; }
  const [g, a, o, s, h, n, p] = await Promise.all([api.groupes(), api.agents(), api.operations(), api.seances(), api.aides(), api.notesCommunes(), api.profils()]);
  D.groupes = g; D.ops = o; D.seances = s; D.aides = h; D.profils = p;
  D.agents = a.map(x => ({ ...x, data: norm(x.data) })).sort((x, y) => x.data.name.localeCompare(y.data.name));
  D.notesC = Object.fromEntries(n.map(x => [x.groupe, x]));
  if (realMJ()) { D.secrets = Object.fromEntries((await api.secrets()).map(x => [x.agent, x])); }
  else { D.secrets = {}; const np = await api.notePerso(U.uid); D.notePerso = np ? np.texte : ''; }
  if (U.preview && !agentById(U.preview)) { U.preview = null; U.group = U.savedGroup; }
  if (realMJ()) { if (!D.groupes.some(x => x.id === U.group)) U.group = (D.groupes[0] || {}).id || null; }
  else U.group = U.profil.groupe;
  U.state = 'app'; U.lastLoad = Date.now();
}
let entering = false;
async function enter(session) {
  if (entering) return; entering = true;
  U.uid = session.user.id;
  const m = session.user.user_metadata || {};
  U.discord = (m.custom_claims && m.custom_claims.global_name) || m.full_name || m.name || '';
  U.state = 'loading'; render();
  try { await reload(); } catch (e) { console.error(e); U.state = 'error'; U.err = e.message || String(e); }
  entering = false; route();
}

/* ------------------------------------------------------------ pages hors connexion */
function outside() {
  const box = inner => `<div class="login"><div class="box">${inner}</div></div>`;
  if (U.state === 'loading') return '<div class="loading">Ouverture des archives…</div>';
  if (U.state === 'pending') return box(`<span class="stamp">Accréditation en attente</span>
    <h1 style="margin:18px 0 10px">Votre compte Discord est reconnu.</h1>
    <p>Le meneur doit encore vous rattacher à votre agent. Revenez un peu plus tard.</p>
    <p class="muted sm">Connecté en tant que <b>${esc(U.discord || (U.profil && U.profil.discord))}</b>.</p>
    <div class="row"><button class="primary" data-act="refresh">Actualiser</button><button data-act="logout">Se déconnecter</button></div>`);
  if (U.state === 'refuse') return box(`<span class="stamp">Accès refusé</span><h1 style="margin:18px 0 10px">Ce compte n’a pas accès aux archives.</h1><button data-act="logout">Se déconnecter</button>`);
  if (U.state === 'error') return box(`<span class="stamp">Erreur</span><h1 style="margin:18px 0 10px">Impossible d’ouvrir les archives.</h1><p class="muted sm">${esc(U.err)}</p><div class="row"><button class="primary" data-act="refresh">Réessayer</button><button data-act="logout">Se déconnecter</button></div>`);
  return box(`<div class="loghead">${EMBLEM(96)}<span class="stamp">Accès restreint</span></div>
    <h1 style="margin:18px 0 8px">Archives des cellules</h1>
    <p>Dossiers des agents, comptes rendus d’opérations, notes et pièces à conviction. Identifiez-vous avec votre compte Discord.</p>
    <div style="margin-top:22px"><button class="discord" data-act="login"><svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true"><path fill="#fff" d="M18.6 1.3A18 18 0 0 0 14.1 0l-.6 1.2a16.7 16.7 0 0 0-5 0L7.9 0a18 18 0 0 0-4.5 1.3C.6 5.6-.2 9.8.2 13.9A18 18 0 0 0 5.7 16l1.1-1.8c-.6-.2-1.2-.5-1.8-.9l.4-.3a12.8 12.8 0 0 0 11.2 0l.4.3c-.6.4-1.2.7-1.8.9l1.1 1.8a18 18 0 0 0 5.5-2.1c.5-4.8-.8-8.9-3.2-12.6ZM7.4 11.4c-1.1 0-2-1-2-2.2S6.3 7 7.4 7s2 1 2 2.2-.9 2.2-2 2.2Zm7.2 0c-1.1 0-2-1-2-2.2s.9-2.2 2-2.2 2 1 2 2.2-.9 2.2-2 2.2Z"/></svg>Se connecter avec Discord</button></div>`);
}

/* ------------------------------------------------------------ cadre */
function header() {
  const me = myAgent();
  if (U.preview) {
    const who = playerOf(me) || 'joueur non rattaché';
    return `<div class="pvbar" role="status"><span><b>Aperçu joueur</b> · ce que voit ${esc(who)} (${esc(me.data.name)}). Lecture seule.</span><button class="small" data-act="preview-off">Quitter l’aperçu</button></div>
    <header class="top"><div class="brand">${EMBLEM(52)}<span>Archives des cellules<small>${esc(groupById(G()).nom)}</small></span></div>
    <span class="chip"><span class="av">${initials(who)}</span><span>${esc(who)}<br><span style="opacity:.7;font-size:13px">${esc(me.data.name)}</span></span></span></header>`;
  }
  const av = okImg(U.profil.avatar) ? `<img class="av" src="${esc(U.profil.avatar)}" alt="">` : `<span class="av"${isMJ() ? ' style="background:#b3261e"' : ''}>${isMJ() ? 'MJ' : initials(U.profil.discord)}</span>`;
  return `<div class="classif" aria-hidden="true"><span>Confidentiel · Accès restreint · Ne pas diffuser · Confidentiel · Accès restreint · Ne pas diffuser · Confidentiel · Accès restreint · Ne pas diffuser</span></div>
  <header class="top"><div class="brand">${EMBLEM(52)}<span>Archives des cellules<small>${isMJ() ? 'Meneur de jeu' : esc(groupById(G()).nom)}</small></span></div>
   ${isMJ() ? `<label class="chip" style="margin:0">Groupe <select data-in="group" aria-label="Groupe affiché">${D.groupes.map(x => `<option value="${esc(x.id)}"${x.id === U.group ? ' selected' : ''}>${esc(x.nom)}</option>`).join('')}</select></label>` : ''}
   <span class="chip">${av}<span>${esc(U.profil.discord)}<br><span style="opacity:.7;font-size:13px">${isMJ() ? 'Accès complet' : esc(me ? me.data.name : 'Sans agent')}</span></span></span>
   <button class="small" data-act="logout">Se déconnecter</button></header>`;
}
function tabs() {
  const v = [...VIEWS]; if (isMJ()) v.push(['mj', 'Espace MJ']);
  return `<nav class="tabs" aria-label="Sections">${v.map(([k, l]) => `<a href="#${k}"${k === 'mj' ? ' class="mj"' : ''}${U.view === k ? ' aria-current="page"' : ''}>${icon(TABICO[k])}${l}</a>`).join('')}</nav>`;
}

/* ------------------------------------------------------------ tableau */
function vit(a) {
  const m = (l, c, x, bad) => `<div class="sm" style="margin-top:6px">${l} <span class="val">${c}/${x}</span><div class="meter${bad ? ' bad' : ''}"><i style="width:${x > 0 ? Math.max(0, Math.min(100, c / x * 100)) : 0}%"></i></div></div>`;
  const s = D.secrets[a.id];
  return m('PV', a.data.pv.cur, a.data.pv.max, a.data.pv.cur <= 2) + m('VOL', a.data.vol.cur, a.data.vol.max, a.data.vol.cur <= 2)
    + (isMJ() && s ? m('SAN', s.san, s.san_max, s.san <= s.seuil) + `<div class="sm muted">Seuil de rupture : <span class="val">${s.seuil}</span></div>` : '');
}
function tableau() {
  const g = groupById(G()), cur = groupOps().find(o => o.statut === 'en_cours');
  const ss = cur ? seancesOf(cur.id) : [], last = ss[ss.length - 1];
  const me = !isMJ() && myAgent();
  const recent = groupAides().filter(h => h.visible).slice(-3).reverse();
  return `<div class="hd"><h1>${esc(g.nom)}</h1><span class="muted sm">${esc(g.monde)}</span></div>
  <div class="grid g2" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)">
   <div class="box tint">${cur ? `<div class="hd"><h2>${esc(cur.titre)}</h2>${statusStamp(cur.statut)}</div>
     ${last ? `<p class="sm muted">Dernière séance : n°${last.numero}${last.date ? ', ' + fmtD(last.date) : ''}</p><p style="white-space:pre-line">${esc(last.compte_rendu)}</p>` : '<p class="muted">Aucune séance pour l’instant.</p>'}
     <button data-act="openop" data-id="${cur.id}">Lire tout le dossier</button>` : '<div class="empty">Aucune opération en cours.</div>'}</div>
   <div class="grid" style="align-content:start">
    <div class="box"><h3>Prochaine séance</h3>
     ${isMJ() ? `<input type="datetime-local" data-in="next" value="${esc(toLocalInput(g.prochaine_seance))}" aria-label="Date de la prochaine séance" style="margin-top:8px">`
              : `<p class="val" style="font-size:19px;margin:.4em 0 0">${g.prochaine_seance ? esc(fmtDT(g.prochaine_seance)) : 'À fixer'}</p>`}</div>
    ${me ? `<div class="box"><div class="hd" style="margin-bottom:8px"><span class="row">${portrait(me, 'pt')}<h3>${esc(me.data.name)}</h3></span><a href="#agents" class="sm">Ma fiche</a></div>${vit(me)}</div>`
         : `<div class="box"><h3 style="margin-bottom:8px">Agents</h3>${groupAgents().length ? `<ul class="list">${groupAgents().map(a => `<li style="padding:8px 0"><span class="row">${portrait(a, 'pt')}<span><b>${esc(a.data.name)}</b> <span class="sm muted">${esc(playerOf(a))}</span></span></span>${vit(a)}</li>`).join('')}</ul>` : '<p class="muted">Aucun agent.</p>'}</div>`}
   </div></div>
  <div class="sec"><h3>Dernières pièces versées au dossier</h3>${recent.length ? `<div class="ev">${recent.map(card).join('')}</div>` : '<div class="empty">Aucune pour l’instant.</div>'}</div>`;
}

/* ------------------------------------------------------------ fiches */
function inp(a, path, val, type, extra) {
  return `<input${type === 'n' ? ' type="number" inputmode="numeric"' : ''} data-a="${a.id}" data-f="${path}" value="${esc(val)}"${canEdit(a) ? '' : ' disabled'}${extra || ''}>`;
}
const ICO = {
  stats: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  pulse: '<polyline points="2 12 7 12 10 5 14 19 17 12 22 12"/>',
  motiv: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  liens: '<path d="M10 14a4 4 0 0 1 0-5.6l2.8-2.8a4 4 0 0 1 5.6 5.6l-1.4 1.4"/><path d="M14 10a4 4 0 0 1 0 5.6l-2.8 2.8a4 4 0 0 1-5.6-5.6l1.4-1.4"/>',
  skills: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  arme: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  equip: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>',
  bless: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
  bio: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-7 8-7s7 2.5 8 7"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="1"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>',
};
const TABICO = { tableau: 'stats', agents: 'person', operations: 'motiv', notes: 'pen', aides: 'photo', mj: 'key' };
const EMBLEM = s => `<svg class="emblem" width="${s}" height="${s}" viewBox="0 0 120 120" aria-hidden="true"><defs><path id="ring" d="M60 60 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0"/></defs>
 <circle cx="60" cy="60" r="57" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="1"/>
 <circle cx="60" cy="60" r="33" fill="none" stroke="currentColor" stroke-width="2"/>
 <text font-family="Special Elite,monospace" font-size="10.5" fill="currentColor" letter-spacing="1.2"><textPath href="#ring">ARCHIVES DES CELLULES · ACCÈS RESTREINT ·</textPath></text>
 <path d="M42 48h13l4 5h19v23H42z" fill="currentColor" opacity=".9"/><path d="M42 56h36" stroke="var(--embg,#3a4733)" stroke-width="2"/>
 <circle cx="60" cy="64" r="3.2" fill="var(--embg,#3a4733)"/><path d="M58.6 66h2.8l1 6h-4.8z" fill="var(--embg,#3a4733)"/>
 <path d="M60 30l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="currentColor"/></svg>`;
const icon = k => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICO[k]}</svg>`;
const panel = (k, title, body, cls) => `<section class="panel ${cls || ''}"><h3 class="ph">${icon(k)}<span>${title}</span></h3><div class="pb">${body}</div></section>`;
function richMotiv(t) {
  let mode = 'm'; const m = [], tr = [];
  String(t || '').split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
    if (/^troubles?\s*:?$/i.test(l)) { mode = 't'; return; }
    (mode === 'm' ? m : tr).push(l);
  });
  if (!m.length && !tr.length) return '<p class="muted sm">Rien d’indiqué.</p>';
  return (m.length ? `<ul class="mlist">${m.map(l => { const [a, ...b] = l.split(' — '); return `<li><b>${esc(a)}</b>${b.length ? `<span>${esc(b.join(' — '))}</span>` : ''}</li>`; }).join('')}</ul>` : '')
    + (tr.length ? `<div class="troubles"><span class="tlabel">Troubles</span>${tr.map(l => `<span class="tag">${esc(l)}</span>`).join('')}</div>` : '');
}
function agents() {
  const list = groupAgents();
  if (!list.length) return `<h1>Agents</h1><div class="empty" style="margin-top:20px">Aucun agent dans ce groupe.${isMJ() ? ' Crée-les ou importe-les depuis l’Espace MJ.' : ''}</div>`;
  if (!U.agent || !list.some(a => a.id === U.agent)) U.agent = (myAgent() && myAgent().groupe === G() ? myAgent() : list[0]).id;
  const a = agentById(U.agent), d = a.data, ed = canEdit(a), s = D.secrets[a.id];
  const area = (path, ph) => ed ? `<textarea class="ruled" id="f-${path}" data-a="${a.id}" data-f="${path}" placeholder="${ph || ''}" aria-label="${path}">${esc(d[path])}</textarea>`
    : (d[path] ? `<div class="ro-text">${esc(d[path])}</div>` : '<p class="muted sm">Rien d’indiqué.</p>');
  const x = (k, i) => ed ? `<button class="x" data-act="del" data-a="${a.id}" data-k="${k}" data-i="${i}" aria-label="Supprimer">×</button>` : '';
  const meter = (l, c, m) => `<div class="vital"><div class="vl"><span>${l}</span><b class="val">${c} / ${m}</b></div><div class="meter${c <= 2 ? ' bad' : ''}"><i style="width:${m > 0 ? Math.max(0, Math.min(100, c / m * 100)) : 0}%"></i></div></div>`;
  const stamp = U.preview && a.id === U.preview ? '<span class="stamp ok">Son dossier · modifiable par lui</span>' : ed ? (isMJ() ? '<span class="stamp">Édition MJ</span>' : '<span class="stamp ok">Votre dossier</span>') : '<span class="stamp dim">Lecture seule</span>';
  const dossier = String(a.foundry_id || a.id).replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase();
  const liens = d.liens.length || ed ? `<ul class="bonds">${d.liens.map((l, i) => ed
      ? `<li class="bond"><input class="score" type="number" data-a="${a.id}" data-f="liens.${i}.s" value="${esc(l.s)}" aria-label="Score"><textarea class="bn-ed" rows="2" data-a="${a.id}" data-f="liens.${i}.n" aria-label="Lien">${esc(l.n)}</textarea>${x('liens', i)}</li>`
      : `<li class="bond"><span class="score">${esc(l.s)}</span><span class="bn">${esc(l.n)}</span></li>`).join('')}</ul>${ed ? '<button class="small" data-act="add" data-k="liens">+ Lien</button>' : ''}` : '<p class="muted sm">Aucun lien.</p>';
  const adapt = `<div class="adapt"><div class="checks"><span>Adapté à la violence</span>${d.violence.map((c, i) => `<input type="checkbox" data-a="${a.id}" data-f="violence.${i}"${c ? ' checked' : ''}${ed ? '' : ' disabled'} aria-label="Violence ${i + 1}">`).join('')}</div>
     <div class="checks"><span>Adapté à l’impuissance</span>${d.impuiss.map((c, i) => `<input type="checkbox" data-a="${a.id}" data-f="impuiss.${i}"${c ? ' checked' : ''}${ed ? '' : ' disabled'} aria-label="Impuissance ${i + 1}">`).join('')}</div></div>`;
  return `<div class="grid side">
  <div><h2 style="margin-bottom:10px">Agents</h2><ul class="list">${list.map(y => `<li><button class="pick" data-act="agent" data-id="${y.id}"${y.id === a.id ? ' aria-current="true"' : ''}>${portrait(y, 'pt')}<span><b>${esc(y.data.name)}</b><span class="sm muted">${esc(playerOf(y) || 'pas de joueur')}${y.joueur === U.uid ? ' · vous' : ''}</span></span></button></li>`).join('')}</ul></div>
  <article class="dossier">
   <div class="idcard"><div><div class="portrait">${portrait(a)}</div>
     ${ed ? `<div class="pbtns"><label class="btn small" for="pf-${a.id}">${a.portrait ? 'Changer la photo' : 'Ajouter une photo'}</label><input class="vis" type="file" accept="image/*" id="pf-${a.id}" data-portrait="${a.id}">${a.portrait ? `<button class="small" data-act="delportrait" data-id="${a.id}">Retirer</button>` : ''}</div>` : ''}</div>
    <div><div class="dosno">Dossier n° ${esc(dossier)} · ${esc(groupById(a.groupe).nom)}</div>
     <div class="hd" style="margin-bottom:6px"><h1>${esc(d.name)}</h1>${stamp}</div>
     <p class="prof">${esc(d.prof) || '<span class="muted">Profession non renseignée</span>'}${playerOf(a) ? `<span class="muted"> · joué par ${esc(playerOf(a))}</span>` : ''}</p>
     <div class="vitals">${meter('Points de vie', d.pv.cur, d.pv.max)}${meter('Volonté', d.vol.cur, d.vol.max)}
      ${isMJ() && s ? meter('Santé mentale', s.san, s.san_max) : '<div class="vital"><div class="vl"><span>Santé mentale</span></div><span class="redact">CLASSIFIÉ</span></div>'}</div>
     ${ed ? `<details class="idedit"><summary>Modifier le nom et la profession</summary><div class="grid g2"><div><label>Nom de l’agent</label>${inp(a, 'name', d.name)}</div><div><label>Profession</label>${inp(a, 'prof', d.prof)}</div></div></details>` : ''}</div></div>
   <div class="sheetgrid">
    ${panel('stats', 'Caractéristiques', `<div class="stats">${STATS.map(k => `<div class="stat"><label>${k}</label>${inp(a, 'stats.' + k, d.stats[k], 'n', ` aria-label="${k}"`)}<div class="x5" id="x5-${k}">×5 = ${d.stats[k] * 5}</div></div>`).join('')}</div>`, 'wide')}
    ${panel('pulse', 'Attributs dérivés', `<div class="derived">
     <div><label>Points de vie</label><div class="pair">${inp(a, 'pv.cur', d.pv.cur, 'n', ' aria-label="PV actuels"')}<span>/</span>${inp(a, 'pv.max', d.pv.max, 'n', ' aria-label="PV max"')}</div></div>
     <div><label>Volonté</label><div class="pair">${inp(a, 'vol.cur', d.vol.cur, 'n', ' aria-label="VOL actuelle"')}<span>/</span>${inp(a, 'vol.max', d.vol.max, 'n', ' aria-label="VOL max"')}</div></div>
     <div><label>Santé mentale</label>${isMJ() && s ? `<div class="pair"><input type="number" data-secret="${a.id}" data-f="san" value="${s.san}" aria-label="SAN"><span>/</span><input type="number" data-secret="${a.id}" data-f="san_max" value="${s.san_max}" aria-label="SAN max"></div>` : '<span class="redact">CLASSIFIÉ</span>'}</div>
     <div><label>Seuil de rupture</label>${isMJ() && s ? `<input type="number" data-secret="${a.id}" data-f="seuil" value="${s.seuil}" aria-label="Seuil de rupture">` : '<span class="redact">CLASSIFIÉ</span>'}</div>
    </div>${adapt}`, 'wide')}
    ${panel('motiv', 'Motivations et troubles', ed ? area('motiv', 'Une motivation par ligne. Écrire « Troubles : » puis un trouble par ligne.') : richMotiv(d.motiv), 'm')}
    ${panel('liens', 'Liens', liens, 'l')}
    ${panel('skills', 'Compétences', `<div class="skills">${d.comps.map((c, i) => `<div class="sk${ed ? '' : ' ro'}">${inp(a, `comps.${i}.n`, c.n, '', ' aria-label="Compétence"')}${inp(a, `comps.${i}.v`, c.v, 'n', ' aria-label="Pourcentage"')}${x('comps', i)}</div>`).join('')}</div>
      ${ed ? '<button class="small" data-act="add" data-k="comps" style="margin-top:10px">+ Compétence</button>' : ''}`, 'wide')}
    ${panel('arme', 'Armes', `${d.armes.length ? `<div class="weap${ed ? '' : ' ro'} sm muted"><span>Arme</span><span>Compétence</span><span>Dégâts</span><span>Portée</span></div>` : ''}
      ${d.armes.map((w, i) => `<div class="weap${ed ? '' : ' ro'}">${inp(a, `armes.${i}.n`, w.n, '', ' aria-label="Arme"')}${inp(a, `armes.${i}.c`, w.c, '', ' aria-label="Compétence"')}${inp(a, `armes.${i}.d`, w.d, '', ' aria-label="Dégâts"')}${inp(a, `armes.${i}.p`, w.p, '', ' aria-label="Portée"')}${x('armes', i)}</div>`).join('') || '<p class="muted sm">Aucune arme.</p>'}
      ${ed ? '<button class="small" data-act="add" data-k="armes" style="margin-top:6px">+ Arme</button>' : ''}`, 'wide')}
    ${panel('equip', 'Équipement', area('equip', 'Un objet par ligne'), 'm')}
    ${panel('bless', 'Blessures et séquelles', area('bless', 'Blessures en cours, séquelles…'), 'l red')}
    ${panel('bio', 'Historique et notes', area('bio', 'Origines, carrière, faits marquants…'), 'wide')}
   </div>
  </article></div>`;
}

/* ------------------------------------------------------------ opérations */
function operations() {
  const list = groupOps(), mj = isMJ();
  if (!U.op || !list.some(o => o.id === U.op)) U.op = (list.find(o => o.statut === 'en_cours') || list[0] || {}).id;
  const o = opById(U.op);
  const side = `<div><div class="hd" style="margin-bottom:12px"><h2>Opérations</h2>${mj ? '<button class="small" data-act="newop">+ Nouvelle</button>' : ''}</div>
   ${list.length ? `<div class="tl">${list.map(x => `<div class="op${x.statut === 'en_cours' ? ' cur' : ''}${x.statut === 'verrouillee' ? ' locked' : ''}"><button data-act="op" data-id="${x.id}"${x.id === U.op ? ' aria-current="true"' : ''}><span class="typed" style="font-size:17px">${esc(x.titre)}</span><br><span class="sm muted">${esc(x.periode || '')}</span></button></div>`).join('')}</div>` : '<p class="muted">Aucune opération.</p>'}</div>`;
  if (!o) return `<div class="grid side">${side}<article><div class="empty">${mj ? 'Crée ta première opération avec « + Nouvelle ».' : 'Aucune opération pour l’instant.'}</div></article></div>`;
  const ss = seancesOf(o.id), pieces = groupAides().filter(h => h.operation === o.id && (mj || h.visible));
  const piecesHtml = `<h3 style="margin-top:28px">Pièces liées</h3>${pieces.length ? `<div class="ev">${pieces.map(card).join('')}</div>` : '<p class="muted">Aucune.</p>'}`;
  if (!mj) return `<div class="grid side">${side}<article><div class="hd"><h1>${esc(o.titre)}</h1>${statusStamp(o.statut)}</div>
    ${o.resume ? `<div class="box tint"><h3 style="margin-bottom:6px">Résumé de l’opération</h3><p style="margin:0;white-space:pre-line">${esc(o.resume)}</p></div>` : ''}
    ${ss.length ? `<h3 style="margin-top:24px">Comptes rendus de séance</h3>${ss.slice().reverse().map(s => `<div class="cr"><div class="typed">Séance ${s.numero}</div><div class="sm muted">${fmtD(s.date)}</div><p style="white-space:pre-line">${esc(s.compte_rendu)}</p></div>`).join('')}` : '<p class="muted" style="margin-top:20px">Aucun compte rendu pour l’instant.</p>'}
    ${piecesHtml}</article></div>`;
  return `<div class="grid side">${side}<article>
    <div class="mjbar"><div style="flex:3 1 260px"><label for="op-t">Titre</label><input id="op-t" class="edit-title" data-op="${o.id}" data-of="titre" value="${esc(o.titre)}"></div>
     <div><label for="op-s">Statut</label><select id="op-s" data-opst="${o.id}">${[['verrouillee', 'Verrouillée (invisible)'], ['en_cours', 'En cours'], ['terminee', 'Classée']].map(([k, l]) => `<option value="${k}"${o.statut === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="mjbar"><div><label for="op-p">Période</label><input id="op-p" data-op="${o.id}" data-of="periode" value="${esc(o.periode)}" placeholder="ex. Depuis novembre 2026"></div>
     <div style="flex:0 0 auto"><button class="small danger" data-act="delop" data-id="${o.id}" data-confirm>Supprimer l’opération</button></div></div>
    <label for="op-r">Résumé (à remplir quand l’opération est classée)</label><textarea id="op-r" data-op="${o.id}" data-of="resume">${esc(o.resume)}</textarea>
    <div class="hd" style="margin-top:26px"><h3>Comptes rendus de séance</h3><button class="small primary" data-act="addseance" data-id="${o.id}">+ Séance</button></div>
    ${ss.length ? ss.slice().reverse().map(s => `<div class="cr-ed"><div class="row"><span class="typed">Séance</span><input type="number" data-se="${s.id}" data-sf="numero" value="${s.numero}" style="width:80px" aria-label="Numéro">
      <input type="date" data-se="${s.id}" data-sf="date" value="${esc(s.date || '')}" style="width:auto" aria-label="Date"><button class="small danger" data-act="delseance" data-id="${s.id}" data-confirm>Supprimer</button></div>
      <textarea data-se="${s.id}" data-sf="compte_rendu" aria-label="Compte rendu" placeholder="Ce qui s’est passé…">${esc(s.compte_rendu)}</textarea></div>`).join('') : '<p class="muted">Aucune séance.</p>'}
    ${piecesHtml}</article></div>`;
}

/* ------------------------------------------------------------ notes */
function notes() {
  const c = D.notesC[G()] || { texte: '', modifie_par: '', modifie_le: null };
  return `<div class="hd"><h1>Notes</h1></div><div class="grid g2">
   <div class="box tint"><h2 style="margin-bottom:4px">Note du groupe</h2><p class="sm muted" id="cby">${c.modifie_par ? `Dernière modification : ${esc(c.modifie_par)}, ${esc(fmtDT(c.modifie_le))}` : 'Vide pour l’instant.'}</p>
    <textarea data-note="commune" style="min-height:340px" aria-label="Note commune"${U.preview ? ' disabled' : ''}>${esc(c.texte)}</textarea><p class="sm muted">Visible et modifiable par tout le groupe et le meneur. Évitez d’écrire à plusieurs en même temps : le dernier enregistrement l’emporte.</p></div>
   ${isMJ() ? `<div class="box"><h2 style="margin-bottom:4px">Carnets des joueurs</h2><p>Chaque joueur dispose d’un carnet privé, visible de lui seul sur le site.</p></div>`
            : U.preview ? `<div class="box"><h2 style="margin-bottom:4px">Mon carnet</h2><p class="sm muted">Ici, le joueur a son carnet privé. Son contenu ne t’est pas accessible, même en aperçu.</p><div class="empty">Carnet privé</div></div>`
            : `<div class="box"><h2 style="margin-bottom:4px">Mon carnet</h2><p class="sm muted">Privé : personne d’autre ne le voit sur le site.</p>
    <textarea data-note="perso" style="min-height:340px" aria-label="Note personnelle">${esc(D.notePerso)}</textarea></div>`}</div>`;
}

/* ------------------------------------------------------------ aides */
function card(h) {
  const r = ((h.id.charCodeAt(0) * 7 + h.id.charCodeAt(2)) % 5 - 2) * .8, op = opById(h.operation);
  const img = h.url ? `<img src="${esc(h.url)}" alt="" loading="lazy">` : '<div class="noimg">Pas d’image</div>';
  return `<button class="card${h.visible ? '' : ' lock'}" data-act="lb" data-id="${h.id}" style="--r:${r}deg"><div class="ph">${img}</div><div class="cap"><b>${esc(h.titre)}</b><br><span class="muted">${esc(op ? op.titre : 'Hors opération')}${h.visible ? '' : ' · cachée aux joueurs'}</span></div></button>`;
}
function aidesView() {
  const all = groupAides().filter(h => isMJ() || h.visible), opsWith = [...new Set(all.map(h => h.operation || ''))];
  const list = all.filter(h => U.filter === 'all' || (h.operation || '') === U.filter);
  return `<div class="hd"><h1>Aides de jeu</h1><span class="muted sm">${all.length} pièce${all.length > 1 ? 's' : ''}${isMJ() ? ' · ajout depuis l’Espace MJ' : ''}</span></div>
  ${opsWith.length > 1 ? `<div class="row" style="margin-bottom:22px"><button class="small${U.filter === 'all' ? ' primary' : ''}" data-act="filter" data-id="all">Toutes</button>${opsWith.map(id => `<button class="small${U.filter === id ? ' primary' : ''}" data-act="filter" data-id="${esc(id)}">${esc(id ? (opById(id) || {}).titre : 'Hors opération')}</button>`).join('')}</div>` : ''}
  ${list.length ? `<div class="ev">${list.map(card).join('')}</div>` : '<div class="empty">Aucune aide de jeu pour l’instant.</div>'}`;
}
function lightbox() {
  if (!U.lb) return '';
  const list = groupAides().filter(h => isMJ() || h.visible);
  const i = list.findIndex(h => h.id === U.lb); if (i < 0) return '';
  const h = list[i], n = list.length;
  return `<div class="lb" role="dialog" aria-modal="true" aria-label="${esc(h.titre)}"><div class="bar"><span class="typed" style="font-size:19px">${esc(h.titre)}</span><span class="row">${h.url ? `<a class="btn small" style="border-color:#8f9b84;color:#ecebdf" href="${esc(h.url)}" target="_blank" rel="noopener">Ouvrir en grand</a>` : ''}<button data-act="lbclose">Fermer</button></span></div>
   <div class="img">${h.url ? `<img src="${esc(h.url)}" alt="${esc(h.titre)}">` : '<div class="noimg" style="width:300px">Pas d’image</div>'}</div>
   <div class="bar">${n > 1 ? `<button data-act="lb" data-id="${list[(i - 1 + n) % n].id}">← Précédente</button><span class="sm">${i + 1} / ${n}</span><button data-act="lb" data-id="${list[(i + 1) % n].id}">Suivante →</button>` : ''}</div></div>`;
}

/* ------------------------------------------------------------ espace MJ */
function mj() {
  const g = groupById(G()), ag = groupAgents(), ops = groupOps(), aides = groupAides();
  const pend = D.profils.filter(p => p.role === 'attente'), joueurs = D.profils.filter(p => p.role === 'joueur'), refus = D.profils.filter(p => p.role === 'refuse');
  const free = (D.agents.find(a => !a.joueur) || {}).id;
  const agentOpts = D.groupes.map(gr => `<optgroup label="${esc(gr.nom)}">${D.agents.filter(a => a.groupe === gr.id).map(a => `<option value="${a.id}"${a.id === free ? ' selected' : ''}>${esc(a.data.name)}${a.joueur ? ' (' + esc(playerOf(a)) + ')' : ''}</option>`).join('')}</optgroup>`).join('');
  return `<div class="hd"><h1>Espace MJ</h1></div>
  <div class="box tint" style="margin-bottom:22px"><h2 style="margin-bottom:6px">Voir comme un joueur</h2><p class="sm muted" style="margin-top:0">Affiche le site tel que le voit le joueur d’un agent : sans SAN, sans opérations verrouillées ni aides cachées.</p>
   ${D.agents.length ? `<div class="row"><select id="pv-a" aria-label="Agent" style="flex:1 1 220px">${D.groupes.map(gr => `<optgroup label="${esc(gr.nom)}">${D.agents.filter(a => a.groupe === gr.id).map(a => `<option value="${a.id}"${a.groupe === G() ? '' : ''}>${esc(a.data.name)}${a.joueur ? ' (' + esc(playerOf(a)) + ')' : ''}</option>`).join('')}</optgroup>`).join('')}</select><button class="primary small" data-act="preview-on">Voir comme ce joueur</button></div>` : '<p class="muted">Aucun agent.</p>'}</div>
  <div class="box"><h2 style="margin-bottom:10px">Accréditations</h2>
   ${pend.length ? pend.map(p => `<div style="margin-bottom:14px"><p style="margin:0 0 6px"><b>${esc(p.discord)}</b> <span class="sm muted">connecté le ${fmtD(p.cree_le)}</span></p>
     ${D.agents.length ? `<div class="row"><select data-pend="${p.id}" aria-label="Rattacher à l’agent" style="flex:1 1 220px">${agentOpts}</select><button class="small primary" data-act="accr" data-id="${p.id}">Accréditer</button><button class="small danger" data-act="refuse" data-id="${p.id}" data-confirm>Refuser</button></div>` : '<p class="sm muted">Crée d’abord les agents pour pouvoir le rattacher.</p>'}</div>`).join('') : '<p class="muted">Aucune demande en attente.</p>'}
   ${joueurs.length ? `<h3 style="margin:18px 0 8px">Joueurs accrédités</h3><table class="stack"><thead><tr><th>Discord</th><th>Agent</th><th>Groupe</th><th></th></tr></thead><tbody>${joueurs.map(p => { const a = D.agents.find(x => x.joueur === p.id); return `<tr><td>${esc(p.discord)}</td><td>${esc(a ? a.data.name : '—')}</td><td>${esc(groupById(p.groupe).nom)}</td><td class="n"><button class="small danger" data-act="retirer" data-id="${p.id}" data-confirm>Retirer l’accès</button></td></tr>`; }).join('')}</tbody></table>` : ''}
   ${refus.length ? `<h3 style="margin:18px 0 8px">Comptes refusés</h3>${refus.map(p => `<div class="row" style="margin-bottom:6px"><span>${esc(p.discord)}</span><button class="small" data-act="retirer" data-id="${p.id}">Remettre en attente</button></div>`).join('')}` : ''}
   <p class="sm muted">Chaque compte Discord qui se connecte arrive ici. Il ne voit rien tant que tu ne l’as pas rattaché à un agent.</p></div>

  <div class="grid g2 sec">
   <div class="box"><h2 style="margin-bottom:10px">Groupe affiché</h2>
    <div class="grid" style="gap:12px"><div><label for="g-n">Nom</label><input id="g-n" data-g="nom" value="${esc(g.nom)}"></div><div><label for="g-m">Monde Foundry</label><input id="g-m" data-g="monde" value="${esc(g.monde)}"></div></div>
    <p class="sm muted">Change de groupe avec le menu en haut de la page.</p></div>
   <div class="box"><h2 style="margin-bottom:10px">Nouvel agent</h2>
    <label for="na">Nom</label><div class="row"><input id="na" style="flex:1 1 200px" placeholder="Nom de l’agent"><button class="small primary" data-act="newagent">Créer</button></div>
    <p class="sm muted">Il rejoint ${esc(g.nom)}. Tu pourras compléter sa fiche dans l’onglet Agents.</p></div>
  </div>

  <div class="box sec"><h2 style="margin-bottom:10px">Agents et santé mentale</h2>
   ${ag.length ? `<table class="stack"><thead><tr><th>Agent</th><th>Joueur</th><th>SAN</th><th>Max</th><th>Seuil</th><th></th></tr></thead><tbody>${ag.map(a => { const s = D.secrets[a.id] || { san: 0, san_max: 99, seuil: 0 }; return `<tr><td>${esc(a.data.name)}</td><td>${esc(playerOf(a) || '—')}</td>
     <td class="n"><input type="number" data-secret="${a.id}" data-f="san" value="${s.san}" style="width:80px" aria-label="SAN de ${esc(a.data.name)}"></td>
     <td class="n"><input type="number" data-secret="${a.id}" data-f="san_max" value="${s.san_max}" style="width:80px" aria-label="SAN max de ${esc(a.data.name)}"></td>
     <td class="n"><input type="number" data-secret="${a.id}" data-f="seuil" value="${s.seuil}" style="width:80px" aria-label="Seuil de ${esc(a.data.name)}"></td>
     <td class="n"><button class="small danger" data-act="delagent" data-id="${a.id}" data-confirm>Supprimer</button></td></tr>`; }).join('')}</tbody></table>` : '<p class="muted">Aucun agent dans ce groupe.</p>'}
   <p class="sm muted">Ces valeurs ne sont jamais envoyées aux navigateurs des joueurs.</p></div>

  <div class="box sec"><h2 style="margin-bottom:10px">Aides de jeu</h2>
   <div class="mjbar"><div><label for="ah-t">Titre</label><input id="ah-t" placeholder="ex. Carte de la côte"></div>
    <div><label for="ah-o">Opération</label><select id="ah-o"><option value="">Hors opération</option>${ops.map(o => `<option value="${o.id}"${o.id === U.op ? ' selected' : ''}>${esc(o.titre)}</option>`).join('')}</select></div>
    <div><label for="ah-f">Image</label><input id="ah-f" type="file" accept="image/*"></div>
    <div style="flex:0 0 auto"><button class="primary" data-act="addaide">Ajouter</button></div></div>
   <p class="sm muted" style="margin-top:-6px">Une nouvelle pièce est cachée aux joueurs : rends-la visible au bon moment.</p>
   ${aides.length ? `<ul class="list">${aides.map(h => `<li class="row" style="padding:8px 0;justify-content:space-between"><span><b>${esc(h.titre)}</b><br><span class="sm muted">${esc((opById(h.operation) || {}).titre || 'Hors opération')}</span></span>
     <span class="row"><button class="small${h.visible ? '' : ' primary'}" data-act="toggleaide" data-id="${h.id}">${h.visible ? 'Cacher' : 'Montrer aux joueurs'}</button><button class="small danger" data-act="delaide" data-id="${h.id}" data-confirm>Supprimer</button></span></li>`).join('')}</ul>` : ''}</div>

  <div class="box tint sec"><h2 style="margin-bottom:6px">Synchronisation Foundry</h2>
   <p>Pour <b>importer</b>, colle ici le fichier préparé par Claude depuis Foundry. Les fiches déjà importées sont mises à jour, ce qui écrase les modifications faites ici par les joueurs. <b>Exporter</b> télécharge les fiches du groupe, SAN comprise, pour les reporter dans Foundry.</p>
   <label for="impf">Fichier d’import (.json)</label><input id="impf" type="file" accept=".json,application/json" style="margin-bottom:10px">
   <textarea id="imp" placeholder="[ { &quot;foundry_id&quot;: &quot;…&quot;, &quot;data&quot;: { … } } ]" aria-label="Données à importer"></textarea>
   <div class="row" style="margin-top:10px"><button class="primary" data-act="import">Importer dans ${esc(g.nom)}</button><button data-act="export">Exporter ${esc(g.nom)}</button></div></div>`;
}

/* ------------------------------------------------------------ rendu */
function render() {
  if (U.state !== 'app') { app.innerHTML = outside(); return; }
  const v = { tableau, agents, operations, notes, aides: aidesView, mj }[U.view] || tableau;
  app.innerHTML = header() + tabs() + `<main class="sheet">${v()}</main><p class="foot">Archives des cellules · les fiches s’enregistrent automatiquement.</p>` + lightbox();
}
function route() {
  const h = location.hash.slice(1);
  const ok = VIEWS.some(v => v[0] === h) || (h === 'mj' && isMJ());
  U.view = ok ? h : 'tableau'; U.lb = null; render();
}
window.addEventListener('hashchange', route);

/* ------------------------------------------------------------ interactions */
function setPath(o, p, v) { const k = p.split('.'); let x = o; for (let i = 0; i < k.length - 1; i++) x = x[k[i]]; x[k[k.length - 1]] = v; }
const saveAgent = a => later('a' + a.id, () => api.majAgent(a.id, { data: a.data }));
const saveSecret = id => later('s' + id, () => { const s = D.secrets[id]; return api.majSecret(id, { san: s.san, san_max: s.san_max, seuil: s.seuil }); }, 600);
async function refreshAll() { await reload(); render(); }

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  if (t.hasAttribute('data-confirm') && !t.dataset.armed) {
    t.dataset.armed = '1'; const old = t.textContent; t.textContent = 'Confirmer ?';
    setTimeout(() => { if (t.isConnected) { delete t.dataset.armed; t.textContent = old; } }, 4000); return;
  }
  const id = t.dataset.id;
  switch (t.dataset.act) {
    case 'login': try { const r = await api.login(); if (r && r.error) throw r.error; } catch (err) { fail(err); } return;
    case 'logout': await api.logout().catch(() => {}); U.uid = null; U.profil = null; U.state = 'login'; render(); return;
    case 'refresh': U.state = 'loading'; render(); try { await reload(); } catch (err) { U.state = 'error'; U.err = err.message; } route(); return;
    case 'preview-on': { const a = agentById(document.getElementById('pv-a').value); if (!a) return; U.savedGroup = U.group; U.preview = a.id; U.group = a.groupe; U.agent = a.id; U.op = null; U.filter = 'all'; location.hash = 'tableau'; route(); window.scrollTo(0, 0); return; }
    case 'preview-off': U.preview = null; U.group = U.savedGroup || U.group; U.agent = null; U.op = null; U.filter = 'all'; location.hash = 'mj'; route(); return;
    case 'agent': U.agent = id; break;
    case 'op': U.op = id; break;
    case 'openop': U.op = id; location.hash = 'operations'; return;
    case 'filter': U.filter = id; break;
    case 'lb': U.lb = id; break;
    case 'lbclose': U.lb = null; break;
    case 'add': { const a = agentById(U.agent), k = t.dataset.k; a.data[k].push(k === 'liens' ? { n: '', s: 0 } : k === 'comps' ? { n: '', v: 0 } : { n: '', c: '', d: '', p: '' }); saveAgent(a); break; }
    case 'del': { const a = agentById(t.dataset.a); a.data[t.dataset.k].splice(+t.dataset.i, 1); saveAgent(a); break; }
    case 'delportrait': { const a = agentById(id); a.portrait = null; await run(() => api.majAgent(a.id, { portrait: null }), 'Photo retirée'); break; }
    case 'newop': await run(async () => { const o = await api.creerOp({ groupe: G(), titre: 'Nouvelle opération', statut: 'verrouillee', ordre: groupOps().length }); U.op = o.id; await reload(); }); break;
    case 'delop': await run(async () => { await api.supprOp(id); U.op = null; await reload(); }, 'Opération supprimée'); break;
    case 'addseance': await run(async () => { const ss = seancesOf(id); await api.creerSeance({ operation: id, numero: ss.length ? Math.max(...ss.map(s => s.numero)) + 1 : 1, date: today() }); await reload(); }); break;
    case 'delseance': await run(async () => { await api.supprSeance(id); await reload(); }, 'Séance supprimée'); break;
    case 'accr': { const sel = document.querySelector(`[data-pend="${id}"]`); await run(async () => { await api.accrediter(id, sel.value); await reload(); }, 'Joueur accrédité'); break; }
    case 'refuse': await run(async () => { await api.retirer(id, true); await reload(); }); break;
    case 'retirer': await run(async () => { await api.retirer(id, false); await reload(); }); break;
    case 'newagent': { const n = document.getElementById('na').value.trim(); if (!n) { document.getElementById('na').focus(); return; }
      await run(async () => { const a = await api.creerAgent(G(), norm({ name: n })); U.agent = a.id; await reload(); }, 'Agent créé'); break; }
    case 'delagent': await run(async () => { await api.supprAgent(id); await reload(); }, 'Agent supprimé'); break;
    case 'addaide': {
      const titre = document.getElementById('ah-t').value.trim(), f = document.getElementById('ah-f').files[0];
      if (!titre) { document.getElementById('ah-t').focus(); return; }
      t.disabled = true; t.textContent = 'Envoi…';
      await run(async () => { const file = f ? await imageFile(f, 2400, 2400, false) : null; await api.creerAide({ groupe: G(), operation: document.getElementById('ah-o').value || null, titre, visible: false }, file); await reload(); }, 'Pièce ajoutée');
      break;
    }
    case 'toggleaide': { const h = D.aides.find(x => x.id === id); await run(async () => { await api.majAide(id, { visible: !h.visible }); await reload(); }); break; }
    case 'delaide': { const h = D.aides.find(x => x.id === id); await run(async () => { await api.supprAide(h); await reload(); }, 'Pièce supprimée'); break; }
    case 'import': {
      let liste; try { liste = JSON.parse(document.getElementById('imp').value); if (!Array.isArray(liste)) throw new Error('Il faut une liste [ … ]'); }
      catch (err) { toast('Données illisibles : ' + err.message, true); return; }
      liste = liste.map(x => ({ ...x, groupe: x.groupe || G(), data: norm(x.data) }));
      await run(async () => { const n = await api.importer(liste); await reload(); toast(n + ' fiche(s) importée(s)'); }); break;
    }
    case 'export': {
      const out = groupAgents().map(a => ({ foundry_id: a.foundry_id, groupe: a.groupe, joueur: playerOf(a), data: a.data, ...(D.secrets[a.id] ? { san: D.secrets[a.id].san, san_max: D.secrets[a.id].san_max, seuil: D.secrets[a.id].seuil } : {}) }));
      const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
      const l = document.createElement('a'); l.href = url; l.download = `agents-${G()}-${today()}.json`; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); return;
    }
    default: return;
  }
  render();
});

document.addEventListener('input', e => {
  if (U.preview) return;
  const t = e.target, ds = t.dataset;
  if (ds.a && ds.f) {
    const a = agentById(ds.a); if (!a || !canEdit(a)) return;
    const v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value === '' ? 0 : +t.value) : t.value;
    setPath(a.data, ds.f, v);
    if (ds.f.startsWith('stats.')) { const el = document.getElementById('x5-' + ds.f.slice(6)); if (el) el.textContent = '×5 = ' + (v * 5); }
    saveAgent(a);
  } else if (ds.secret && isMJ()) {
    if (!D.secrets[ds.secret]) return; D.secrets[ds.secret][ds.f] = +t.value || 0; saveSecret(ds.secret);
  } else if (ds.note === 'commune') {
    const g = G(); D.notesC[g] = { groupe: g, texte: t.value, modifie_par: U.profil.discord, modifie_le: new Date().toISOString() };
    const c = document.getElementById('cby'); if (c) c.textContent = 'Dernière modification : vous, à l’instant';
    later('nc' + g, () => api.sauverNoteCommune(g, D.notesC[g].texte, U.profil.discord), 1000);
  } else if (ds.note === 'perso') {
    D.notePerso = t.value; later('np', () => api.sauverNotePerso(U.uid, D.notePerso), 1000);
  } else if (ds.op && ds.of) {
    const o = opById(ds.op); o[ds.of] = t.value; later('o' + o.id + ds.of, () => api.majOp(o.id, { [ds.of]: o[ds.of] }));
  } else if (ds.se && ds.sf) {
    const s = D.seances.find(x => x.id === ds.se); s[ds.sf] = ds.sf === 'numero' ? (+t.value || 1) : (t.value || (ds.sf === 'date' ? null : ''));
    later('se' + s.id + ds.sf, () => api.majSeance(s.id, { [ds.sf]: s[ds.sf] }));
  } else if (ds.g) {
    const g = groupById(G()); g[ds.g] = t.value; later('g' + g.id + ds.g, () => api.majGroupe(g.id, { [ds.g]: g[ds.g] }));
  }
});

document.addEventListener('change', async e => {
  if (U.preview) return;
  const t = e.target;
  if (t.dataset.portrait) {
    const a = agentById(t.dataset.portrait); if (!a || !canEdit(a) || !t.files[0]) return;
    await run(async () => { a.portrait = await imageFile(t.files[0], 360, 450, true); await api.majAgent(a.id, { portrait: a.portrait }); }, 'Photo enregistrée');
    render();
  } else if (t.id === 'impf' && t.files[0]) { document.getElementById('imp').value = await t.files[0].text(); toast('Fichier chargé : clique sur Importer');
  } else if (t.dataset.in === 'group') { U.group = t.value; U.agent = null; U.op = null; U.filter = 'all'; render(); }
  else if (t.dataset.in === 'next') { const g = groupById(G()); g.prochaine_seance = t.value ? new Date(t.value).toISOString() : null; await run(() => api.majGroupe(g.id, { prochaine_seance: g.prochaine_seance }), 'Enregistré'); }
  else if (t.dataset.opst) { const o = opById(t.dataset.opst); o.statut = t.value; await run(() => api.majOp(o.id, { statut: o.statut }), 'Statut enregistré'); render(); }
});

document.addEventListener('keydown', e => {
  if (!U.lb) return;
  if (e.key === 'Escape') { U.lb = null; render(); return; }
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const b = [...document.querySelectorAll('.lb [data-act="lb"]')]; const btn = e.key === 'ArrowRight' ? b[1] : b[0];
    if (btn) { U.lb = btn.dataset.id; render(); }
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && U.state === 'app' && Date.now() - U.lastLoad > 60000 && !Object.keys(timers).length)
    reload().then(render).catch(() => {});
});

/* ------------------------------------------------------------ démarrage */
api.onAuth((ev, s) => {
  if (ev === 'SIGNED_OUT') { U.uid = null; U.profil = null; U.state = 'login'; render(); }
  else if (s && s.user && s.user.id !== U.uid) enter(s);
});
api.session().then(s => { if (s) enter(s); else if (!U.uid) { U.state = 'login'; render(); } }).catch(() => { U.state = 'login'; render(); });
}
