"""
YouFace - Générateur automatique de vidéos philosophiques
Psychologie + Stoïcisme + Réalité Moderne
Pipeline: Script (Claude) → Voix (gTTS/ElevenLabs) → Musique → Vidéo (MoviePy)
"""

import os
import sys
import json
import re
import requests
from pathlib import Path

import subprocess
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter
from moviepy import (
    AudioFileClip, ColorClip, CompositeVideoClip,
    TextClip, concatenate_videoclips, vfx
)
from moviepy.audio.AudioClip import AudioArrayClip
from moviepy.audio.AudioClip import CompositeAudioClip

import anthropic


# ── Configuration ─────────────────────────────────────────────────────────────

ANTHROPIC_API_KEY  = os.environ.get("ANTHROPIC_API_KEY", "")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB")

OUTPUT_DIR = Path("output_videos")
OUTPUT_DIR.mkdir(exist_ok=True)

VIDEO_W, VIDEO_H = 1080, 1920
FPS             = 24
SAMPLE_RATE     = 44100
FONT_BOLD       = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG        = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BG_COLOR        = (5, 5, 10)
ACCENT_COLOR    = (180, 140, 60)
MUSIC_VOLUME    = 0.18   # musique en fond (0.0 → 1.0)
VOICE_VOLUME    = 1.0


# ── 1. Génération du script avec Claude ───────────────────────────────────────

SYSTEM_PROMPT = """Tu es un scénariste de vidéos philosophiques virales.
Style : voix profonde, phrases TRÈS courtes et percutantes, atmosphère cinématique sombre.
Inspiré de : stoïcisme, psychologie moderne, vérités dures sur la société.

Format de réponse JSON strict :
{
  "titre": "...",
  "phrases": [
    "phrase 1 très courte (max 10 mots)",
    "phrase 2",
    ...
  ]
}

Règles IMPORTANTES :
- Entre 12 et 18 phrases au total
- Chaque phrase : MAX 10 mots, percutante, standalone
- Commencer par une accroche choc
- Finir par une conclusion mémorable
- Ton : grave, sans pitié, profond
- Langue : français
"""

def generer_script(sujet: str) -> dict:
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    print(f"  Script IA pour : {sujet}")
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"Crée une vidéo sur : {sujet}"}]
    )
    raw = message.content[0].text.strip()
    start, end = raw.find("{"), raw.rfind("}") + 1
    return json.loads(raw[start:end])


# ── 2. Musique cinématique générée par code ───────────────────────────────────

def _butter_lowpass(cutoff, fs, order=4):
    b, a = butter(order, cutoff / (fs / 2), btype="low")
    return b, a

def generer_musique(duree: float, chemin: Path):
    """Génère un drone cinématique grave + shimmer atmosphérique."""
    print(f"  Musique cinématique ({duree:.0f}s)...")
    n = int(SAMPLE_RATE * duree)
    t = np.linspace(0, duree, n, False)

    # Drone fondamental A1 = 55 Hz + harmoniques
    drone  = 0.35 * np.sin(2 * np.pi * 55   * t)
    drone += 0.18 * np.sin(2 * np.pi * 110  * t)
    drone += 0.10 * np.sin(2 * np.pi * 82.4 * t)  # E2
    drone += 0.08 * np.sin(2 * np.pi * 27.5 * t)  # A0 sub-bass

    # Respiration lente (LFO 0.08 Hz)
    lfo = 0.55 + 0.45 * np.sin(2 * np.pi * 0.08 * t)
    drone *= lfo

    # Shimmer haute fréquence filtré
    bruit = 0.015 * np.random.randn(n)
    b, a = _butter_lowpass(600, SAMPLE_RATE)
    shimmer = lfilter(b, a, bruit)

    # Pulse grave lent (toutes les 4 secondes)
    pulse_freq = 0.25
    pulse = 0.12 * np.maximum(0, np.sin(2 * np.pi * pulse_freq * t)) ** 8
    pulse *= np.sin(2 * np.pi * 40 * t)

    audio = drone + shimmer + pulse

    # Fade in 3s / fade out 4s
    fi = int(SAMPLE_RATE * 3)
    fo = int(SAMPLE_RATE * 4)
    audio[:fi]  *= np.linspace(0, 1, fi)
    audio[-fo:] *= np.linspace(1, 0, fo)

    # Normalise
    audio = audio / np.max(np.abs(audio) + 1e-9) * 0.9
    stereo = np.column_stack([audio, audio])
    stereo_int = (stereo * 32767).astype(np.int16)
    wavfile.write(str(chemin), SAMPLE_RATE, stereo_int)
    print(f"  Musique sauvegardée : {chemin}")


