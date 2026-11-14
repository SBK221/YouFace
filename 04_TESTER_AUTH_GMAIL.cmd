@echo off
setlocal
title YouFace 0.4.1 - Test Auth Gmail
cd /d "%~dp0"
echo.
echo ===============================================
echo   YOUFACE 0.4.1 - TEST TELEPHONE GOOGLE GMAIL
 echo ===============================================
echo.
where npm >nul 2>nul || (echo ERREUR: Node.js/npm est requis.& pause & exit /b 1)
call npm ci
if errorlevel 1 goto error
call npm run build:clients
if errorlevel 1 goto error
call node --test --test-concurrency=1 tests/core.test.mjs
if errorlevel 1 goto error
echo.
echo AUTH YOUFACE: PASS
 echo Telephone + Google + Gmail/mot de passe conserves et acceptes.
pause
exit /b 0
:error
echo.
echo TEST AUTH EN ECHEC.
pause
exit /b 1
