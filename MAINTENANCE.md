# Guide de maintenance — Archives des cellules

Ce document permet à n'importe qui (une personne ou un autre assistant) de reprendre le site.
Rien ici ne dépend de Claude : tout tourne sur des comptes appartenant au MJ.

## 1. Vue d'ensemble

| Élément | Où | Rôle |
|---|---|---|
| Code du site | GitHub, dépôt `Alkaias/Delta-Green-Croulants` | HTML/CSS/JS sans framework ni étape de compilation |
| Hébergement | GitHub Pages (branche `main`, racine) | https://alkaias.github.io/Delta-Green-Croulants/ |
| Base de données, comptes, fichiers | Supabase, projet `vnsdvtedgkshwbgluepo` | Postgres + Auth + Storage |
| Connexion des joueurs | Application Discord du MJ (portail développeur Discord) | OAuth Discord via Supabase |

Toute modification poussée sur `main` est en ligne en une à deux minutes. Les joueurs doivent parfois
recharger avec Ctrl+F5 (cache du navigateur).

## 2. Fichiers du dépôt

| Fichier | Contenu |
|---|---|
| `index.html` | Page unique ; charge `supabase-js` (version épinglée sur jsDelivr), la config et l'application |
| `css/style.css` | Tout le style. Construit par couches successives : les règles en fin de fichier priment |
| `js/config.js` | URL du projet Supabase et clé **publique** (« publishable »). Ne jamais y mettre la clé secrète |
| `js/api.js` | Toutes les lectures/écritures Supabase (une fonction par opération) |
| `js/app.js` | L'interface : état, rendu des onglets, actions, imports |
| `supabase/schema.sql` | Schéma complet, rejouable sans perte de données |
| `supabase/migration-XX-*.sql` | Évolutions successives, à appliquer dans l'ordre sur une base existante |
| `outils/foundry_vers_portail.py` | Conversion des acteurs Foundry (Delta Green) en fichier d'import de fiches |

### Organisation de `js/app.js`
- `D` = données chargées depuis la base, `U` = état de l'interface (vue, groupe affiché, aperçu…).
- `reload()` recharge tout ; `render()` redessine ; `route()` lit l'onglet dans l'adresse (`#tableau`, `#agents`, `#operations`, `#notes`, `#aides`, `#mj`).
- Une fonction par onglet : `tableau()`, `agents()`, `operations()`, `notes()`, `aidesView()`, `mj()`.
- Les clics passent par `data-act="…"` (un seul gestionnaire `click`), les saisies par `data-…` (gestionnaires `input` et `change`). Les saisies sont enregistrées automatiquement après un court délai (`later()`).
- Tout texte venant de la base est échappé avec `esc()` avant affichage.
- `window.API_OVERRIDE` permet de remplacer l'accès Supabase par une base simulée pour tester l'interface.

## 3. Base de données (Supabase)

### Tables
| Table | Contenu |
|---|---|
| `groupes` | Les groupes de joueurs : nom, année, monde Foundry, prochaine séance, accroche, fil des événements, liste « Avant l'activation » |
| `profils` | Un par compte Discord connecté : pseudo, rôle (`mj`, `joueur`, `attente`, `refuse`), groupe |
| `agents` | Fiches : `data` (JSON de la fiche), `portrait` (image en data URL), `joueur`, `foundry_id` |
| `agents_secret` | SAN, SAN max, seuil de rupture — **MJ uniquement** |
| `agents_badges` | Badge d'identité de chaque agent (image en data URL) |
| `operations` / `seances` | Opérations (statut `verrouillee`, `en_cours`, `terminee`) et rapports de séance (avec durée) |
| `illustrations` | Couverture d'opération et images des rapports (fichiers dans le stockage `illustrations`) |
| `aides` | Pièces à conviction (fichiers dans le stockage `aides`), visibles ou cachées |
| `notes_communes` / `notes_perso` | Note de groupe ; carnet privé de chaque joueur |
| `dossiers_perso` | Interludes et pièces privées d'un agent (fichiers dans le stockage `personnel`) |
| `preparation` | Cases cochées par chaque joueur dans « Avant l'activation » |

### Règles d'accès (appliquées par la base, pas par la page)
- Le **premier** compte qui se connecte devient MJ ; les suivants sont « en attente » jusqu'à accréditation.
- Un joueur ne voit que son groupe, ne modifie que sa propre fiche, ne voit jamais `agents_secret`.
- Opérations verrouillées, pièces cachées et dossiers personnels masqués sont invisibles côté joueur.
- Les fonctions `accrediter`, `retirer_acces` et `importer_agents` sont réservées au MJ.

### Ordre des scripts
- Nouvelle base : coller `schema.sql` en entier dans **SQL Editor**, puis appliquer seulement les parties
  « contenu » des migrations si l'on veut le pré-remplissage de la Cellule K (migrations 04 et 05).
- Base existante : appliquer les migrations manquantes dans l'ordre (01 → 06). Toutes sont rejouables.
- Supabase affiche un avertissement « destructive operations » à cause des `drop policy if exists` :
  c'est attendu, aucune donnée n'est supprimée.

