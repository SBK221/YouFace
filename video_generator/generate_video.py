"""
YouFace - Générateur automatique de vidéos philosophiques
Psychologie + Stoïcisme + Réalité Moderne
Pipeline: Script (Claude) → Voix (ElevenLabs) → Vidéo (MoviePy)
"""

import os
import sys
import json
import time
import textwrap
import requests
from pathlib import Path

import anthropic
from moviepy.editor import (
    AudioFileClip, ColorClip, CompositeVideoClip,
    TextClip, concatenate_videoclips
)
from PIL import Image, ImageDraw, ImageFilter
import numpy as np


# ── Configuration ────────────────────────────────────────────────────────────

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")

# ID d'une voix profonde sur ElevenLabs (ex: "Adam" ou votre clone vocal)
ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB")

OUTPUT_DIR = Path("output_videos")
OUTPUT_DIR.mkdir(exist_ok=True)

VIDEO_W, VIDEO_H = 1080, 1920   # Format vertical (Reels / TikTok / Shorts)
FPS = 24
FONT = "DejaVu-Sans-Bold"        # Disponible sur Linux sans install
BG_COLOR = (5, 5, 10)            # Noir profond
ACCENT_COLOR = (180, 140, 60)    # Or cinématique


# ── 1. Génération du script avec Claude ──────────────────────────────────────

SYSTEM_PROMPT = """Tu es un scénariste de vidéos philosophiques virales.
Style : voix profonde, phrases courtes et percutantes, atmosphère cinématique sombre.
Inspiré de : stoïcisme, psychologie moderne, vérités dures sur la société.

Format de réponse JSON strict :
{
  "titre": "...",
  "accroche": "phrase d'ouverture choc (max 12 mots)",
  "segments": [
    {"texte": "...", "duree": 5},
    ...
  ],
  "conclusion": "phrase finale mémorable (max 15 mots)"
}

Règles :
- 6 à 9 segments
- Chaque segment : 1 à 3 phrases courtes, max 20 mots par segment
- Durée totale cible : 60-90 secondes
- Ton : grave, profond, sans pitié pour les illusions modernes
- Langue : français
"""

def generer_script(sujet: str) -> dict:
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    print(f"  Script en cours pour : {sujet}")

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"Crée une vidéo sur : {sujet}"}]
    )

    raw = message.content[0].text.strip()
    # Extraire le JSON même si Claude ajoute du texte autour
    start = raw.find("{")
    end = raw.rfind("}") + 1
    return json.loads(raw[start:end])


# ── 2. Synthèse vocale avec ElevenLabs ───────────────────────────────────────

def generer_voix(script: dict, chemin_audio: Path) -> Path:
    """Concatène tous les segments et génère un MP3 via ElevenLabs."""
    texte_complet = (
        script["accroche"] + ". "
        + " ".join(s["texte"] for s in script["segments"])
        + " " + script["conclusion"]
    )

    print(f"  Synthèse vocale ({len(texte_complet)} caractères)...")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "text": texte_complet,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.45,
            "similarity_boost": 0.85,
            "style": 0.3,
            "use_speaker_boost": True
        }
    }

    resp = requests.post(url, json=payload, headers=headers)
    resp.raise_for_status()

    chemin_audio.write_bytes(resp.content)
    print(f"  Audio sauvegardé : {chemin_audio}")
    return chemin_audio


# ── 3. Création de la vidéo avec MoviePy ─────────────────────────────────────

