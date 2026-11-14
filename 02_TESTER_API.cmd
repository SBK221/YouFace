@echo off
setlocal
cd /d "%~dp0"
if not exist .env copy .env.example .env >nul
call npm ci
if errorlevel 1 goto error
call npm run verify
if errorlevel 1 goto error
echo.
echo TOUS LES TESTS LOCAUX ONT REUSSI.
pause
exit /b 0
:error
echo.
echo TESTS EN ECHEC.
pause
exit /b 1
