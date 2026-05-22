@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo  Запуск Pulse Messenger
echo ========================================
echo.
taskkill /F /IM node.exe 2>nul
timeout /t 1 /nobreak >nul
start "Pulse Server" cmd /k "cd /d "%~dp0" & npm start"
echo Ждём запуск сервера...
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"
echo.
echo Браузер открыт. Окно "Pulse Server" не закрывайте.
echo Вход: demo / demo123
pause
