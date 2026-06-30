@echo off
chcp 65001 >nul
echo ============================================
echo   KDV1 - MART 2026 Indirme
echo   (Duzeltmeler CSV tekrarindan otomatik tespit)
echo ============================================
echo.
echo Kontrol listesi:
echo   [?] ADIM1 ile Chrome'u actiniz mi?
echo   [?] ebeyanname.gib.gov.tr'ye giris yaptiniz mi?
echo   [?] mart-kdv.csv proje klasorunde mi?
echo.
pause

set PYTHON=
for %%P in (
    "%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "C:\Program Files\Python313\python.exe"
    "C:\Program Files\Python312\python.exe"
) do (
    if exist %%P (
        set PYTHON=%%P
        goto :kurulum
    )
)
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 ( set PYTHON=python & goto :kurulum )

echo [HATA] Python bulunamadi!
pause & exit /b 1

:kurulum
echo Python: %PYTHON%
echo.
echo Gerekli kutuphaneler kontrol ediliyor...
%PYTHON% -m pip install openpyxl requests websocket-client pymupdf --quiet --disable-pip-version-check 2>nul
echo.
echo KDV1 MART indiriliyor...
echo.
%PYTHON% "%~dp0indir.py" --csv mart-kdv.csv --tur KDV1 --yil 2026

pause
