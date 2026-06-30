@echo off
cd /d "%~dp0"
python banka_panel.py
if errorlevel 1 (
    echo.
    echo Panel kapandi ya da hata olustu. Yukaridaki mesaji kontrol et.
    pause
)
