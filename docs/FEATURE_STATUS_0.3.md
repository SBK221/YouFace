# YouFace 0.3 — État exact des fonctionnalités demandées

| Fonction demandée | État | Preuve dans l'alpha |
|---|---|---|
| Inscription réelle | Implémentée et testée | `POST /api/auth/register`, PostgreSQL |
| Connexion réelle | Implémentée et testée | `POST /api/auth/login` |
| Sessions | Implémentées et testées | sessions opaques serveur, révocation |
| Sessions sécurisées web | Implémentées | cookie HttpOnly + CSRF + origine |
| Session native alpha | Implémentée | Bearer opaque uniquement en mémoire |
| Upload vidéo | Implémenté et testé | local stream + S3 direct presigned PUT |
| Transcodage | Implémenté et testé | worker FFmpeg/ffprobe réel |
| Stockage cloud | Couche S3 compatible implémentée et testée | S3 SDK v3, URLs présignées ; fournisseur réel à configurer |
| Commentaires réels | Implémentés et testés | PostgreSQL + compteur atomique |
| Likes réels | Implémentés et testés | toggle transactionnel + compteur atomique |
| Abonnements sociaux | Implémentés et testés | table `follows` |
| Abonnements payants créateur | Intégration implémentée | Stripe Connect/Checkout ; transaction réelle nécessite clés Stripe test |
| Messages | Implémentés et testés | conversations et messages PostgreSQL |
| Backend réel | Implémenté | Fastify + PostgreSQL + Redis optionnel |
| Authentification réelle | Implémentée et testée | `scrypt`, sessions opaques |
| PostgreSQL | Implémenté et testé sur moteur réel | migration + test d'intégration |
| Profils | Implémentés et testés | lecture/modification/follow |
| API | Implémentée | routes auth, profil, contenu, média, message, notification, modération, analytics, billing |
| Publication texte réelle | Implémentée et testée | feed persistant PostgreSQL |
| Notifications serveur | Implémentées et testées | PostgreSQL + SSE web + polling natif alpha |
| Modération | Implémentée et testée | signalements, file admin, actions, audit log |
| Paiements | Code fournisseur implémenté | webhook signé/idempotent testé ; paiements externes non exécutés sans clés |
| Monétisation | Modèle et flux implémentés | abonnements créateur, ledger de revenus, Creator Center |
| Creator analytics réels | Implémentés et testés | vues, watch time, likes, followers, revenus depuis PostgreSQL |

## Interprétation correcte

« Implémenté et testé » signifie que le code a été exécuté dans la batterie locale ou d'intégration.

« Intégration implémentée » signifie que le code fournisseur réel est présent mais qu'une opération externe en compte propriétaire ne peut pas être exécutée sans les identifiants de test du fournisseur.

Le stockage S3 a été testé contre un serveur S3 compatible. Cela valide le protocole de l'application, pas un compte AWS/Cloudflare/Backblaze particulier.
