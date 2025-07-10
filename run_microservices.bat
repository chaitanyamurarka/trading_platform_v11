@echo off

REM Activate the virtual environment
call "%~dp0.venv\Scripts\activate.bat"

REM Run microservices
for %%f in (Port8000.py Port8001.py Port8002.py Port8003.py Port8004.py Port8005.py Port8006.py Port8007.py) do (
    start "" "%~dp0.venv\Scripts\python.exe" "Microservices\%%f"
    timeout /t 1 /nobreak > nul
)

pause