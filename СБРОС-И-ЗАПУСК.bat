@echo off
chcp 65001 >nul
echo ========================================
echo  СБРОС Pulse - только demo + admin
echo ========================================
echo.
echo 1. Останавливаем старый сервер...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul
echo.
echo 2. Сбрасываем базу...
cd /d "%~dp0"
call npm run reset-data
echo.
echo 3. Запускаем сервер...
echo.
echo    demo  / demo123
echo    admin / admin123
echo.
echo    Откройте: http://localhost:3000
echo.
start "" "http://localhost:3000"
npm start
pause
