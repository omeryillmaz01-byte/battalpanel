@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   2024 YILLIK GELIR - PDF INDIRME
echo ============================================
echo.
echo 1. ADIM1 ile Chrome'u acin
echo 2. ebeyanname.gib.gov.tr'ye giris yapin
echo 3. Su dosyalar proje klasorunde olsun:
echo    - 2024 yillik beyanlar .csv
echo    - 2024 yillik beyanlar 2 .csv
echo.
pause

echo Python: python
echo.
python -m pip install openpyxl requests websocket-client pymupdf --quiet --disable-pip-version-check 2>nul
echo.

echo 2024 yillik beyanlar indiriliyor...
python "%~dp0indir.py" --csv "2024 yillik beyanlar .csv"
echo.
echo 2024 yillik beyanlar 2 indiriliyor...
python "%~dp0indir.py" --csv "2024 yillik beyanlar 2 .csv"
echo.
echo Tamamlandi.
pause
