@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or later, then run START_RONIX.cmd again.
  pause
  exit /b 1
)
node "%~dp0erp\server.js" --open
if errorlevel 1 pause
