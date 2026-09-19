@echo off
title Stop MediSync Servers
echo Stopping MediSync servers on port 8000 and 5500...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a 2>nul
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5500" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a 2>nul
)

echo MediSync servers stopped.
pause
