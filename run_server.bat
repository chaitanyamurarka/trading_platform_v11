@echo off
TITLE Uvicorn Server

ECHO Activating virtual environment and starting Uvicorn server...
ECHO.
ECHO Server logs will appear below. Press CTRL+C to stop the server.
ECHO.

REM This command starts PowerShell and executes a command block.
REM -NoExit: Keeps the PowerShell window open to view server output. Remove if you want it to close automatically.
REM -Command: Executes the following string as a command.
REM & { ... }: The script block that ensures both commands run in the same scope.
REM First, it calls the activation script.
REM Then, it runs the uvicorn server command.

powershell.exe -NoExit -Command "& {.\.venv\Scripts\Activate.ps1; uvicorn app.main:app --host 0.0.0.0 --reload --reload-dir app --log-level info}"

echo Server stopped.
pause
