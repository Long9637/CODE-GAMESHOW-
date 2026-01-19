@echo off
echo =========================================
echo    GAME SHOW SERVER - KHOI DONG
echo    Public URL: http://113.161.151.124:8126
echo =========================================
echo.

cd /d "%~dp0"
echo Dang khoi dong server...
echo.

echo Checking if MongoDB is available...
python -c "import pymongo; print('MongoDB Python driver is available')"
if errorlevel 1 (
    echo.
    echo MongoDB Python driver (pymongo) is not installed.
    echo Please install it with: pip install pymongo
    echo Using basic file-based server instead...
    echo.
    python server_python.py
) else (
    echo Starting MongoDB-enabled server...
    python server_mongodb.py
)

pause