# ── 3. Synthèse vocale ────────────────────────────────────────────────────────

def generer_voix_espeak(texte: str, chemin: Path):
    """Voix française offline via espeak (aucune clé requise)."""
    print(f"  Voix espeak ({len(texte)} caractères)...")
    tmp_wav = chemin.with_suffix(".wav")
    subprocess.run(
        ["espeak", "-v", "fr", "-s", "128", "-p", "18", "-a", "180", texte, "-w", str(tmp_wav)],
        check=True, capture_output=True
    )
    # Convertir WAV → MP3 via ffmpeg pour réduire la taille
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(tmp_wav), "-q:a", "4", str(chemin)],
        check=True, capture_output=True
    )
    tmp_wav.unlink(missing_ok=True)
    print(f"  Voix sauvegardée : {chemin}")

def generer_voix_elevenlabs(texte: str, chemin: Path):
    """Voix profonde via ElevenLabs (nécessite API key)."""
    print(f"  Voix ElevenLabs ({len(texte)} caractères)...")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
    resp = requests.post(url,
        headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
        json={
            "text": texte,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {"stability": 0.45, "similarity_boost": 0.85,
                               "style": 0.3, "use_speaker_boost": True}
        }
    )
    resp.raise_for_status()
    chemin.write_bytes(resp.content)

def generer_voix(phrases: list[str], chemin: Path):
    texte = ". ".join(phrases)
    if ELEVENLABS_API_KEY:
        generer_voix_elevenlabs(texte, chemin)
    else:
        generer_voix_espeak(texte, chemin)


# ── 4. Construction vidéo ─────────────────────────────────────────────────────

def _clip_fond(duree: float, couleur=BG_COLOR) -> ColorClip:
    return ColorClip((VIDEO_W, VIDEO_H), color=couleur, duration=duree)

