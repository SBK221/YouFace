@echo off
setlocal
cd /d "%~dp0"
echo.
echo ================================================
echo  YOUFACE - VALIDATION FIREBASE 0.4.2
echo ================================================
echo.
call npm ci
if errorlevel 1 goto :error
call npm run build
if errorlevel 1 goto :error
call npm run native:id:check
if errorlevel 1 goto :error
call npm run firebase:preflight
if errorlevel 1 goto :error
call npx cap sync android
if errorlevel 1 goto :error
call npm run firebase:fingerprints
if errorlevel 1 echo ATTENTION: empreintes SHA non generees. Verifiez JDK 21 / Android Studio.
echo.
echo FIREBASE PREFLIGHT TERMINE.
echo Verifiez que Phone, Google et Email/Password sont actives dans Firebase Authentication.
pause
exit /b 0
:error
echo.
echo ECHEC PREFLIGHT FIREBASE.
pause
exit /b 1
