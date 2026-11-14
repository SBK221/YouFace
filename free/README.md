# YouFace gratuit — déploiement Firebase Spark

Cette édition gratuite est la cible de publication web par défaut. Elle utilise uniquement Firebase Hosting classique, Firebase Authentication Google/e-mail et Cloud Firestore. Elle ne démarre pas le backend Docker, PostgreSQL, Redis ou FFmpeg. Aucun achat, SMS, stockage de vidéo ou Cloud Function n'est utilisé. Le code historique reste dans le dépôt ; il ne fait pas partie du site gratuit déployé.

## Ce qui fonctionne

- Lecture publique du fil (20 publications par page, actualisation manuelle).
- Inscription e-mail, vérification, connexion Google, récupération de mot de passe.
- Profils, textes, commentaires, mentions J’aime, signalements, masquage de créateurs.
- Export des données personnelles et suppression avec réauthentification.
- Paiements désactivés par défaut également dans le backend historique (`BILLING_ENABLED=false`).

Les publications et commentaires sont publics. Les profils de compte, préférences et signalements sont privés. Les règles Firestore sont restrictives, vérifient l'identité et interdisent à un utilisateur de modifier les données des autres. La modération nécessite l'examen régulier des signalements par l'exploitant dans la console Firebase ; il n'y a pas de modérateur automatique.

## Conditions pour rester sans dépense

Conserver le projet sur **Spark, sans compte de facturation Cloud lié**. Ne pas activer Blaze, App Hosting, Cloud Functions, Cloud Storage ou la connexion par SMS. Un projet déjà sur Blaze ne devient pas gratuit parce que cette application est gratuite : vérifier le plan avant déploiement. Aucun changement de plan n'est effectué par les scripts.

Les quotas gratuits sont limités : Firestore indique actuellement 1 GiB de données, 50 000 lectures/jour, 20 000 écritures/jour et 20 000 suppressions/jour. Hosting possède aussi ses quotas de stockage et de transfert. Quand un quota est épuisé sur Spark, le service peut être interrompu : il ne faut pas promettre une capacité illimitée. Firebase reste l'autorité sur les quotas courants.

Sources vérifiées le 14 novembre 2026 :
- https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- https://firebase.google.com/docs/firestore/quotas
- https://firebase.google.com/pricing

## Configuration réelle manquante

1. Le projet confirmé par le propriétaire est `youface-82f91` (numéro `778188824522`), configuré dans `.firebaserc`. Le propriétaire indique Spark ; la facturation réelle reste à contrôler depuis une session authentifiée avant publication.
2. Activer Authentication : e-mail/mot de passe et Google seulement. Ajouter le domaine Hosting aux domaines autorisés.
3. Créer Firestore en mode verrouillé, puis déployer les règles de ce dépôt. Choisir l'emplacement de la base en connaissance des obligations de confidentialité ; aucune résidence canadienne globale n'est promise.
4. Copier la configuration **publique de l'application Web** de Firebase dans un `.env` local ignoré : `FIREBASE_PROJECT_ID`, `FIREBASE_PUBLIC_API_KEY`, `FIREBASE_PUBLIC_AUTH_DOMAIN`, `FIREBASE_PUBLIC_APP_ID`. Ne jamais y mettre une clé Admin pour ce site : il n'en utilise aucune.
5. Compléter `free/legal.json` : nom réel de l'exploitant et e-mail public. Le pays Canada a été confirmé. Le texte de conditions/confidentialité est une proposition à adapter à l'exploitation réelle, pas une certification juridique.
6. `npm ci`, puis `npm run build:free:release`. Cette commande refuse la publication si les coordonnées ou la configuration Web manquent.
7. Depuis une session Firebase CLI authentifiée du propriétaire : `firebase deploy --only hosting,firestore --project youface-82f91`. Les fichiers `firebase.json` n'incluent ni fonction ni stockage payant. Utiliser Hosting classique, pas App Hosting.

L'URL réelle renvoyée par Firebase doit être contrôlée après déploiement. Aucune URL n'est inventée ici et aucun succès de publication n'est annoncé avant ce résultat.

