@echo off
setlocal enabledelayedexpansion

REM =============================
REM Config
REM =============================
REM Set to 1 only if you have permission to use 7dsorigin.gg data
set ENABLE_7DSORIGIN=1

REM =============================
REM Run update
REM =============================
cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" (
  set PYTHON=".venv\Scripts\python.exe"
) else (
  set PYTHON=python
)

set ARGS=
if "%ENABLE_7DSORIGIN%"=="1" set ARGS=--enable-7dsorigin

%PYTHON% tools\update_db.py %ARGS%

echo.
echo Done. Generated files:
echo   data\db.json
echo   data\db_live.js
echo   data\db_diff_latest.json
echo   data\db_snapshots\
pause
