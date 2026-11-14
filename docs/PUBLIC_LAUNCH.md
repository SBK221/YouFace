# Objectif actuel : gratuit pour tous, sans frais d’hébergement

Le propriétaire a confirmé le Canada et un budget technique de zéro. La cible est désormais l’édition [Firebase Spark](../free/README.md). Le plan de déploiement Docker et de monétisation ci-dessous est historique et ne doit pas être utilisé pour publier cette édition.

---

# Mise en ligne de YouFace

Le dépôt est public. L'application n'est pas encore déclarée déployée : il manque un serveur cible, un domaine et la configuration réelle des services. Le workflow Sites ne peut pas héberger directement cette architecture Fastify/PostgreSQL/Redis et son worker FFmpeg ; il faudrait la remplacer par une architecture Workers. Aucun projet YouFace n'a été retrouvé sur le compte Vercel connecté lors de la recherche.

## Déploiement web prévu

Sur un serveur Linux disposant de Docker Compose, pointer le domaine vers son IP et ouvrir uniquement 80/443. Prévoir la capacité disque pour PostgreSQL, les fichiers temporaires et la vidéo. Les médias restent dans un bucket S3 privé externe en HTTPS ; configurer son CORS pour l'origine de l'application.

1. Récupérer le commit validé de la PR #3. Ne pas déployer la branche main initiale.
2. Copier `deploy/production.env.example` vers `.env.production`, renseigner les valeurs réelles et restreindre ce fichier : `chmod 600 .env.production`. Générer le mot de passe PostgreSQL en hexadécimal avec `openssl rand -hex 32`.
3. Configurer les trois fournisseurs Firebase souhaités et autoriser le domaine. Le compte de service Admin reste dans la configuration privée du serveur ; ne pas le partager dans le chat ou Git.
4. Valider Compose sans afficher les valeurs : `docker compose --env-file .env.production -f compose.production.yml config --quiet`.
5. Construire : `docker compose --env-file .env.production -f compose.production.yml build`.
6. Contrôler la configuration : `docker compose --env-file .env.production -f compose.production.yml run --rm --no-deps api node scripts/production-preflight.mjs`.
7. Démarrer : `docker compose --env-file .env.production -f compose.production.yml up -d`. Caddy obtient le certificat HTTPS si le domaine pointe sur ce serveur. PostgreSQL et Redis ne sont pas exposés sur Internet. Les migrations précèdent l'API et le worker.
8. Contrôler `/health/ready`, puis les parcours réels : inscription, connexion, publication, upload/transcodage, lecture vidéo, signalement et accès modération. Un contrôle HTTP vert ne valide pas à lui seul Firebase ou les paiements.

Un domaine, des fournisseurs et les frais d'hébergement ne sont pas créés automatiquement par ces fichiers. Sauvegarder PostgreSQL et configurer le suivi des erreurs avant une ouverture générale ; tester une restauration. Les volumes Docker ne sont pas une sauvegarde. Ne jamais employer `down -v` sur la production.

## Revenus : première version

Les abonnements web de soutien aux créateurs utilisent Stripe Connect. Il n'y a pas encore de contenu réservé aux abonnés ni de vente de formations. La configuration historique prévoit une commission YouFace de 10 %, mais le propriétaire doit confirmer le taux et le tarif avant d'activer les paiements.

Exemple purement illustratif : 100 abonnements de 5 €/mois donnent 500 € de paiements bruts ; à 10 %, YouFace retient 50 € de commission brute, avant frais, taxes, remboursements et coûts d'exploitation. Ce n'est ni un bénéfice net ni une garantie de vente.

À activer sur le compte Stripe réel :

- identité de l'entreprise, pays et compte bancaire vérifiés ; Stripe Connect activé pour les marchés visés ;
- produit et tarif récurrent confirmés, `STRIPE_CREATOR_PRICE_ID` de la même configuration que la clé ; le script `stripe:bootstrap` reste volontairement limité au mode test ;
- webhook HTTPS `/api/billing/webhook`, avec au minimum les événements `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` et `invoice.paid` ;
- portail client Stripe configuré avec factures, moyens de paiement et annulation des abonnements ;
- URLs HTTPS de retour et de facturation, clé serveur et secret webhook dans le gestionnaire de secrets ;
- conditions commerciales, tarifs/commission affichés, remboursements et fiscalité définis.

Lancer `node scripts/production-preflight.mjs --payments` avec la configuration réelle (dans le conteneur via Compose). Le contrôle ne crée aucun produit, paiement ou compte Stripe et ne prouve pas que le compte est activé : faire un cycle de test complet incluant webhook, abonnement et annulation avant encaissement public.

Les crédits YFC ne sont pas des euros. Leur conversion et leur versement bancaire ne sont pas implémentés. Les paiements natifs via RevenueCat exigent les comptes stores, produits et builds signés ; ils ne sont pas activés par le déploiement web.

## Informations et fonctions encore requises

- Hébergement cible et domaine ; Firebase réel ; bucket S3 privé et CORS ; budget de fonctionnement.
- Nom légal, pays, adresse et contact d'assistance pour compléter les modèles de confidentialité et CGU. Ne pas publier les modèles comme des textes définitifs.
- Suppression de compte et gestion des données : le modèle de politique décrit une fonction que l'application n'a pas encore. La développer et préciser le traitement des abonnements, médias et obligations de conservation avant une ouverture générale.
- Processus de modération et support, blocage utilisateur, sauvegardes et supervision à valider.
- Tarif, devise, fréquence, commission et conditions acceptés par le propriétaire avant les paiements réels.

Les fichiers de ce kit sont intégrables et testables sans accès aux comptes externes. Ils ne constituent pas une preuve de publication.

## Vérification du kit

- Neuf tests réussis avec PostgreSQL 17 et MinIO réels, sans test ignoré ; compilation clients et scan de sécurité réussis ; audit npm sans vulnérabilité signalée.
- Configuration Compose validée avec des valeurs fictives, sans déploiement.
- Les nouveaux tests vérifient le portail Stripe (client issu de la session, retour imposé côté serveur, refus pour les achats natifs), le statut réel des versements et les erreurs de configuration de production.
- La construction de l'image Docker n'a pas été validée jusqu'au bout : le téléchargement npm depuis les conteneurs de cet environnement expire. Un test réseau indépendant dans l'image Node le confirme. Construire et vérifier l'image sur l'hébergeur cible avant mise en service.
