@echo off
title TikTok Live Game Controller
cd /d "%~dp0"

echo ======================================================================
echo   TikTok Live Game Controller (TikFinity-Style Local Bridge)
echo ======================================================================

net session >nul 2>&1
if %errorLevel% equ 0 (
    echo [STATUS] Hak akses: Administrator [OK]
) else (
    echo [STATUS] Hak akses: Normal User
    echo [TIPS] Jika game Roblox mengabaikan tombol:
    echo        Tutup jendela ini, lalu Klik Kanan run.bat -^> "Run as administrator".
)

echo.
echo Memeriksa virtual environment...
if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] File .venv\Scripts\python.exe tidak ditemukan!
    pause
    exit /b
)

echo Memulai server di http://localhost:8000 ...
echo Buka browser Anda: http://localhost:8000
echo Tekan Ctrl + C di jendela ini untuk mematikan aplikasi.
echo ======================================================================
echo.

.venv\Scripts\python.exe main.py

echo.
echo Server telah berhenti.
pause
