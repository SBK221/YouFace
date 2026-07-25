# YouFace

**Plateforme sociale de contenu éducatif** — Flow, Expertise, Réseau et Profil.
Application full-stack (backend Node.js + clients web/PWA + apps natives Android & iOS via Capacitor).

- **Version :** 0.4.2 (staging, Firebase-ready)
- **Identifiant natif :** `com.youfacetechnologies.youface`
- **Auth :** Téléphone (SMS), Google Sign-In, Gmail + mot de passe (via Firebase Authentication)

---

## 🔐 Sécurité — à lire en premier

Ce dépôt **ne doit jamais contenir de secret**. Les fichiers suivants sont ignorés par Git (`.gitignore`) et doivent rester **uniquement en local** :

| Fichier | Emplacement local attendu |
|---|---|
| Compte de service Firebase Admin (`*firebase-adminsdk*.json`) | `secrets/firebase-service-account.json` |
| `google-services.json` (Android) | `android/app/google-services.json` |
| `GoogleService-Info.plist` (iOS) | `ios/App/App/GoogleService-Info.plist` |
| Keystore de signature Android | hors dépôt (voir kit Store) |
| `.env` (secrets runtime) | racine du projet — copié depuis `.env.example` |

> ⚠️ Si une clé privée a déjà été partagée ou exposée, **révoque-la et régénère-la** dans la console Firebase → Paramètres du projet → Comptes de service.

---

## 🚀 Démarrage rapide (Windows)

Prérequis : **Node.js ≥ 22**, **Docker Desktop** (`docker compose`), **FFmpeg/ffprobe** dans le `PATH`.

1. Décompresser le projet.
2. Double-cliquer sur **`00_DEMARRER_YOUFACE_ALPHA.cmd`**.
3. Ouvrir <http://localhost:4173> si le navigateur ne s'ouvre pas.

Le lanceur démarre PostgreSQL + Redis + MinIO, initialise le stockage, vérifie le code, applique les migrations, puis lance l'API et le worker média.

### Autres lanceurs Windows

| Fichier | Rôle |
|---|---|
| `01_CONSTRUIRE_ANDROID.cmd` | Build APK Android debug |
| `02_TESTER_API.cmd` | Test rapide de l'API |
| `03_TESTER_STACK_REELLE.cmd` | Test d'intégration (Postgres + S3 + FFmpeg) |
| `04_TESTER_AUTH_GMAIL.cmd` | Test du flux Gmail + mot de passe |
| `05_CONNECTER_FIREBASE.cmd` | Installer les fichiers Firebase locaux |
| `06_VALIDER_FIREBASE.cmd` | Préflight de connexion Firebase |

## 🛠️ Démarrage manuel (multi-plateforme)

```bash
cp .env.example .env          # renseigner les clés
docker compose up -d --wait postgres redis minio
npm ci
npm run storage:init          # créer le bucket S3/MinIO
npm run build                 # config runtime + clients (esbuild)
npm run migrate               # migrations SQL
npm start                     # API sur http://localhost:4173
npm run worker                # worker média (autre terminal)
```

Vérification complète : `npm run verify` (build + scan sécurité + audit deps + tests).

---

## 📁 Structure du projet

```
server/            API Fastify (routes, lib, config, migrations runner)
  routes/          auth, profiles, content, messaging, notifications,
                   media, moderation, analytics, billing
  lib/             auth, security, storage, media, firebase-identity,
                   notifications, revenuecat, event-bus, audit
worker/            Worker média séparé (FFmpeg transcodage + miniatures)
src/               Clients navigateur (identity, billing) — bundlés par esbuild
public/            PWA (index.html, styles, service worker, runtime-config)
migrations/        Schéma PostgreSQL versionné (001 → 004)
scripts/           Outils Node (.mjs) + PowerShell de préflight/déploiement
tests/             Tests node:test (billing, core, postgres, s3)
android/           Projet Capacitor Android
ios/               Projet Capacitor iOS
docs/              Architecture, sécurité, rapports, gaps
docs/store/        Kit de soumission Play Store + App Store
```

---

## 🔥 Connexion Firebase

Voir **[`docs/FIREBASE_CONNECTION_0.4.2.md`](docs/FIREBASE_CONNECTION_0.4.2.md)** et
**[`FIREBASE_ACTION_IMMEDIATE.txt`](FIREBASE_ACTION_IMMEDIATE.txt)**.

Un même projet Firebase doit contenir **trois apps** (Android, Apple, Web) sous
l'identifiant `com.youfacetechnologies.youface`, avec Phone + Google + Email/Password activés.

---

## 📱 Publication sur les stores

Le dossier complet de soumission est dans **[`docs/store/`](docs/store/)** :

- [`SUBMISSION_CHECKLIST.md`](docs/store/SUBMISSION_CHECKLIST.md) — checklist maître
- [`PLAY_STORE_SUBMISSION.md`](docs/store/PLAY_STORE_SUBMISSION.md) — Google Play, étape par étape
- [`APP_STORE_SUBMISSION.md`](docs/store/APP_STORE_SUBMISSION.md) — Apple App Store, étape par étape
- [`STORE_LISTING.md`](docs/store/STORE_LISTING.md) — textes de fiche prêts à coller (FR/EN)
- [`ASSETS_CHECKLIST.md`](docs/store/ASSETS_CHECKLIST.md) — icônes, captures, specs graphiques
- [`PRIVACY_POLICY.md`](docs/store/PRIVACY_POLICY.md) / [`TERMS_OF_SERVICE.md`](docs/store/TERMS_OF_SERVICE.md) — modèles juridiques à faire valider

> La soumission finale exige **tes** comptes développeur (Google Play, Apple Developer)
> et **tes** clés de signature. Aucun robot ne peut publier à ta place : suis le guide.

---

## 📚 Documentation technique

- [`docs/ARCHITECTURE_PRODUCTION.md`](docs/ARCHITECTURE_PRODUCTION.md)
- [`docs/SECURITY_MODEL_0.3.md`](docs/SECURITY_MODEL_0.3.md)
- [`docs/PRODUCTION_GAPS.md`](docs/PRODUCTION_GAPS.md) — écarts connus avant production publique
- [`docs/TEST_REPORT_0.3.md`](docs/TEST_REPORT_0.3.md)
- [`docs/FIREBASE_PREFLIGHT_REPORT_0.4.2.md`](docs/FIREBASE_PREFLIGHT_REPORT_0.4.2.md)

## Licence

Voir [`LICENSE`](LICENSE).
