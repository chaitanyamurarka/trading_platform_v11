@echo off
start python Microservices\Port8007.py
timeout /t 1 /nobreak > nul
start python Microservices\Port8006.py
timeout /t 1 /nobreak > nul
start python Microservices\Port8005.py
timeout /t 1 /nobreak > nul
start python Microservices\Port8004.py
timeout /t 1 /nobreak > nul
start python Microservices\Port8003.py
timeout /t 1 /nobreak > nul
start python Microservices\Port8002.py
timeout /t 1 /nobreak > nul
start python Microservices\Port8001.py
timeout /t 1 /nobreak > nul
start python Microservices\Port8000.py

pause