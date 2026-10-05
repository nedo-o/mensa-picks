@echo off
rem Doppelklick-Starter fuer Windows.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js fehlt. Bitte von https://nodejs.org installieren ^(LTS-Version^) und nochmal starten.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"
if errorlevel 1 (
  echo Node.js ist zu alt. Bitte Version 20 oder neuer von https://nodejs.org installieren.
  pause
  exit /b 1
)
node server.js --open
pause