### Réglages Supabase à connaître
- **Authentication → Sign In / Providers** : Discord activé (identifiant et secret de l'application Discord), Email désactivé.
- **Authentication → URL Configuration** : Site URL et Redirect URL = adresse GitHub Pages du site.
- Dans l'application Discord, la redirection autorisée est `https://vnsdvtedgkshwbgluepo.supabase.co/auth/v1/callback`.
- **Mise en veille** : l'offre gratuite met le projet en pause après une semaine sans activité. Si cela arrive,
  le restaurer depuis le tableau de bord Supabase (bouton « Restore »). Une tâche automatique de « ping »
  peut l'éviter (voir section 7).

## 4. Fichiers d'import (Espace MJ → Synchronisation Foundry)

Le bouton « Importer » reconnaît automatiquement quatre formats JSON.

### Fiches d'agents — une liste
```json
[ { "foundry_id": "AE79gXMRMrslJexU", "groupe": "g1",
    "data": { "name": "…", "prof": "…", "cellule": "K", "alias": "Kate",
              "stats": {"FOR":12,"CON":12,"DEX":12,"INT":12,"POU":12,"CHA":12},
              "pv": {"cur":12,"max":12}, "vol": {"cur":12,"max":12},
              "motiv": "une ligne par motivation\n\nTroubles :\n…",
              "liens": [{"n":"…","s":10}], "comps": [{"n":"Fouille","v":60}],
              "armes": [{"n":"…","c":"Armes à feu","d":"1D10","p":"15 m"}],
              "equip": "…", "bless": "…", "bio": "…",
              "violence": [false,false,false], "impuiss": [false,false,false] },
    "portrait": "data:image/jpeg;base64,…", "badge": "data:image/webp;base64,…",
    "san": 60, "san_max": 99, "seuil": 48 } ]
```
Une fiche dont le `foundry_id` existe déjà est **écrasée** (y compris les modifications des joueurs).

### Dossier d'opération complet — un objet avec `operation`
```json
{ "type": "operation", "groupe": "g1",
  "operation": { "titre": "…", "statut": "verrouillee", "periode": "…", "resume": "…", "ordre": -10 },
  "seances": [ { "numero": 1, "date": "2026-09-24", "duree": "2h15", "compte_rendu": "…" } ],
  "aides": [ { "titre": "…", "visible": true, "fichier": "piece.jpg", "image": "data:image/jpeg;base64,…" } ],
  "illustrations": [ { "seance": null, "legende": "couverture", "image": "data:…" },
                     { "seance": 1, "legende": "…", "image": "data:…" } ] }
```

### Illustrations pour une opération existante — un objet avec `illustrations_pour`
```json
{ "illustrations_pour": "Opération FULMINATE", "groupe": "g1",
  "illustrations": [ { "seance": 2, "legende": "…", "image": "data:…" } ] }
```

### Dossiers personnels — un objet avec `dossiers_perso`
```json
{ "dossiers_perso": [ { "foundry_id": "…", "agent": "Nom de l'agent", "titre": "Interlude 1",
    "sous_titre": "Après Fulminate", "texte": "…\n\n## Intertitre\n\n…\n\n!! Conséquence",
    "visible": false, "images": [ { "image": "data:…", "legende": "…" } ] } ] }
```
Dans les textes de dossiers personnels : `## ` en début de ligne = intertitre, `!! ` = encadré de conséquence.

## 5. Convertir des fiches depuis Foundry

Les mondes Foundry sont dans `C:\Users\<utilisateur>\AppData\Local\FoundryVTT\Data\worlds\<monde>\data\`.
Les acteurs sont stockés dans une base LevelDB (`actors/`).
1. Copier le dossier `actors/` (fichiers `.ldb`, `.log`, `CURRENT`, `MANIFEST-*`) ailleurs.
2. L'exporter en JSON avec Node et le paquet `classic-level` (le même moteur que Foundry) :
   ```js
   const {ClassicLevel}=require('classic-level');
   (async()=>{const db=new ClassicLevel(process.argv[2],{valueEncoding:'json'});const o={};
   for await (const [k,v] of db.iterator()) o[k]=v; await db.close();
   require('fs').writeFileSync(process.argv[3],JSON.stringify(o));})();
   ```
3. Lancer `python3 outils/foundry_vers_portail.py dump.json <dossier des images> <groupe> sortie.json`.
   Le script cherche le portrait de l'acteur et le badge `Forensic_ID_<Nom>.png` dans le dossier d'images.

Le connecteur Foundry pour assistant (« foundry-mcp ») ne lit pas les valeurs de fiche du système Delta Green :
passer par les fichiers comme ci-dessus, ou par « Exporter les données » d'un acteur dans Foundry.

## 6. Routine de campagne

- **Avant une opération** : la créer verrouillée ; régler la date de prochaine séance et l'accroche sur le Tableau.
- **Début de la première séance** : passer l'opération en « En cours » (le Tableau bascule tout seul).
- **Après chaque séance** : rédiger le rapport (à partir des notes ou de la transcription), renseigner date et durée,
  ajouter illustrations et pièces, rendre visibles les pièces données aux joueurs.
- **Fin d'opération** : écrire la synthèse, passer en « Classée », mettre à jour le fil « Depuis… »
  et la liste « Avant l'activation » pour la suivante.
- **Nouveau joueur** : il se connecte une fois, puis le MJ l'accrédite (Espace MJ → Accréditations).

## 7. Points d'attention

- **Erreur Discord « e-mail ou téléphone vérifié requis »** : le joueur doit vérifier son e-mail (ou ajouter un téléphone)
  dans Discord, et vérifier que son navigateur est connecté au bon compte sur discord.com.
- **Sécurité** : seule la clé publique figure dans le dépôt. La clé secrète / service_role et le mot de passe
  de la base ne doivent jamais y être ajoutés.
- **Mise en veille Supabase** : solution possible, non installée à ce jour : une fonction SQL `ping()` accessible
  sans connexion, appelée tous les trois jours par une tâche planifiée GitHub Actions.
- **Visibilité par joueur** : les pièces à conviction sont visibles par tout un groupe ; une pièce destinée à un seul
  joueur se range dans son dossier personnel.
