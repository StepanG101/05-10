@echo off
chcp 65001 >nul
title PetLife - AI-экосистема для владельцев питомцев
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
set PETLIFE_PORT=8765

echo.
echo   Запускаю PetLife...
echo.

set "PY="
if exist "%~dp0.venv\Scripts\python.exe" set "PY=%~dp0.venv\Scripts\python.exe"
if not defined PY if exist "%~dp0..\.venv\Scripts\python.exe" set "PY=%~dp0..\.venv\Scripts\python.exe"
if not defined PY (
  where py >nul 2>nul && set "PY=py -3"
)
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo   [ОШИБКА] Python не найден. Установите Python 3.9+ с python.org
  echo            и обязательно отметьте галочку "Add Python to PATH".
  echo.
  pause
  exit /b 1
)

%PY% server.py
if errorlevel 1 (
  echo.
  echo   Сервер завершился с ошибкой. Проверьте сообщение выше.
)
echo.
pause
