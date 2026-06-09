@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo.
echo  === LandingTester Runner ===
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ОШИБКА: Node.js не найден!
    echo  Скачайте и установите: https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo  Node.js найден:
node --version

if not exist "node_modules\" (
    echo.
    echo  Первый запуск - устанавливаем зависимости...
    call npm install
    echo.
    echo  Устанавливаем браузеры...
    call npx playwright install chromium webkit
)

for /f "tokens=*" %%i in ('node -e "try{const c=require('./config.js');console.log(c.device||'chromium')}catch(e){console.log('chromium')}"') do set DEVICE=%%i

echo.
echo  Устройство: %DEVICE%
echo.

if "%DEVICE%"=="iphone" (
    echo  Запускаем мобильный тест...
    node test-mobile.js
) else if "%DEVICE%"=="pixel" (
    echo  Запускаем мобильный тест...
    node test-mobile.js
) else (
    echo  Запускаем десктопный тест...
    node test.js
)

echo.
echo  Готово. Нажмите любую клавишу.
pause >nul