@echo off
chcp 65001 >nul
cd /d "%~dp0banka_pos_panel"
title BANKA / POS Excel Düzenleyici
python banka_panel.py
if errorlevel 1 pause
