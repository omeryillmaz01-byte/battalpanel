@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   2024 KURUMLAR - SECILI TEKRAR INDIRME
echo ============================================
echo.
echo Bu bat sadece su isimleri tekrar dener:
echo - GOKHAN CELIKKAYA
echo - FATIH YILMAZ
echo - NURI HACIKERIMOGLU
echo - RAFET EFE ERDOGDU
echo - RAFET DAL
echo - GIZEM TASTEKNE
echo.
echo 1. ADIM1 ile Chrome'u acin
echo 2. ebeyanname.gib.gov.tr'ye giris yapin
echo.
pause

echo Python: python
echo.
python -m pip install openpyxl requests websocket-client pymupdf --quiet --disable-pip-version-check 2>nul
echo.

echo Secili CSV hazirlaniyor...
python "%~dp0kurumlar_2024_secili_olustur.py"
echo.

echo Secili kurumlar tekrar indiriliyor...
python "%~dp0indir.py" --csv "2024_kurumlar_secili_tekrar.csv"
echo.
echo Tamamlandi.
pause
