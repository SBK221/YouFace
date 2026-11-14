@echo off
setlocal
title YouFace Internal Alpha 0.3
cd /d "%~dp0"
echo.
echo ===============================================
echo      YOUFACE INTERNAL ALPHA 0.3 - START
echo ===============================================
echo.
where docker >nul 2>nul || (echo ERREUR: Docker Desktop est requis.& pause & exit /b 1)
where npm >nul 2>nul || (echo ERREUR: Node.js/npm est requis.& pause & exit /b 1)
where ffmpeg >nul 2>nul || (echo ERREUR: FFmpeg doit etre installe et present dans PATH.& pause & exit /b 1)
if not exist .env copy .env.example .env >nul
call docker compose up -d --wait postgres redis minio
if errorlevel 1 goto error
call npm ci
if errorlevel 1 goto error
call npm run storage:init
if errorlevel 1 goto error
call npm run verify
if errorlevel 1 goto error
call npm run migrate
if errorlevel 1 goto error
start "YouFace API" cmd /k "cd /d ""%~dp0"" && npm start"
start "YouFace Media Worker" cmd /k "cd /d ""%~dp0"" && npm run worker"
timeout /t 5 /nobreak >nul
start "" "http://localhost:4173"
echo.
echo YouFace est demarre. Garde les fenetres API et Worker ouvertes.
pause
exit /b 0
:error
echo.
echo ECHEC DU PREFLIGHT. Corrige l'erreur affichee avant de continuer.
pause
exit /b 1
