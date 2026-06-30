@echo off
chcp 65001 >nul
echo ============================================
echo   KDV1 - NISAN 2026 Indirme
echo   (Sadece 04/2026 - Duzeltmeler otomatik)
echo ============================================
echo.
echo Kontrol listesi:
echo   [?] Excel ^(mukellef listesi^) KAYDEDILIP KAPATILDI mi?
echo   [?] ADIM1 ile Chrome'u actiniz mi?
echo   [?] ebeyanname.gib.gov.tr'ye giris yaptiniz mi?
echo   [?] "nisan kdv .csv" proje klasorunde mi?
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
        goto :calistir
    )
)
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 ( set PYTHON=python & goto :calistir )

echo [HATA] Python bulunamadi!
pause & exit /b 1

:calistir
echo Python: %PYTHON%
echo.
echo Gerekli kutuphaneler kontrol ediliyor...
%PYTHON% -m pip install openpyxl requests websocket-client pymupdf --quiet --disable-pip-version-check 2>nul
echo.
echo KDV1 NISAN ^(04/2026^) indiriliyor...
echo.
%PYTHON% "%~dp0indir.py" --csv "nisan kdv .csv" --tur KDV1 --donem 04/2026

pause
