@echo off
title TikTok Live Controller + RizLive Racing Battle
cd /d "%~dp0"

echo ======================================================================
echo   🏎️  TIKTOK LIVE GAME CONTROLLER + RIZLIVE RACING BATTLE V1.0
echo ======================================================================
echo.

rem 1. Jalankan Game Server Node.js (Port 3001) di jendela terpisah
echo [1/2] Memulai Game Engine Balapan di http://localhost:3001 ...
start "RizLive Racing Engine (Port 3001)" /d "%~dp0games\racing-battle\server" cmd /k "node dist/index.js"

rem 2. Jalankan Python TikInfinity Controller (Port 8000)
echo [2/2] Memulai TikTok Controller di http://localhost:8000 ...
echo.
echo ======================================================================
echo   👉 Game Balap (OBS Browser Source):  http://localhost:3001
echo   👉 Controller Dashboard (TikInfinity): http://localhost:8000
echo ======================================================================
echo.

.venv\Scripts\python.exe main.py

pause
