# Google Play — Guide de soumission YouFace

Package : `com.youfacetechnologies.youface`

> Fais tout ceci **sur ta machine** (Windows/Mac + Android Studio). Le backend doit déjà tourner sur un domaine HTTPS de production.

---

## Étape 1 — Compte & app

1. Va sur <https://play.google.com/console>, paie les **25 $** (une fois), vérifie ton identité.
2. **Create app** → nom `YouFace`, langue par défaut, type **App**, gratuit/payant.
3. Accepte les déclarations (politiques développeur, lois US export).

## Étape 2 — Pointer l'app vers le backend de prod

Dans `public/runtime-config.js` (généré par `scripts/write-runtime-config.mjs` via les variables d'env) :

```js
window.YOUFACE_CONFIG = Object.freeze({
  apiBaseUrl: "https://api.youface.<ton-domaine>",   // origine HTTPS de prod
  firebase: { /* config web publique */ },
  ...
});
```

- Régénère : `npm run build:runtime` (avec `PUBLIC_API_BASE_URL` défini).
- **Ne mets jamais de secret** dans ce fichier (il est public).

## Étape 3 — Version & signing

Dans `android/app/build.gradle`, incrémente à chaque upload :

```gradle
android {
  defaultConfig {
    applicationId "com.youfacetechnologies.youface"
    versionCode 1          // entier, +1 à CHAQUE upload
    versionName "0.4.2"     // visible par l'utilisateur
  }
}
```

### Générer le keystore de release (une seule fois — à conserver précieusement)

```bash
keytool -genkey -v -keystore youface-release.jks \
  -alias youface -keyalg RSA -keysize 2048 -validity 10000
```

> 🔑 Sauvegarde `youface-release.jks` + le mot de passe **hors du dépôt** (gestionnaire de secrets, coffre). Si tu le perds, tu ne pourras plus mettre à jour l'app. Le `.gitignore` bloque déjà `*.jks`.

Crée `android/keystore.properties` (déjà ignoré par Git) :

```properties
storeFile=/chemin/absolu/youface-release.jks
storePassword=********
keyAlias=youface
keyPassword=********
```

Et référence-le dans `android/app/build.gradle` (bloc `signingConfigs.release`).

## Étape 4 — Construire l'AAB signé

```bash
npm run verify            # sécurité + tests avant packaging
npx cap sync android
npm run android:harden    # durcit le manifeste
cd android
./gradlew bundleRelease   # produit app/build/outputs/bundle/release/app-release.aab
```

Active **Play App Signing** (recommandé) : Play Console → *Setup → App signing* → laisse Google gérer la clé d'app, ton keystore devient la clé d'upload.

## Étape 5 — Fiche Store

Play Console → *Main store listing*. Copie depuis [`STORE_LISTING.md`](STORE_LISTING.md) :

- Nom (30 car.), description courte (80 car.), description complète (4000 car.).
- **Icône** 512×512 PNG 32-bit.
- **Feature graphic** 1024×500.
- **Captures** téléphone (min 2, 16:9 ou 9:16). Voir [`ASSETS_CHECKLIST.md`](ASSETS_CHECKLIST.md).
- Catégorie : *Social* (ou *Éducation*). Coordonnées de contact + URL politique de confidentialité.

## Étape 6 — Déclarations obligatoires

- **App content** :
  - *Privacy policy* : URL publique.
  - *Data safety* : déclare les données collectées (e-mail, n° de téléphone, contenu utilisateur, identifiants) et leur usage. Voir tableau dans [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md).
  - *Content rating* : remplis le questionnaire IARC (app sociale avec UGC → réponds honnêtement sur interaction utilisateurs, contenu généré).
  - *Target audience* : 18+ recommandé pour une app sociale UGC.
  - *News / COVID / Government* : non.
  - **Account deletion** : fournis l'URL de suppression de compte + confirme la suppression in-app.
- **Ads** : déclare si présence de pub.

## Étape 7 — Publication progressive

1. **Internal testing** (jusqu'à 100 testeurs, immédiat) — upload l'AAB, ajoute des e-mails testeurs.
2. **Closed testing** (bêta fermée) — requis avant prod pour les nouveaux comptes perso : **min 12 testeurs pendant 14 jours**.
3. **Open testing** (optionnel).
4. **Production** — *Create release*, upload AAB, notes de version, *Review release* → *Start rollout*.

## Rejets fréquents (Google)

| Cause | Correctif |
|---|---|
| Biens numériques via Stripe dans l'app | Utiliser Play Billing / RevenueCat pour l'in-app |
| Data safety incohérent avec le comportement réel | Réaligner le formulaire sur ce que le code collecte |
| Pas de suppression de compte | Exposer la suppression in-app + URL |
| UGC sans modération/signalement | Activer signalement + blocage + CGU |
| Permissions non justifiées | Retirer les permissions inutiles du manifeste |
