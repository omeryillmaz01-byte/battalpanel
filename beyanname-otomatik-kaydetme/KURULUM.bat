@echo off
chcp 65001 >nul
echo ============================================
echo   ILK KURULUM (Sadece bir kere calistirilir)
echo ============================================
echo.

REM Python kontrol
set PYTHON=
for %%P in (
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
    "C:\Program Files\Python313\python.exe"
    "C:\Program Files\Python312\python.exe"
    "C:\Python313\python.exe"
    "C:\Python312\python.exe"
) do (
    if exist %%P ( set PYTHON=%%P & goto :python_bulundu )
)
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 ( set PYTHON=python & goto :python_bulundu )

echo Python bulunamadi, kuruluyor...
winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [HATA] Otomatik kurulum basarisiz.
    echo Lutfen https://www.python.org/downloads/ adresinden Python indirin.
    echo Kurulum sirasinda "Add Python to PATH" secenegini isaretleyin!
    pause & exit /b 1
)
set PYTHON=python

:python_bulundu
echo Python: %PYTHON%
echo.
echo Gerekli kutuphaneler yukleniyor...
%PYTHON% -m pip install openpyxl requests websocket-client --quiet --disable-pip-version-check
echo.
echo ============================================
echo   KURULUM TAMAMLANDI
echo ============================================
echo.
echo Kullanim sirasi:
echo   1. ADIM1_chrome_baslat.bat  calistirin
echo   2. Acilan Chrome'da GIB'e giris yapin
echo   3. ADIM2_indir.bat  calistirin
echo.
echo NOT: ChromeDriver'a GEREK YOK.
echo.
pause
