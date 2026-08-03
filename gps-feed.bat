@echo off
REM ===========================================================================
REM  CarStats - emulator GPS feed
REM ===========================================================================
REM  Keeps sending a fixed position to the running emulator.
REM
REM  Why this has to run continuously: the emulator's GPS only hands a fix to
REM  an app that is actively asking for one. Sending the position once at
REM  startup lands nowhere, because nothing is listening yet - so the app later
REM  asks, finds nothing, and reports that it cannot get your location.
REM
REM  Started automatically by start-demo.bat. Leave it running for the whole
REM  demo; closing this window stops the feed.
REM
REM  Usage (if run by hand):  gps-feed.bat [LAT] [LON]
REM ===========================================================================

set LAT=%1
set LON=%2
if "%LAT%"=="" set LAT=32.4332
if "%LON%"=="" set LON=34.9318

set ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe

title CarStats GPS feed - %LAT%, %LON% - leave running
echo Feeding %LAT%, %LON% to the emulator every 3 seconds.
echo Close this window to stop.
echo.

:loop
"%ADB%" emu geo fix %LON% %LAT% >nul 2>&1
timeout /t 3 /nobreak >nul
goto loop
