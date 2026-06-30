@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   YILLIK + KURUMLAR TAMAMLAMA
echo ============================================
echo.
echo 1. ADIM1 ile Chrome'u acin
echo 2. ebeyanname.gib.gov.tr'ye giris yapin
echo 3. Su dosyalar proje klasorunde olsun:
echo    - yillik gelir 2025.csv
echo    - 2024 yili kurumlar .csv
echo    - tcc kurumlar 2026.csv
echo.
pause

echo Python: python
echo.
python -m pip install openpyxl requests websocket-client pymupdf --quiet --disable-pip-version-check 2>nul
echo.

echo ============================================
echo   1. TUR INDIRME
echo ============================================
python indir.py --csv "yillik gelir 2025.csv"
python indir.py --csv "2024 yili kurumlar .csv"
python indir.py --csv "tcc kurumlar 2026.csv"

echo.
echo ============================================
echo   1. KONTROL
echo ============================================
python eksik_kontrol.py --csv "yillik gelir 2025.csv" --csv "2024 yili kurumlar .csv" --csv "tcc kurumlar 2026.csv"

echo.
echo ============================================
echo   2. TUR INDIRME
echo ============================================
python indir.py --csv "yillik gelir 2025.csv"
python indir.py --csv "2024 yili kurumlar .csv"
python indir.py --csv "tcc kurumlar 2026.csv"

echo.
echo ============================================
echo   SON KONTROL
echo ============================================
python eksik_kontrol.py --csv "yillik gelir 2025.csv" --csv "2024 yili kurumlar .csv" --csv "tcc kurumlar 2026.csv"

echo.
echo Rapor: eksik_kontrol_secili_raporu.csv
echo Tamamlandi.
pause
