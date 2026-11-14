@echo off
setlocal
title YouFace Android Alpha Build
cd /d "%~dp0"
echo.
echo ===============================================
echo       YOUFACE ANDROID - BUILD DEBUG
echo ===============================================
call npm ci
if errorlevel 1 goto error
call npm run security:check
if errorlevel 1 goto error
call npm audit --audit-level=high
if errorlevel 1 goto error
call npx cap sync android
if errorlevel 1 goto error
call npm run android:harden
if errorlevel 1 goto error
cd android
call gradlew.bat assembleDebug
if errorlevel 1 goto error
cd ..
copy /Y "android\app\build\outputs\apk\debug\app-debug.apk" "YouFace-Internal-Alpha-0.3-debug.apk" >nul
echo.
echo APK CREE: %CD%\YouFace-Internal-Alpha-0.3-debug.apk
pause
exit /b 0
:error
echo.
echo BUILD ANDROID EN ECHEC.
pause
exit /b 1