def creer_clip_texte(texte: str, duree: float, width: int, height: int) -> CompositeVideoClip:
    """Crée un clip sombre avec texte centré et effet de fondu."""
    bg = ColorClip((width, height), color=BG_COLOR, duration=duree)

    # Ligne dorée décorative
    ligne = ColorClip((120, 3), color=ACCENT_COLOR, duration=duree).set_position(("center", height // 2 - 80))

    # Texte principal
    wrapped = "\n".join(textwrap.wrap(texte, width=28))
    txt = (
        TextClip(
            wrapped,
            fontsize=62,
            font=FONT,
            color="white",
            align="center",
            method="caption",
            size=(width - 120, None)
        )
        .set_duration(duree)
        .set_position("center")
        .crossfadein(0.4)
        .crossfadeout(0.3)
    )

    return CompositeVideoClip([bg, ligne, txt])


def creer_clip_titre(titre: str, duree: float, width: int, height: int) -> CompositeVideoClip:
    """Clip d'ouverture avec titre en grand."""
    bg = ColorClip((width, height), color=(3, 3, 8), duration=duree)

    titre_clip = (
        TextClip(
            titre.upper(),
            fontsize=54,
            font=FONT,
            color="#B48C3C",
            align="center",
            method="caption",
            size=(width - 80, None)
        )
        .set_duration(duree)
        .set_position(("center", height // 2 - 60))
        .crossfadein(0.6)
    )

    sous_titre = (
        TextClip(
            "YouFace · Philosophie Moderne",
            fontsize=28,
            font=FONT,
            color="#555555",
            align="center",
            method="caption",
            size=(width - 80, None)
        )
        .set_duration(duree)
        .set_position(("center", height // 2 + 80))
        .crossfadein(1.0)
    )

    return CompositeVideoClip([bg, titre_clip, sous_titre])


def assembler_video(script: dict, chemin_audio: Path, chemin_video: Path):
    print("  Assemblage de la vidéo...")

    clips = []

    # Clip d'intro avec le titre (4 secondes)
    clips.append(creer_clip_titre(script["titre"], 4, VIDEO_W, VIDEO_H))

    # Clip accroche
    clips.append(creer_clip_texte(script["accroche"], 5, VIDEO_W, VIDEO_H))

    # Segments
    for seg in script["segments"]:
        duree = max(4, seg.get("duree", 6))
        clips.append(creer_clip_texte(seg["texte"], duree, VIDEO_W, VIDEO_H))

    # Conclusion
    clips.append(creer_clip_texte(script["conclusion"], 6, VIDEO_W, VIDEO_H))

    # Clip final YouFace
    clips.append(creer_clip_titre("youface.io", 3, VIDEO_W, VIDEO_H))

    video = concatenate_videoclips(clips, method="compose")

    # Ajouter la voix
    if chemin_audio.exists():
        audio = AudioFileClip(str(chemin_audio))
        duree_video = video.duration
        duree_audio = audio.duration
        # Adapter la durée vidéo à l'audio si nécessaire
        if duree_audio > duree_video:
            video = video.loop(duration=duree_audio)
        video = video.set_audio(audio.subclip(0, min(duree_audio, video.duration)))

    video.write_videofile(
        str(chemin_video),
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        temp_audiofile="temp_audio.m4a",
        remove_temp=True,
        logger=None
    )
    print(f"  Vidéo sauvegardée : {chemin_video}")


# ── 4. Pipeline complet ───────────────────────────────────────────────────────

SUJETS_PAR_DEFAUT = [
    "Pourquoi les gens intelligents disparaissent en silence",
    "Le silence est la réponse que les gens matures choisissent",
    "Tu n'es pas déprimé. Tu vois clairement.",
    "Ce que tu fais quand personne ne regarde te définit",
    "Les forts ne crient pas. Ils s'éloignent.",
]


def generer_video_complete(sujet: str):
    slug = sujet[:40].lower().replace(" ", "_").replace(".", "").replace("'", "")
    chemin_audio = OUTPUT_DIR / f"{slug}.mp3"
    chemin_video = OUTPUT_DIR / f"{slug}.mp4"

    print(f"\n[+] Génération : {sujet}")

    # 1. Script
    script = generer_script(sujet)
    print(f"    Titre : {script['titre']}")

    # Sauvegarde du script
    (OUTPUT_DIR / f"{slug}_script.json").write_text(
        json.dumps(script, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # 2. Voix (si clé ElevenLabs disponible)
    if ELEVENLABS_API_KEY:
        generer_voix(script, chemin_audio)
    else:
        print("  [!] ELEVENLABS_API_KEY manquant — vidéo sans voix")

    # 3. Vidéo
    assembler_video(script, chemin_audio, chemin_video)

    return chemin_video


def main():
    if not ANTHROPIC_API_KEY:
        print("[ERREUR] Définissez ANTHROPIC_API_KEY dans vos variables d'environnement")
        sys.exit(1)

    # Sujets depuis les arguments ou liste par défaut
    sujets = sys.argv[1:] if len(sys.argv) > 1 else SUJETS_PAR_DEFAUT[:2]

    print("=" * 60)
    print("  YouFace — Générateur de vidéos philosophiques")
    print("=" * 60)

    for sujet in sujets:
        try:
            video = generer_video_complete(sujet)
            print(f"  DONE → {video}\n")
        except Exception as e:
            print(f"  [ERREUR] {sujet} : {e}\n")

    print("Terminé. Vidéos dans :", OUTPUT_DIR.resolve())


if __name__ == "__main__":
    main()
