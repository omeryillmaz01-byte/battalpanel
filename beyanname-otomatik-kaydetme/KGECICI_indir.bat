@echo off
chcp 65001 >nul
echo ============================================
echo   K GECICI VERGI - PDF INDIRME
echo ============================================
echo.
echo 1. ADIM1 ile Chrome'u acin
echo 2. ebeyanname.gib.gov.tr'ye giris yapin
echo 3. kgecici klasoru proje icinde olsun
echo.
pause

echo Python: python
echo.
python -m pip install openpyxl requests websocket-client pymupdf --quiet --disable-pip-version-check 2>nul
echo.
echo K Gecici indirme basliyor...
echo.
python "%~dp0indir.py" --tur KGECICI --csv-klasor kgecici
echo.
echo Tamamlandi.
pause
