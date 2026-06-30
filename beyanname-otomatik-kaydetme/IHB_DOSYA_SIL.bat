@echo off
chcp 65001 >nul
echo ============================================
echo   KDV1 - IHB Olan Dosyalari Sil
echo ============================================
echo.

set PYTHON=
for %%P in (
    "%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
) do ( if exist %%P ( set PYTHON=%%P & goto :run ) )
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 ( set PYTHON=python & goto :run )

:run
%PYTHON% "%~dp0ihb_sil.py"
