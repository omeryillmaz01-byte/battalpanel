@echo off
chcp 65001 >nul
echo ============================================
echo   GROWTUP SOSYAL MEDYA - MART 2026 KDV
echo   (Tek firma - TANER)
echo ============================================
echo.
echo Kontrol listesi:
echo   [?] Excel'i ^(mukellef listesi^) KAYDEDIP KAPATTINIZ mi?
echo   [?] ADIM1 ile Chrome'u actiniz mi?
echo   [?] ebeyanname.gib.gov.tr'ye giris yaptiniz mi?
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
echo GROWTUP indiriliyor...
echo.
%PYTHON% "%~dp0indir.py" --csv kdv-growtup-mart.csv --tur KDV1 --yil 2026

pause
