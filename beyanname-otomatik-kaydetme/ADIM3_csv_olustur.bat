@echo off
chcp 65001 >nul
title Beyanname CSV Olusturucu

echo ============================================================
echo   Beyanname Listesi - CSV Cikartici
echo ============================================================
echo.

:: Python bul
set PY=
for %%p in (
    "python"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
) do (
    if not defined PY (
        %%~p --version >nul 2>&1 && set PY=%%~p
    )
)

if not defined PY (
    echo [HATA] Python bulunamadi!
    echo Lutfen KURULUM.bat'i once calistirin.
    pause
    exit /b 1
)

echo Python bulundu: %PY%
echo.

:: Gerekli paketleri kur
echo Paketler kontrol ediliyor...
%PY% -m pip install selenium webdriver-manager --quiet
echo.

:: Script'i calistir
echo CSV olusturuluyor...
echo Not: Chrome'un acik ve giris yapilmis olmasi gerekiyor (ADIM1)
echo.
%PY% "%~dp0csv_olustur.py"

pause
