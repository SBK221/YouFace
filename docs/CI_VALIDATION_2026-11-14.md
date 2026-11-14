# YouFace 0.4.2 — validation du 14 novembre 2026

## Corrections

- Les archives du lockfile utilisent désormais `registry.npmjs.org`, au lieu d'un registre interne inaccessible aux runners GitHub.
- Mise à jour des dépendances compatibles dans le lockfile pour corriger les alertes de sécurité. `@fastify/static` passe à 10.1.11 (compatible Fastify 5), et un override maintient `@grpc/grpc-js` sur une version 1.14.7 ou ultérieure, notamment pour la dépendance Firebase Firestore restée sur 1.9.x.
- Bundles navigateur reconstruits avec ces dépendances.
- Les identifiants fictifs des tests PostgreSQL et S3 respectent la longueur minimale du schéma d'authentification. Le test PostgreSQL vérifie explicitement les réponses de connexion avant de lire les utilisateurs.
- Le workflow backend exécute `npm run verify`, qui inclut aussi la compilation des clients.

## Résultats locaux

- `npm ci` : succès depuis le registre public avec les empreintes du lockfile.
- `npm run verify` : succès sous Node 24 et Node 22.
- Scan de sécurité : succès.
- Audit npm : aucune vulnérabilité signalée à cette date.
- Tests : 4 réussis, 0 échec, 0 ignoré.
- PostgreSQL 17 réel dans un conteneur éphémère.
- Upload direct S3 et transcodage FFmpeg validés avec S3rver, installé séparément hors du projet. Le téléchargement des images MinIO Docker Hub et Quay a été refusé dans cet environnement ; le workflow GitHub conserve MinIO et doit encore être contrôlé sur son runner.

## Limites

Ces tests utilisent des identités Firebase simulées et des événements de paiement de test. Ils ne valident ni les identifiants Firebase réels, ni les transactions réelles, ni les builds mobiles signés ou la production. Les succès locaux ne remplacent pas le résultat du workflow GitHub sur le nouveau commit.

## Correction du démarrage MinIO dans GitHub Actions

Le run `43538066862` a échoué avant `npm ci` : Docker Hub refuse le téléchargement de `minio/minio:latest`.

Le workflow compile maintenant MinIO depuis la release officielle `RELEASE.2025-09-07T16-13-09Z`, en vérifiant le commit `07c3a429bfed433e49018cb0f78a52145d4bedeb`, avec Go 1.24.2. Le serveur écoute sur localhost et est arrêté après les tests, même en cas d'échec.

Validation locale supplémentaire : compilation de cette source réussie ; `npm run verify` sous Node 22 avec PostgreSQL 17 et ce serveur MinIO réel réussit : 4 tests, 0 échec, 0 ignoré, audit sans vulnérabilité signalée. La première validation S3rver ci-dessus reste un résultat antérieur ; MinIO réel a désormais aussi été testé. Le résultat du nouveau run GitHub Actions reste à contrôler.
