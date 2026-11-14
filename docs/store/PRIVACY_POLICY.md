# Politique de confidentialité — YouFace (MODÈLE)

> ⚠️ **MODÈLE À FAIRE VALIDER PAR UN JURISTE.** Ce texte n'est pas un avis juridique. Adapte-le à ta réalité (entité légale, pays, prestataires réels) et fais-le relire avant publication. Publie la version finale à une URL publique (ex. `https://youface.<ton-domaine>/privacy`) — les deux stores l'exigent.

**Dernière mise à jour :** _à compléter_
**Responsable du traitement :** _Nom de l'entité, adresse, e-mail de contact_

---

## 1. Données que nous collectons

| Donnée | Origine | Finalité | Liée à l'identité |
|---|---|---|---|
| Adresse e-mail | Inscription (Google/Gmail) | Création de compte, connexion, communications | Oui |
| Numéro de téléphone | Inscription (SMS) | Authentification | Oui |
| Nom d'affichage, nom d'utilisateur, bio, pays, langue | Profil | Fonctionnement du profil | Oui |
| Contenu publié (textes, vidéos, images) | Utilisateur | Affichage du service | Oui |
| Messages privés | Utilisateur | Messagerie | Oui |
| Identifiants techniques (ID de session, adresse IP, user-agent) | Automatique | Sécurité, sessions, anti-abus | Oui |
| Données d'achat (via RevenueCat / Stripe) | Prestataire de paiement | Abonnements, crédits | Oui |
| Journaux d'audit et de modération | Automatique | Sécurité, modération | Oui |

Nous **ne stockons pas** ton mot de passe Gmail : l'authentification passe par Firebase Authentication, qui nous fournit un jeton vérifié.

## 2. Utilisation des données

- Fournir et sécuriser le service (comptes, sessions, anti-fraude).
- Afficher et diffuser tes contenus selon tes réglages.
- Gérer les abonnements, crédits et paiements.
- Modérer les contenus et répondre aux signalements.
- Améliorer le service et respecter nos obligations légales.

## 3. Partage des données

Nous partageons des données uniquement avec les prestataires nécessaires au service :
- **Google Firebase** (authentification, infrastructure).
- **Stripe** (paiements web / payouts créateurs).
- **RevenueCat + Apple/Google** (achats in-app).
- Hébergeur et stockage de fichiers (S3 / CDN).

Nous ne vendons pas tes données personnelles.

## 4. Conservation

Les données sont conservées tant que ton compte est actif. À la suppression du compte, elles sont effacées ou anonymisées sous un délai raisonnable, sauf obligation légale de conservation.

## 5. Tes droits

Selon ta juridiction (RGPD, etc.) : accès, rectification, effacement, portabilité, opposition. Contacte-nous à _e-mail_. Tu peux **supprimer ton compte directement dans l'application** (Réglages → Supprimer mon compte) ou via _URL de suppression_.

## 6. Sécurité

Sessions opaques (seul le hash SHA-256 du jeton est stocké), cookies HttpOnly, protection CSRF, contrôle d'origine, chiffrement en transit (HTTPS).

## 7. Enfants

YouFace n'est pas destiné aux personnes de moins de _13/16/18_ ans (à définir selon ta politique et ta juridiction).

## 8. Modifications

Nous pouvons mettre à jour cette politique ; la date de mise à jour ci-dessus reflète la dernière version.

## 9. Contact

_Nom, adresse e-mail, adresse postale de l'entité responsable._
