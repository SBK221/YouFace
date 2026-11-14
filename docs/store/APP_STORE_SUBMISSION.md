# Apple App Store — Guide de soumission YouFace

Bundle ID : `com.youfacetechnologies.youface`

> **Un Mac avec Xcode est obligatoire.** Il n'existe aucun moyen de construire ou soumettre une app iOS sans macOS + Xcode.

---

## Étape 1 — Compte & enregistrement de l'app

1. Adhère à l'**Apple Developer Program** (99 $/an) : <https://developer.apple.com/programs/>.
2. Dans **App Store Connect** (<https://appstoreconnect.apple.com>) → *My Apps* → **+** → *New App* :
   - Plateforme : iOS
   - Nom : `YouFace`
   - Langue principale : Français
   - Bundle ID : `com.youfacetechnologies.youface` (doit exister dans *Certificates, Identifiers & Profiles*)
   - SKU : `youface-ios`

## Étape 2 — Identifiant & capabilities

Dans *Certificates, Identifiers & Profiles* → *Identifiers* :
- Enregistre l'App ID `com.youfacetechnologies.youface`.
- Active **Sign in with Apple** si tu proposes Google/Gmail (Apple exige une option de connexion respectueuse de la vie privée quand d'autres logins sociaux existent — voir Guideline 4.8) **ou** limite-toi à Téléphone + Sign in with Apple. *(Voir la note 4.8 plus bas.)*
- Active **Push Notifications** si tu ajoutes APNs plus tard.

## Étape 3 — Pointer l'app vers le backend de prod

Comme pour Android, régénère `public/runtime-config.js` avec `apiBaseUrl` = ton domaine HTTPS de prod (`npm run build:runtime` avec `PUBLIC_API_BASE_URL`). Aucun secret dans ce fichier.

## Étape 4 — Build & signature (Xcode)

```bash
npm run verify
npx cap sync ios
npx cap open ios          # ouvre ios/App/App.xcworkspace dans Xcode
```

Dans Xcode :
1. Sélectionne le projet **App** → *Signing & Capabilities* → coche *Automatically manage signing*, choisis ton **Team**.
2. *General* → *Version* = `0.4.2`, *Build* = `1` (incrémente à chaque upload).
3. Menu *Product → Destination → Any iOS Device (arm64)*.
4. *Product → Archive*.
5. Dans l'Organizer : *Distribute App → App Store Connect → Upload*.

## Étape 5 — Fiche & métadonnées

App Store Connect → ta version. Copie depuis [`STORE_LISTING.md`](STORE_LISTING.md) :
- Nom (30 car.), sous-titre (30 car.), description, mots-clés (100 car.), URL marketing, URL support.
- **Captures** requises pour iPhone 6.7" et 6.5" (voir [`ASSETS_CHECKLIST.md`](ASSETS_CHECKLIST.md)).
- Catégorie principale : *Social Networking* (ou *Education*).
- **App Privacy** : remplis les *nutrition labels* (données collectées et liées à l'utilisateur — voir tableau de [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md)).
- URL de la **politique de confidentialité** (obligatoire).

## Étape 6 — Infos pour la review

- **Compte de démonstration** : fournis un identifiant de test fonctionnel (numéro/e-mail + code) pour que les reviewers puissent se connecter. Sans ça → rejet immédiat.
- **Notes** : explique brièvement le concept (réseau social éducatif) et où trouver les fonctions de signalement/blocage.

## Étape 7 — Soumettre

*Add for Review* → *Submit*. Suivi du statut dans App Store Connect (souvent 24–48 h).

## Points de conformité critiques (Apple)

| Guideline | Exigence | État YouFace |
|---|---|---|
| **1.2 UGC** | Filtre les contenus, signalement, blocage, CGU, réponse aux abus < 24 h | Signalement/modération présents côté serveur — vérifie l'exposition UI |
| **3.1.1 IAP** | Biens numériques via **In-App Purchase** uniquement, jamais un tiers | RevenueCat câblé → à mapper sur des produits IAP |
| **4.8 Sign in** | Si login social tiers, offrir aussi une option privée (Sign in with Apple) | À ajouter si tu gardes Google/Gmail |
| **5.1.1(v) Suppression** | Suppression de compte **in-app** | À exposer dans l'app (backend prêt) |
| **5.1.1 Privacy** | Politique de confidentialité accessible | Publier l'URL |

## Rejets fréquents (Apple)

- Compte de démo manquant/non fonctionnel.
- Paiement de biens numériques hors IAP.
- Pas de suppression de compte in-app.
- UGC sans modération visible.
- Sign in with Apple absent alors que Google est proposé.
