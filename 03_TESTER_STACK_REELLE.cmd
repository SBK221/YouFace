@echo off
setlocal
title YouFace Alpha 0.3 - Integration reelle
cd /d "%~dp0"
echo.
echo ===============================================
echo   YOUFACE 0.3 - POSTGRES + S3 + FFMPEG TEST
 echo ===============================================
echo.
where docker >nul 2>nul || (echo ERREUR: Docker Desktop est requis.& pause & exit /b 1)
where npm >nul 2>nul || (echo ERREUR: Node.js/npm est requis.& pause & exit /b 1)
where ffmpeg >nul 2>nul || (echo ERREUR: FFmpeg est requis dans PATH.& pause & exit /b 1)
if not exist .env copy .env.example .env >nul
call docker compose up -d --wait postgres redis minio
if errorlevel 1 goto error
call npm ci
if errorlevel 1 goto error
call npm run storage:init
if errorlevel 1 goto error
set TEST_DATABASE_URL=postgres://youface:youface_dev_password@127.0.0.1:5432/youface
set TEST_S3_ENDPOINT=http://127.0.0.1:9000
set TEST_S3_REGION=us-east-1
set TEST_S3_BUCKET=youface-media
set TEST_S3_ACCESS_KEY=youface
set TEST_S3_SECRET_KEY=youface_minio_password
call npm run security:check
if errorlevel 1 goto error
call npm audit --audit-level=high
if errorlevel 1 goto error
call npm test
if errorlevel 1 goto error
echo.
echo ===============================================
echo        TEST STACK REELLE: PASS
 echo ===============================================
pause
exit /b 0
:error
echo.
echo TEST STACK REELLE: ECHEC
pause
exit /b 1
