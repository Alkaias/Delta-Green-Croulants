// Accès à la base Supabase. Toute la sécurité est appliquée côté base
// (voir supabase/schema.sql) : ce fichier ne fait que lire et écrire.
window.createApi = function (sb) {
  const ok = ({ data, error }) => { if (error) throw error; return data; };
  const now = () => new Date().toISOString();
  const safe = n => n.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-60);

  return {
    async session() { const { data } = await sb.auth.getSession(); return data.session; },
    onAuth(cb) { sb.auth.onAuthStateChange((ev, s) => setTimeout(() => cb(ev, s), 0)); },
    login() {
      return sb.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: location.origin + location.pathname } });
    },
    logout() { return sb.auth.signOut(); },

    async profil(uid) { return ok(await sb.from('profils').select('*').eq('id', uid).maybeSingle()); },
    async profils() { return ok(await sb.from('profils').select('*').order('cree_le')); },
    async accrediter(p, a) { ok(await sb.rpc('accrediter', { p_profil: p, p_agent: a })); },
    async retirer(p, refuser) { ok(await sb.rpc('retirer_acces', { p_profil: p, p_refuser: !!refuser })); },

    async groupes() { return ok(await sb.from('groupes').select('*').order('id')); },
    async majGroupe(id, f) { ok(await sb.from('groupes').update(f).eq('id', id)); },

    async agents() { return ok(await sb.from('agents').select('*').order('modifie_le')); },
    async secrets() { return ok(await sb.from('agents_secret').select('*')); },
    async majAgent(id, f) { ok(await sb.from('agents').update({ ...f, modifie_le: now() }).eq('id', id)); },
    async majSecret(agent, f) { ok(await sb.from('agents_secret').update(f).eq('agent', agent)); },
    async creerAgent(groupe, data) { return ok(await sb.from('agents').insert({ groupe, data }).select().single()); },
    async supprAgent(id) { ok(await sb.from('agents').delete().eq('id', id)); },
    async importer(liste) { return ok(await sb.rpc('importer_agents', { p: liste })); },

    async operations() { return ok(await sb.from('operations').select('*').order('ordre').order('cree_le')); },
    async creerOp(f) { return ok(await sb.from('operations').insert(f).select().single()); },
    async majOp(id, f) { ok(await sb.from('operations').update(f).eq('id', id)); },
    async supprOp(id) { ok(await sb.from('operations').delete().eq('id', id)); },
    async seances() { return ok(await sb.from('seances').select('*').order('numero')); },
    async creerSeance(f) { return ok(await sb.from('seances').insert(f).select().single()); },
    async majSeance(id, f) { ok(await sb.from('seances').update(f).eq('id', id)); },
    async supprSeance(id) { ok(await sb.from('seances').delete().eq('id', id)); },

    async aides() {
      const rows = ok(await sb.from('aides').select('*').order('cree_le'));
      const paths = rows.filter(r => r.image).map(r => r.image);
      const urls = {};
      if (paths.length) {
        const { data } = await sb.storage.from('aides').createSignedUrls(paths, 3600 * 6);
        (data || []).forEach(d => { if (d.signedUrl) urls[d.path] = d.signedUrl; });
      }
      return rows.map(r => ({ ...r, url: urls[r.image] || null }));
    },
    async creerAide(f, file) {
      const row = ok(await sb.from('aides').insert(f).select().single());
      if (file) {
        const path = `${row.id}/${Date.now()}-${safe(file.name || 'image.jpg')}`;
        ok(await sb.storage.from('aides').upload(path, file, { contentType: file.type || 'image/jpeg' }));
        ok(await sb.from('aides').update({ image: path }).eq('id', row.id));
      }
      return row;
    },
    async majAide(id, f) { ok(await sb.from('aides').update(f).eq('id', id)); },
    async supprAide(a) {
      if (a.image) await sb.storage.from('aides').remove([a.image]);
      ok(await sb.from('aides').delete().eq('id', a.id));
    },

    async notesCommunes() { return ok(await sb.from('notes_communes').select('*')); },
    async sauverNoteCommune(groupe, texte, par) {
      ok(await sb.from('notes_communes').upsert({ groupe, texte, modifie_par: par, modifie_le: now() }));
    },
    async notePerso(uid) { return ok(await sb.from('notes_perso').select('*').eq('joueur', uid).maybeSingle()); },
    async sauverNotePerso(uid, texte) { ok(await sb.from('notes_perso').upsert({ joueur: uid, texte, modifie_le: now() })); },
  };
};
