@echo off
title VMWF Platform Launcher
echo ---------------------------------------------------
echo    Vishwa Madhwamatha Welfare Foundation (VMWF)
echo           Starting Cloud Backend Server...
echo ---------------------------------------------------
echo.
echo [1/2] Checking dependencies...
if not exist node_modules (
    echo node_modules not found. Installing...
    npm install
)
echo [2/2] Starting server and opening site...
start "" "http://localhost:3000/access.html"
node server.js
pause