## Suppression du compte

L'utilisateur confirme son identité Google ou e-mail/mot de passe. Son profil passe à l'état de suppression : les règles empêchent toute nouvelle publication. Les contenus sont rendus indisponibles avant l'effacement de leurs commentaires et mentions J’aime. Les données propres à l'utilisateur sont ensuite supprimées, puis l'identité Firebase. Si un quota ou le réseau interrompt la procédure, l'utilisateur doit se reconnecter et reprendre la suppression. Il n'y a pas de worker payant qui prétendrait la terminer en arrière-plan.

Une trace privée `{status: 'deleted', deletedAt}` dans `users/UID` bloque la réactivation par les anciens jetons (qui peuvent encore être valables jusqu'à une heure). Elle ne contient plus de nom, d'e-mail ni de contenu. L'exploitant doit la purger manuellement après vérification que l'identité Firebase est supprimée et que les jetons ont expiré. L'application interdit au client de la retirer ou de la réactiver. Ne pas supprimer ce reçu avant l'identité : cela permettrait à un ancien jeton de recréer un profil.

## Limites assumées

Pas de vidéo envoyée, messagerie privée, cours payants, achats, SMS, récompense financière ou versements. Le masquage filtre le fil du membre ; il ne rend pas ses publications publiques privées pour la personne masquée. L'effacement des contenus n'est pas automatique lorsqu'on supprime uniquement une identité depuis la console Firebase : utiliser le parcours de l'application ou réaliser la même procédure d'administration.

Conserver et superviser les quotas, traiter les signalements et demandes de confidentialité sont des tâches d'exploitation. Une attaque ou un succès d'audience peut épuiser les quotas gratuits ; aucun budget ne doit être lié au projet pour respecter l'objectif zéro dépense.

## Vérifications réalisées

- Construction de l'édition gratuite réussie ; le mode `--release` refuse les coordonnées et la configuration manquantes.
- Quatre tests passent sur le véritable émulateur Firestore, avec le projet de démonstration `demo-youface-free` : propriété des données, confidentialité des signalements, suppression et protection contre la réactivation, nettoyage des commentaires/mentions J’aime.
- La suite backend passe pour les tests autonomes et refuse les trois parcours de création de paiements lorsque le mode gratuit est actif. Les intégrations PostgreSQL/S3 sont indépendantes de cette édition et restent contrôlées par le workflow backend.
- Ces tests ne constituent pas une connexion au vrai projet Firebase et ne prouvent pas un déploiement public. Aucun fournisseur de facturation n'a été activé.

Pour reproduire les tests Firebase : `npm ci --prefix tests/firebase`, puis `tests/firebase/node_modules/.bin/firebase emulators:exec --only firestore --project demo-youface-free 'node --test tests/firebase/rules.test.mjs'`. Java 21 est requis ; le workflow Firebase gratuit exécute ces tests sur chaque PR.

## Configuration de l'application Web encore nécessaire

Le nom et l'identifiant du projet ne suffisent pas à initialiser Firebase Authentication. Dans Paramètres du projet → Général → Vos applications, sélectionner l'application Web (icône `</>`) et copier le bloc `firebaseConfig`. S'il n'y a aucune application Web, en enregistrer une pour YouFace. Les valeurs requises par ce site sont `apiKey`, `authDomain` et `appId` ; `projectId` est déjà renseigné. Ce sont des valeurs publiques de configuration Web, pas une clé privée de compte de service.

Le 14 novembre 2026, les endpoints publics `/__/firebase/init.json` des domaines Firebase par défaut ont retourné HTTP 404 ; aucune configuration Web n'en a été récupérée et aucune publication n'a été confirmée.

La configuration Web publique est aussi enregistrée dans `free/firebase-config.json`. L’appId confirmé est `1:778188824522:web:22a34043ff022aa1847933`. Les champs publics `apiKey` et `authDomain` restent à fournir depuis le même bloc Firebase ; aucune valeur privée n’est attendue. Les variables d’environnement conservent la priorité.
