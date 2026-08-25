@echo off
setlocal
title Fantasy Drafter

:: Change working directory to the directory where this script is located
cd /d "%~dp0"

echo ==================================================================
echo   🏈 Starting Fantasy Drafter...
echo ==================================================================

:: Attempt to run with standard python command
python server.py %*
if %ERRORLEVEL% EQU 0 goto :eof

:: Fallback to Python launcher 'py' if 'python' is not on PATH
echo Python command not recognized, trying 'py' launcher...
py server.py %*
if %ERRORLEVEL% EQU 0 goto :eof

:: Fallback to python3 command
echo Trying 'python3'...
python3 server.py %*
if %ERRORLEVEL% EQU 0 goto :eof

:: If all failed, alert user and keep window open
echo.
echo [ERROR] Python could not be found on your system PATH.
echo Please make sure Python 3 is installed and added to your PATH environment variable.
echo Download Python: https://www.python.org/downloads/
echo.
pause

