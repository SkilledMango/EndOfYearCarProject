@echo off
REM ===========================================================================
REM  CarStats - emulator GPS feed
REM ===========================================================================
REM  Keeps sending a fixed position to the running emulator.
REM
REM  Why it runs continuously rather than once: the emulator's GPS only hands a
REM  fix to an app that is actively asking for one, so a single shot at startup
REM  lands nowhere and the app later finds nothing.
REM
REM  What still needs it: only "Use my current location" in Settings, and the
REM  "Near me" side of the Mechanics switch. Everything else in the app takes a
REM  typed address instead - the trip planner's starting point, the home
REM  address, and "Near home" - so closing this window degrades those two
REM  buttons and nothing else.
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
