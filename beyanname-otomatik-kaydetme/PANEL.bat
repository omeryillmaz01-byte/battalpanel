@echo off
chcp 65001 >nul
title EBYN Panel Baslatici

REM Python bul
set PYW=
set PY=
for %%P in (
    "%LOCALAPPDATA%\Programs\Python\Python314"
    "%LOCALAPPDATA%\Programs\Python\Python313"
    "%LOCALAPPDATA%\Programs\Python\Python312"
    "%LOCALAPPDATA%\Programs\Python\Python311"
    "C:\Program Files\Python313"
    "C:\Program Files\Python312"
) do (
    if exist "%%~P\pythonw.exe" (
        set PYW=%%~P\pythonw.exe
        set PY=%%~P\python.exe
        goto :baslat
    )
)
where pythonw >nul 2>&1
if %ERRORLEVEL% EQU 0 ( set PYW=pythonw& set PY=python& goto :baslat )

echo [HATA] Python bulunamadi! Once KURULUM.bat calistirin.
pause & exit /b 1

:baslat
REM Panel penceresini konsolsuz baslat
start "" "%PYW%" "%~dp0panel.py"
exit /b 0
