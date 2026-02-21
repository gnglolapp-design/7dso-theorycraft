# 7DS: Origin — Theorycraft Web (Guided v5)

Outil web **24/7** (gratuit) + mode avancé pour theorycraft (formules par patch, presets, overrides).

## 1) Hébergement gratuit 24/7 (GitHub Pages)

1. Crée un dépôt GitHub (ex: `7dso-theorycraft`).
2. Upload le contenu de ce dossier à la racine du dépôt (ou push via Git).
3. GitHub → **Settings → Pages**
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/** (root)
4. Ton site sera accessible via l’URL GitHub Pages.

Astuce Discord: épingle simplement le lien dans un salon `#tools` / `#resources`.

## 2) DB automatique (fiabilité)

- La DB est **séparée du code** et générée par `tools/update_db.py`.
- Par défaut, la source utilisée est **genshin.gg/7dso** (persos + armes).
- Une GitHub Action (`.github/workflows/update_db.yml`) met la DB à jour **tous les jours** (cron), et tu peux aussi la lancer manuellement: **Actions → Update DB → Run workflow**.

Fichiers générés:
- `data/db.json` (DB normalisée / modulaire)
- `data/db_live.js` (DB embarquée pour le site)
- `data/db_snapshots/` (historique des snapshots)
- `data/db_diff_latest.json` (diff dernier snapshot)

### Important (source secondaire)
`7dsorigin.gg` est prévu comme **source secondaire optionnelle**, mais l’automatisation peut être limitée par leurs règles/ToS.
Ne l’active que si tu as l’autorisation.

## 3) Lancer en local (propre)

- Double-clic `StartLocalServer.bat`
- Ouvre `http://localhost:8000`

> Évite `file://index.html` (certains navigateurs bloquent le chargement de fichiers DB).

## 4) Mettre à jour la DB en local (1 clic)

- Double-clic `UpdateDB.bat`
- (Optionnel) activer la source secondaire **uniquement si tu as l'autorisation**:
  - ouvre `UpdateDB.bat`
  - mets `set ENABLE_7DSORIGIN=1`

## 5) Structure DB (modulaire)

La DB normalisée (`data/db.json`) est prévue pour évoluer:
- `modules.characters` (infos + armes + costumes + liens)
- `modules.skills` (multiplicateurs, hits, cooldown, tags… best-effort)
- `modules.weapons` (type, atk, substats, passif…)
- `formula_profiles` (dans `data/formula_profiles.js`) pour gérer CBT / release / patchs

## Licence
Projet communautaire (best-effort). Les données et assets appartiennent à leurs ayants droit respectifs.


## 5) Activer 7dsorigin.gg sur GitHub Actions (si autorisé)

Dans `.github/workflows/update_db.yml` :

- mets `ENABLE_7DSORIGIN: '1'` (au lieu de `'0'`)
- commit + push

Le workflow exécutera `python tools/update_db.py --enable-7dsorigin` automatiquement.
