# YouFace — Architecture cible

## Phase actuelle : modular monolith + workers

```text
PWA / Android / iOS
        |
   HTTPS API / BFF
        |
+-------+-------------------------------+
| Identity | Profiles | Feed | Content  |
| Social   | Messaging | Moderation     |
| Creator  | Billing | Notifications    |
+-------+-------------------------------+
        |                   |
   PostgreSQL              Redis
        |
  content_stats / cursor pagination

Client --presigned PUT--> Object Storage
                              |
                         media_jobs
                              |
                       FFmpeg Worker(s)
                              |
                  processed MP4 + thumbnail
```

## Principes de montée en charge

- Monolithe modulaire tant que la séparation opérationnelle n'est pas nécessaire.
- PostgreSQL comme source de vérité transactionnelle.
- Redis pour événements éphémères et rate limiting distribué.
- Pagination par curseur sur le feed et les messages.
- Compteurs `content_stats` mis à jour atomiquement afin d'éviter des agrégations globales à chaque page de feed.
- Upload vidéo direct vers le stockage objet.
- Traitement média hors du processus HTTP.
- Queue PostgreSQL alpha avec `FOR UPDATE SKIP LOCKED`; migration vers une queue dédiée lorsque le débit et les garanties opérationnelles l'exigent.
- CDN et streaming adaptatif à ajouter avant forte diffusion vidéo.

## Seuil de séparation future

Un module devient un service indépendant seulement lorsque l'une de ces conditions est mesurée :

- profil de charge très différent du noyau ;
- besoin de déploiement indépendant fréquent ;
- isolation de panne indispensable ;
- contraintes de données/régulation distinctes ;
- équipe propriétaire autonome.

Les premiers candidats sont Media Processing, Notifications Push, Recommandation et Billing/Reconciliation.
