# YouFace 0.4.2 — Connexion Firebase réelle

## Identifiant natif définitif de cette version

`com.youfacetechnologies.youface`

Le même identifiant est utilisé comme `applicationId` Android et Bundle ID iOS pour éviter d'enregistrer Firebase avec le mauvais identifiant.

## Méthode Windows recommandée

1. Double-cliquer sur `05_CONNECTER_FIREBASE.cmd`.
2. Le script ouvre Firebase Console.
3. Créer ou sélectionner le projet Firebase YouFace.
4. Enregistrer une app Android avec le package `com.youfacetechnologies.youface`.
5. Enregistrer une app Apple avec le bundle ID `com.youfacetechnologies.youface`.
6. Enregistrer une app Web et récupérer sa configuration publique.
7. Dans Authentication > Sign-in method, activer:
   - Phone
   - Google
   - Email/Password
8. Dans Authentication > Settings, configurer la politique des régions SMS et autoriser les pays de test.
9. Télécharger `google-services.json` et `GoogleService-Info.plist`.
10. Créer un compte de service Firebase Admin et conserver son JSON hors Git.
11. Saisir les chemins demandés par le script.

Le script copie le compte de service dans `secrets/firebase-service-account.json`. Le dossier `secrets/` et `.env` sont exclus de Git.

## Empreintes Android

Après installation de JDK 21 / Android Studio, exécuter:

```powershell
npm run firebase:fingerprints
```

Le rapport `FIREBASE_SHA_FINGERPRINTS.txt` contient SHA-1 et SHA-256. Ajouter les deux dans Firebase Console > Project settings > Your apps > Android.

Google Sign-In nécessite SHA-1. L'authentification par téléphone utilise Play Integrity quand disponible et demande SHA-256; le fallback reCAPTCHA demande SHA-1.

Après ajout des empreintes et activation de Google, re-télécharger `google-services.json`, car la configuration mise à jour contient les informations OAuth nécessaires à Google Sign-In.

## Validation

Double-cliquer sur `06_VALIDER_FIREBASE.cmd` ou exécuter:

```powershell
npm run preflight:firebase
```

Le contrôle bloque si:

- l'identifiant Capacitor, Android ou iOS est incohérent;
- `google-services.json` ne correspond pas à `com.youfacetechnologies.youface`;
- le Project ID ne correspond pas à `.env`;
- le compte de service appartient à un autre projet;
- les valeurs publiques Firebase Web sont absentes.

Le contrôle avertit si le fichier iOS n'est pas encore présent afin de permettre un test Android en premier.
