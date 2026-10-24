@echo off
title HOWELL SPIN & WIN
echo =====================================================
echo           HOWELL SPIN & WIN - BOOTH APP
echo =====================================================
echo.
echo Membuka website di browser...
echo.
cd /d "%~dp0"
start "" "http://127.0.0.1:5173/spin-wheel/"
call npm.cmd run preview -- --host 127.0.0.1 --port 5173
if errorlevel 1 (
    call npm.cmd run dev -- --host 127.0.0.1 --port 5173
)
pause
