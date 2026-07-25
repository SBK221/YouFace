@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\connect-firebase.ps1"
if errorlevel 1 pause
