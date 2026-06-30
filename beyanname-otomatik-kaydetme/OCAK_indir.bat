@echo off
chcp 65001 >nul
echo ============================================
echo   OCAK AYI - Muhtasar Indirme (Duzeltme Dahil)
echo ============================================
echo.
echo Kontrol listesi:
echo   [?] ADIM1 ile Chrome'u actiniz mi?
echo   [?] ebeyanname.gib.gov.tr'ye giris yaptiniz mi?
echo   [?] muhtasar.csv proje klasorunde mi?
echo.
echo NOT: OCAK klasoru silinmis ise tum dosyalar yeniden indirilir.
echo      Duzeltme olanlara DUZ eki otomatik eklenir.
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
        goto :run
    )
)
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 ( set PYTHON=python & goto :run )

echo [HATA] Python bulunamadi!
pause & exit /b 1

:run
echo Python: %PYTHON%
echo.
%PYTHON% "%~dp0indir.py" --csv muhtasar.csv

pause
