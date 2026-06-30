@echo off
chcp 65001 >nul
echo ============================================
echo   YILLIK + KURUMLAR PDF INDIRME
echo ============================================
echo.
echo 1. ADIM1 ile Chrome'u acin
echo 2. ebeyanname.gib.gov.tr'ye giris yapin
echo 3. Asagidaki dosyalar proje klasorunde olsun:
echo    - yillik gelir 2025.csv
echo    - 2024 yili kurumlar .csv
echo    - tcc kurumlar 2026.csv
echo.
pause

echo Python: python
echo.
python -m pip install openpyxl requests websocket-client pymupdf --quiet --disable-pip-version-check 2>nul
echo.
echo 2025 yillik gelir indiriliyor...
python "%~dp0indir.py" --csv "yillik gelir 2025.csv"
echo.
echo 2024 kurumlar indiriliyor...
python "%~dp0indir.py" --csv "2024 yili kurumlar .csv"
echo.
echo TCC kurumlar 2026 indiriliyor...
python "%~dp0indir.py" --csv "tcc kurumlar 2026.csv"
echo.
echo Tamamlandi.
pause
