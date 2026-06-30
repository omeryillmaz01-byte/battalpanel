@echo off
chcp 65001 >nul
echo ============================================
echo   GECICI VERGI - PDF Indirme Basliyor
echo ============================================
echo.
echo Kontrol listesi:
echo   [?] ADIM1 ile Chrome'u actiniz mi?
echo   [?] ebeyanname.gib.gov.tr'ye giris yaptiniz mi?
echo   [?] ggecici.csv proje klasorunde mi?
echo.
pause

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
    if exist %%P (
        set PYTHON=%%P
        goto :kurulum
    )
)
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 ( set PYTHON=python & goto :kurulum )

echo [HATA] Python bulunamadi! Lutfen KURULUM.bat'i once calistirin.
pause & exit /b 1

:kurulum
echo Python: %PYTHON%
echo.
echo Gerekli kutuphaneler kontrol ediliyor...
"%PYTHON%" -m pip install openpyxl requests websocket-client pymupdf --quiet --disable-pip-version-check 2>nul
echo.
echo Indirme basliyor...
echo.
echo Not:
echo   - Firma ayrimi Excel'den otomatik yapilacak ^(Taner / Omer^)
echo   - Donem klasoru Vergilendirme_Donemi alanindan secilecek
echo   - 01-03 = 1-) 1-3 DONEMI
echo   - 04-06 = 2-) 4-6 DONEMI
echo   - 07-09 = 3-) 7-9 DONEMI
echo   - 10-12 = 4-) 10-12 DONEMI
echo.
"%PYTHON%" "%~dp0indir.py" --csv ggecici.csv --tur GGECICI
echo.
echo Tamamlandi.
pause