def _ligne_or(duree: float, y_offset: int = -100) -> ColorClip:
    return (
        ColorClip((140, 3), color=ACCENT_COLOR, duration=duree)
        .with_position(("center", VIDEO_H // 2 + y_offset))
    )

def clip_phrase(phrase: str, duree: float) -> CompositeVideoClip:
    """Carte de sous-titre : 1 phrase courte, grande police, centré."""
    bg = _clip_fond(duree)
    ligne_haut = _ligne_or(duree, y_offset=-110)
    ligne_bas  = _ligne_or(duree, y_offset= 110)

    txt = (
        TextClip(
            font=FONT_BOLD,
            text=phrase,
            font_size=72,
            color="white",
            stroke_color="black",
            stroke_width=2,
            text_align="center",
            method="caption",
            size=(VIDEO_W - 100, None),
            duration=duree,
        )
        .with_position("center")
        .with_effects([vfx.CrossFadeIn(0.25), vfx.CrossFadeOut(0.25)])
    )

    return CompositeVideoClip([bg, ligne_haut, ligne_bas, txt])

def clip_titre(titre: str, duree: float) -> CompositeVideoClip:
    """Écran d'intro/outro avec titre et branding."""
    bg = _clip_fond(duree, (3, 3, 8))

    titre_clip = (
        TextClip(
            font=FONT_BOLD,
            text=titre.upper(),
            font_size=52,
            color="#B48C3C",
            text_align="center",
            method="caption",
            size=(VIDEO_W - 80, None),
            duration=duree,
        )
        .with_position(("center", VIDEO_H // 2 - 80))
        .with_effects([vfx.CrossFadeIn(0.8)])
    )

    brand = (
        TextClip(
            font=FONT_REG,
            text="YouFace · Philosophie Moderne",
            font_size=30,
            color="#444444",
            text_align="center",
            method="caption",
            size=(VIDEO_W - 80, None),
            duration=duree,
        )
        .with_position(("center", VIDEO_H // 2 + 100))
        .with_effects([vfx.CrossFadeIn(1.2)])
    )

    return CompositeVideoClip([bg, titre_clip, brand])

def duree_pour_phrase(phrase: str) -> float:
    """Calcule la durée d'affichage selon la longueur de la phrase."""
    mots = len(phrase.split())
    return max(2.5, min(5.0, mots * 0.55))

def assembler_video(script: dict, chemin_voix: Path, chemin_musique: Path, chemin_video: Path):
    print("  Assemblage vidéo...")

    phrases = script["phrases"]
    clips = [clip_titre(script["titre"], 4)]

    for phrase in phrases:
        clips.append(clip_phrase(phrase, duree_pour_phrase(phrase)))

    clips.append(clip_titre("youface.io", 3))

    video = concatenate_videoclips(clips, method="compose")

    # ── Audio : voix + musique en fond ──
    pistes = []

    if chemin_voix.exists():
        voix = AudioFileClip(str(chemin_voix)).with_volume_scaled(VOICE_VOLUME)
        # La voix démarre après l'écran titre (4s)
        voix = voix.with_start(4)
        pistes.append(voix)

    if chemin_musique.exists():
        musique = (
            AudioFileClip(str(chemin_musique))
            .with_volume_scaled(MUSIC_VOLUME)
            .with_end(video.duration)
        )
        pistes.append(musique)

    if pistes:
        audio_final = CompositeAudioClip(pistes).with_end(video.duration)
        video = video.with_audio(audio_final)

    video.write_videofile(
        str(chemin_video),
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        temp_audiofile=str(OUTPUT_DIR / "temp_audio.m4a"),
        remove_temp=True,
        logger=None,
    )
    print(f"  DONE → {chemin_video} ({chemin_video.stat().st_size // 1024} Ko)")


# ── 5. Pipeline complet ───────────────────────────────────────────────────────

SUJETS_PAR_DEFAUT = [
    "Pourquoi les gens intelligents disparaissent en silence",
    "Le silence est la réponse que les gens matures choisissent",
    "Tu n'es pas déprimé. Tu vois clairement.",
    "Ce que tu fais quand personne ne regarde te définit",
    "Les forts ne crient pas. Ils s'éloignent.",
]

SCRIPT_DEMO = {
    "titre": "Pourquoi les gens intelligents disparaissent en silence",
    "phrases": [
        "Ils ne partent pas par faiblesse.",
        "Ils partent par sagesse.",
        "Les gens intelligents observent.",
        "Ils voient les masques.",
        "Ils comprennent les jeux.",
        "Et un jour... ils s'éloignent.",
        "Sans crier. Sans expliquer.",
        "Épictète avait tout compris.",
        "Ne perds pas ton énergie là où tu n'as aucun contrôle.",
        "Le silence n'est pas une défaite.",
        "C'est une décision.",
        "Les forts ferment les portes doucement.",
        "La société récompense le bruit.",
        "Les sages choisissent la paix.",
        "Disparaître en silence...",
        "C'est refuser de perdre son âme.",
    ]
}

def generer_video_complete(sujet: str, script: dict = None):
    slug = re.sub(r"[^a-z0-9]+", "_", sujet[:45].lower()).strip("_")
    chemin_voix    = OUTPUT_DIR / f"{slug}_voix.mp3"
    chemin_musique = OUTPUT_DIR / f"{slug}_musique.wav"
    chemin_video   = OUTPUT_DIR / f"{slug}.mp4"

    print(f"\n{'='*55}")
    print(f"  {sujet}")
    print(f"{'='*55}")

    # Script
    if script is None:
        if not ANTHROPIC_API_KEY:
            print("  [!] Pas de ANTHROPIC_API_KEY — utilisation du script démo")
            script = SCRIPT_DEMO
        else:
            script = generer_script(sujet)

    (OUTPUT_DIR / f"{slug}_script.json").write_text(
        json.dumps(script, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Musique
    duree_estimee = sum(duree_pour_phrase(p) for p in script["phrases"]) + 7
    generer_musique(duree_estimee + 5, chemin_musique)

    # Voix
    generer_voix(script["phrases"], chemin_voix)

    # Vidéo
    assembler_video(script, chemin_voix, chemin_musique, chemin_video)

    return chemin_video


def main():
    sujets = sys.argv[1:] if len(sys.argv) > 1 else SUJETS_PAR_DEFAUT[:1]
    for sujet in sujets:
        try:
            generer_video_complete(sujet)
        except Exception as e:
            print(f"  [ERREUR] {e}")
            import traceback; traceback.print_exc()

    print(f"\nVidéos dans : {OUTPUT_DIR.resolve()}")


if __name__ == "__main__":
    main()
