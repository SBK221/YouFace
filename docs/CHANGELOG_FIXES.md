# YouFace — Corrections & réorganisation

Travail de revue et de nettoyage appliqué au projet 0.4.2.

## Corrections de bugs (backend)

### 1. HIGH — Perte d'abonnement premium via webhook RevenueCat
`server/routes/billing.js`

Le bloc de synchronisation d'entitlement s'exécutait pour **tout** événement RevenueCat
comportant un `app_user_id`, sans vérifier que l'événement concernait réellement
l'entitlement premium. Conséquence : l'achat d'un pack de crédits (`NON_RENEWING_PURCHASE`,
sans entitlement) écrasait la ligne `platform_entitlements` d'un abonné premium valide en
`status='inactive'` → **perte silencieuse du premium**. Même effet pour `TRANSFER`,
`SUBSCRIPTION_EXTENDED`, changements de produit, etc.

**Correctif :** le bloc ne s'exécute que si `event.entitlement_ids` contient l'entitlement
premium (`eventTargetsEntitlement`). L'état `inactive` n'est plus déduit d'un événement qui
ne mentionne pas l'entitlement.

### 2. MEDIUM — Erreur 500 sur e-mail dupliqué entre fournisseurs
`server/routes/auth.js`

Se connecter d'abord avec Google puis avec Gmail+mot de passe (même adresse) créait deux
`identity_accounts` distincts, puis un second `INSERT INTO users` qui violait l'index unique
partiel sur `email` → `500 INTERNAL_ERROR`, l'utilisateur ne pouvait plus utiliser le second
fournisseur.

**Correctif :** liaison inter-fournisseurs par e-mail vérifié. Si un utilisateur existe déjà
avec cette adresse (les deux fournisseurs livrent un e-mail vérifié), la nouvelle identité est
rattachée au même compte au lieu d'en créer un nouveau.

### 3. LOW — 500 possible sur double livraison de webhook (Stripe & RevenueCat)
`server/routes/billing.js`

Le dédoublonnage `SELECT` puis `INSERT` n'était pas atomique : deux livraisons concurrentes
identiques tentaient toutes deux l'`INSERT`, la perdante violait la clé primaire → 500 parasite
et bruit dans les logs.

**Correctif :** `INSERT ... ON CONFLICT (event_id) DO NOTHING RETURNING`, la livraison perdante
est traitée comme un doublon.

### 4. LOW — Durcissement du nettoyage de clé de stockage
`server/lib/storage.js`

`cleanKey` faisait une simple substitution `..` non récursive (`....//` → `..//`). Non
exploitable aujourd'hui (clés générées côté serveur), mais durci par sécurité.

**Correctif :** normalisation via `path.posix.normalize` + rejet explicite des segments `..`.

## Réorganisation

- Projet 0.4.2 complet importé proprement dans le dépôt.
- Documentation regroupée dans `docs/`.
- **Kit de soumission Store** ajouté dans `docs/store/` (Play Store, App Store, fiches, assets, modèles juridiques, checklist).
- `.gitignore` durci : `google-services.json`, `GoogleService-Info.plist`, `*firebase-adminsdk*.json`, keystores et empreintes SHA ne peuvent plus être commités.
- README réécrit (structure, démarrage, sécurité, liens Store).

## Note environnement

La suite de tests complète (`npm test`) n'a pas pu être exécutée dans l'environnement distant :
l'installation des dépendances lourdes (AWS SDK, Firebase, Stripe) ne se termine pas via le
proxy réseau. Le scan de sécurité (`npm run security:check`) passe (41 fichiers). Les fichiers
modifiés passent `node --check`. Exécute `npm run verify` sur ta machine pour valider de bout en bout.
