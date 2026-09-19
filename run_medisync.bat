@echo off
title MediSync Telemedicine Platform
echo ========================================================
echo Starting MediSync Telemedicine Platform...
echo ========================================================

:: Check for python
set PYTHON_EXE=C:\Users\muham\anaconda3\python.exe
if not exist "%PYTHON_EXE%" (
    set PYTHON_EXE=python
)

echo Starting Backend API on http://localhost:8000 ...
start "MediSync Backend (FastAPI)" /D "%~dp0backend" cmd /k ""%PYTHON_EXE%" -m uvicorn app.main:app --reload --port 8000"

timeout /t 2 >nul

echo Starting Frontend Web App on http://localhost:5500 ...
start "MediSync Frontend (Web)" /D "%~dp0" cmd /k ""%PYTHON_EXE%" -m http.server 5500 --directory frontend"

timeout /t 2 >nul

echo Opening MediSync in your browser...
start http://localhost:5500

echo ========================================================
echo MediSync is now running!
echo - Frontend: http://localhost:5500
echo - Backend API: http://localhost:8000
echo - API Docs (Swagger): http://localhost:8000/docs
echo ========================================================
pause
