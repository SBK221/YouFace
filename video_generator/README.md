# YouFace — Générateur de Vidéos Philosophiques

Pipeline automatique : **Script** → **Voix profonde** → **Vidéo cinématique**

## Installation

```bash
pip install -r requirements.txt
```

## Variables d'environnement requis

```bash
export ANTHROPIC_API_KEY="sk-ant-..."        # Obligatoire
export ELEVENLABS_API_KEY="..."              # Optionnel (voix)
export ELEVENLABS_VOICE_ID="..."            # ID voix ElevenLabs (deep voice)
```

## Utilisation

```bash
# Générer 2 vidéos par défaut
python generate_video.py

# Générer une vidéo sur un sujet précis
python generate_video.py "Pourquoi les gens intelligents disparaissent en silence"

# Plusieurs sujets
python generate_video.py "Le silence est une arme" "Tu souffres de tes pensées"
```

## Résultats

Les fichiers sont créés dans `output_videos/` :
- `*.mp4` — Vidéo finale (1080×1920, format Reels/Shorts)
- `*.mp3` — Voix générée
- `*_script.json` — Script structuré

## Format vidéo

- Résolution : 1080×1920 (vertical, Reels / TikTok / YouTube Shorts)
- Style : fond noir profond, texte blanc, accent or cinématique
- Durée : ~60–90 secondes par vidéo

## Voix ElevenLabs recommandées (deep voice)

| ID | Nom | Style |
|----|-----|-------|
| `pNInz6obpgDQGcFmaJgB` | Adam | Profond, neutre |
| `VR6AewLTigWG4xSOukaG` | Arnold | Grave, dramatique |
| `ErXwobaYiN019PkySvjV` | Antoni | Intense, cinématique |
