# YouFace 0.4.1 — Gmail + mot de passe

Les méthodes existantes **Téléphone** et **Google** restent actives.

La version 0.4.1 ajoute :

- création de compte avec une adresse `@gmail.com` et un mot de passe ;
- email de vérification Firebase après création ;
- connexion Gmail + mot de passe après vérification ;
- échange du Firebase ID token contre une session serveur YouFace ;
- aucun mot de passe Gmail stocké dans PostgreSQL YouFace.

## Activation Firebase

Dans Firebase Authentication, activer :

1. Phone
2. Google
3. Email/Password

Pour Android, fournir le `google-services.json` du projet Firebase.
Pour iOS, fournir `GoogleService-Info.plist`.
Les valeurs publiques Web Firebase doivent être renseignées dans `.env`.
