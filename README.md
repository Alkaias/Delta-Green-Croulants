# Archives des cellules — Delta Green

Portail des joueurs : fiches des agents, opérations et comptes rendus, notes, aides de jeu.
Connexion par Discord, données dans Supabase, site hébergé par GitHub Pages.

Site : https://alkaias.github.io/Delta-Green-Croulants/

## Organisation

| Fichier | Rôle |
|---|---|
| `index.html`, `css/`, `js/app.js` | Le site |
| `js/api.js` | Lecture / écriture dans Supabase |
| `js/config.js` | Adresse du projet Supabase et clé **publique** |
| `supabase/schema.sql` | Tables et règles d'accès, à coller dans Supabase > SQL Editor |

## Règles d'accès (appliquées par la base, pas par la page)

- Le premier compte Discord connecté devient MJ ; les suivants attendent d'être rattachés à un agent.
- Un joueur voit les agents de son groupe et ne modifie que sa propre fiche.
- SAN et seuil de rupture : table séparée, lisible par le MJ uniquement.
- Opérations verrouillées et aides cachées : invisibles pour les joueurs.
- Note de groupe partagée ; carnet personnel visible du seul joueur.
