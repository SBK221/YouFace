# YouFace — Checklist des assets graphiques Store

Couleur de marque : `#09070f` (fond) / accent mauve. L'app existe déjà en icône (`android/.../mipmap-*`, `ios/.../AppIcon.appiconset`).

---

## Google Play

| Asset | Spéc | Requis |
|---|---|---|
| Icône | 512×512 px, PNG 32-bit (avec alpha) | ✅ |
| Feature graphic | 1024×500 px, PNG/JPG (sans texte essentiel sur les bords) | ✅ |
| Captures téléphone | min 2, max 8 — 16:9 ou 9:16, côté 320–3840 px | ✅ |
| Captures tablette 7"/10" | mêmes règles | Recommandé |
| Vidéo promo (YouTube) | facultatif | ⬜ |

## Apple App Store

| Asset | Spéc | Requis |
|---|---|---|
| Icône | 1024×1024 px, PNG **sans** alpha, sans coins arrondis | ✅ |
| Captures iPhone 6.7" | 1290×2796 px (ou 2796×1290) — min 1, max 10 | ✅ |
| Captures iPhone 6.5" | 1242×2688 px | ✅ (fallback) |
| Captures iPad 12.9" | 2048×2732 px | Si app iPad |
| App Preview (vidéo) | facultatif | ⬜ |

---

## Plan de captures suggéré (5 écrans)

Prends ces captures depuis l'app réelle une fois connectée à ton backend de prod :

1. **Flow** — le fil de contenus éducatifs.
2. **Expertise** — la grille de cours avec progression.
3. **Réseau** — les cartes de créateurs à suivre.
4. **Profil** — le profil utilisateur avec stats et publications.
5. **Messagerie ou Notifications** — l'aspect social.

Conseils :
- Utilise un appareil ou simulateur à la bonne résolution.
- Ajoute éventuellement un bandeau/texte court sur chaque capture (« Apprends », « Connecte-toi »…) mais garde du contenu réel visible.
- Pas de faux contenu trompeur, pas de mention de prix erronée (règles des deux stores).

## Génération des icônes natives

Si tu changes l'icône source, régénère les déclinaisons avec un outil comme `@capacitor/assets` :

```bash
npx @capacitor/assets generate --iconBackgroundColor '#09070f' --iconBackgroundColorDark '#09070f'
```

Place une icône source `assets/icon.png` (1024×1024) et un `assets/splash.png` avant de lancer la commande.
