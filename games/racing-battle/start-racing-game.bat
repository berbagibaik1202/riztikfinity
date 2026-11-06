@echo off
title RizLive Racing Battle — Game Server
cd /d "%~dp0server"

echo ===================================================
echo   🏁 RIZLIVE RACING BATTLE — GAME ENGINE V1.0
echo   HTML5 Web Racing Game for TikTok Live Stream
echo ===================================================
echo.
echo Memulai Authoritative Server di http://localhost:3001...
echo Buka di browser atau OBS Browser Source: http://localhost:3001
echo.

node dist/index.js
pause
