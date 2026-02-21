@echo off
setlocal
cd /d %~dp0

REM Sert le site en local (recommande pour eviter les restrictions file://)
py -m http.server 8000
