# YouFace — Checklist maître de soumission Store

App : **YouFace** · Bundle/Package : `com.youfacetechnologies.youface` · Version : `0.4.2`

Ce document est la vue d'ensemble. Chaque étape renvoie vers un guide détaillé.

---

## 0. Pré-requis (une seule fois)

- [ ] **Compte Google Play Console** créé et vérifié — frais unique **25 $**.
- [ ] **Compte Apple Developer Program** actif — **99 $/an** (compte Organisation recommandé si société).
- [ ] Un **Mac avec Xcode** (obligatoire pour build/soumettre iOS — pas de contournement).
- [ ] **Android Studio + SDK** installés (pour build l'AAB Android).
- [ ] Projet **Firebase** configuré (voir `docs/FIREBASE_CONNECTION_0.4.2.md`).
- [ ] **Backend en production** derrière un **domaine HTTPS** stable (l'app mobile pointera dessus via `runtime-config.js` → `apiBaseUrl`).

## 1. Conformité produit (bloquants Store)

Ces éléments sont exigés par les deux stores pour une app sociale avec contenu généré par les utilisateurs (UGC) :

- [ ] **Politique de confidentialité** publiée à une URL publique (modèle : `PRIVACY_POLICY.md`).
- [ ] **Conditions d'utilisation (CGU)** publiées (modèle : `TERMS_OF_SERVICE.md`).
- [ ] **Suppression de compte in-app** (Google et Apple l'exigent) + une URL web de suppression pour Google.
- [ ] **Vérification e-mail** + **réinitialisation de mot de passe** (déjà côté Firebase pour Gmail/password).
- [ ] **Modération UGC** : signalement de contenu, blocage d'utilisateur, CGU interdisant les contenus abusifs, réponse aux signalements < 24 h. (Apple Guideline 1.2 / Google UGC policy.)
- [ ] **Filtrage / EULA** affiché avant de poster ; mécanisme de signalement visible.

## 2. Achats intégrés (si monétisation dans l'app)

- [ ] Sur mobile, **tout bien numérique doit passer par l'achat in-app** du store (Apple IAP / Google Play Billing) — **pas Stripe** dans l'app. Ici : **RevenueCat** est déjà câblé (`server/lib/revenuecat.js`).
- [ ] Produits créés dans **App Store Connect** et **Play Console**, mappés dans RevenueCat.
- [ ] Stripe reste réservé au **web** (abonnements créateurs / payouts Connect).

## 3. Android — Google Play

Guide détaillé : [`PLAY_STORE_SUBMISSION.md`](PLAY_STORE_SUBMISSION.md)

- [ ] Keystore de release généré et **sauvegardé hors dépôt**.
- [ ] `versionCode` / `versionName` définis.
- [ ] **AAB** (`.aab`) release signé construit.
- [ ] **Play App Signing** activé.
- [ ] Fiche Store remplie (`STORE_LISTING.md`) + assets (`ASSETS_CHECKLIST.md`).
- [ ] **Data safety form** rempli.
- [ ] **Content rating** (questionnaire IARC) rempli.
- [ ] Test interne → fermé → ouvert → production.

## 4. iOS — Apple App Store

Guide détaillé : [`APP_STORE_SUBMISSION.md`](APP_STORE_SUBMISSION.md)

- [ ] Certificat de distribution + provisioning profile App Store.
- [ ] App enregistrée dans App Store Connect (bundle id identique).
- [ ] Archive signée via Xcode → upload vers App Store Connect.
- [ ] Fiche + captures (`ASSETS_CHECKLIST.md`).
- [ ] **App Privacy “nutrition labels”** remplis.
- [ ] Compte de démo fourni à l'équipe de review (identifiants de test).
- [ ] Soumission pour review.

## 5. Après soumission

- [ ] Surveiller le statut de review (réponses souvent < 48 h Apple, quelques heures–jours Google).
- [ ] Préparer des réponses aux rejets fréquents : IAP manquant, suppression de compte, modération UGC, politique de confidentialité inaccessible.
- [ ] Configurer **crash reporting** (Firebase Crashlytics) et monitoring backend avant l'ouverture publique.

---

### Rappel réalité

Un assistant ne peut **pas** créer tes comptes développeur, signer avec tes clés privées, ni cliquer « Publier » à ta place : ces actions exigent ton identité légale, tes moyens de paiement et tes secrets de signature. Ce kit t'amène jusqu'à ce dernier clic.
