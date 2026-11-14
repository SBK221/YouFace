# YouFace 0.3 — Modèle de sécurité

## Authentification et sessions

- Mot de passe dérivé avec `scrypt` : N=32768, r=8, p=1, sel aléatoire 16 octets, clé 64 octets.
- Comparaison en temps constant.
- Jeton de session opaque aléatoire de 32 octets.
- Base de données : uniquement SHA-256 du jeton de session.
- Web : cookie HttpOnly, SameSite=Lax, Secure configurable et obligatoire en production.
- CSRF aléatoire par session pour les mutations web.
- Contrôle de l'origine sur les mutations authentifiées.
- Native alpha : Bearer opaque explicite. Aucune persistance dans `localStorage` ou `sessionStorage`.
- Révocation serveur des sessions.
- Un utilisateur suspendu ne peut plus charger une session active.

## API

- JSON Schema Fastify avec `additionalProperties:false` sur les routes structurées.
- Requêtes PostgreSQL paramétrées.
- Limitation de taille globale du body et limites multipart spécifiques.
- Rate limiting global et restrictions renforcées sur inscription/login/upload/signalement.
- Redis utilisé pour distribuer le rate limiting et les événements lorsqu'il est disponible ; fallback local pour développement.
- Contrôles d'autorisation par propriétaire, membre de conversation et rôle modérateur/admin.

## Navigateur et WebView

- Content Security Policy restrictive.
- Pas de `unsafe-eval` ni `unsafe-inline`.
- Pas de secrets frontend.
- Scanner bloquant `eval`, `new Function`, `document.write`, secrets ressemblant à des clés et tokens persistés dans `localStorage`.
- Android : sauvegarde système désactivée et trafic HTTP clair désactivé.

## Vidéo et stockage

- En mode S3, la vidéo ne traverse pas l'API principale.
- L'API émet une URL PUT présignée courte durée.
- Le client envoie directement l'objet au stockage.
- La confirmation vérifie l'existence et la taille exacte de l'objet.
- Le worker télécharge l'original dans un fichier temporaire, le traite puis supprime les temporaires.
- `ffprobe` valide le flux vidéo traité.
- Les médias privés/orphelins locaux ne sont pas servis publiquement.
- Les URLs S3 de lecture sont présignées.

## Paiements

- Aucune clé Stripe dans le frontend.
- Signature du webhook vérifiée sur le body brut.
- Table `stripe_events` pour l'idempotence.
- Un événement non traité peut être retenté ; un événement déjà traité est ignoré comme doublon.
- Registre `creator_earnings` séparé des statistiques d'interface.

## Modération et audit

- Signalements persistés.
- Vérification de l'existence de la cible signalée.
- File réservée aux rôles modérateur/admin.
- Actions enregistrées dans `moderation_actions`.
- Journal `audit_logs` avec acteur, action, cible, adresse IP et métadonnées.
