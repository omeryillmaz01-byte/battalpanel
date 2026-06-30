@echo off
chcp 65001 >nul
echo ============================================
echo   ADIM 1 - Chrome Debug Modunda Baslatiliyor
echo ============================================
echo.

REM Chrome yollarini dene
set CHROME=
for %%C in (
    "C:\Program Files\Google\Chrome\Application\chrome.exe"
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
) do (
    if exist %%C (
        set CHROME=%%C
        goto :baslat
    )
)
echo [HATA] Chrome bulunamadi!
pause & exit /b 1

:baslat
echo Chrome baslatiliyor...
echo.

start "" %CHROME% ^
    --remote-debugging-port=9222 ^
    --remote-allow-origins=* ^
    --user-data-dir="%~dp0chrome_profil" ^
    --no-first-run ^
    --no-default-browser-check ^
    "https://ebeyanname.gib.gov.tr"

echo ============================================
echo.
echo  Chrome acildi!
echo.
echo  Simdi yapmaniz gerekenler:
echo    1. Acilan Chrome'da e-Beyanname sistemine
echo       kullanici adi ve sifrenizle giris yapin
echo    2. Giris tamamlandiktan sonra bu pencereyi
echo       ACIK BIRAKIP ADIM2_indir.bat'i calistirin
echo.
echo  BU PENCEREYI KAPATMAYIN!
echo ============================================
echo.
pause
