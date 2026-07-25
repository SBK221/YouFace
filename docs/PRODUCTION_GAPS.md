# YouFace 0.3 — Écarts avant production publique

Cette alpha est un noyau full-stack testable. Elle ne doit pas être présentée comme prête pour une publication mondiale en production.

## Bloquants Store / identité

- Ajouter vérification d'adresse e-mail et récupération de mot de passe.
- Ajouter suppression de compte et export des données depuis l'application.
- Ajouter politique de confidentialité et conditions d'utilisation juridiquement validées.
- Finaliser le nom de package/bundle avant premier artefact public définitif.
- Ajouter persistance sécurisée du jeton natif via Keychain iOS et Keystore Android. L'alpha conserve le Bearer natif uniquement en mémoire.
- Configurer domaine HTTPS de production, certificats et rotation des secrets.

## Vidéo

- Le worker alpha produit un MP4 H.264/AAC jusqu'à 720p et une miniature.
- Il manque une ladder adaptive HLS/DASH multi-bitrates, packaging CDN et contrôle de débit par appareil/réseau.
- Il manque analyse malware des fichiers, détection automatique de contenu interdit et empreinte copyright.
- Le Studio complet de montage non linéaire multi-pistes n'est pas encore implémenté. L'alpha possède le pipeline réel d'import/transcodage/publication.

## Notifications

- Les notifications serveur sont réelles et persistées.
- Le web reçoit les événements par SSE.
- Le client natif alpha utilise un polling temporaire.
- Il manque FCM/APNs pour les notifications push lorsque l'application est fermée.

## Paiements et monétisation

- L'intégration Stripe est câblée et le webhook signé est testé hors ligne.
- Les transactions Checkout/Connect réelles ne sont pas testables sans les identifiants Stripe test du propriétaire.
- La couverture de paiement/payout ne doit pas être qualifiée de « tous les pays » avec un seul prestataire. Il faudra une couche providers et des prestataires régionaux selon les marchés.
- KYC/KYB, fiscalité, remboursements, litiges et réconciliation comptable restent à industrialiser.

## Scalabilité et exploitation

- Aucun test de charge à l'échelle million n'a encore été exécuté.
- Ajouter OpenTelemetry, métriques Prometheus, traces distribuées, alertes et suivi crash mobile.
- Définir sauvegardes PostgreSQL, PITR, RPO/RTO et procédure de reprise après sinistre.
- Ajouter tests de chaos Redis/PostgreSQL/stockage et tests de saturation de queue média.
- Ajouter stratégie multi-région, CDN et réplication du stockage.
- Ajouter nettoyage des sessions expirées et politiques de rétention des logs/audits.

## CI mobile

- Le workflow Android compile un APK debug sur GitHub Actions après vérifications.
- Le workflow iOS compile une app simulateur non signée sur un runner macOS.
- Les archives Store signées nécessitent les comptes développeur, certificats, profils de provisioning et secrets de signature du propriétaire.
