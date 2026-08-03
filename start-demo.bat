@echo off
REM ===========================================================================
REM  CarStats - one-click demo launcher (Android emulator)
REM ===========================================================================
REM  Boots the emulator, puts it at a fixed location, and starts the Expo dev
REM  server. Written for the defence: run this once, well before you present.
REM
REM  Why the -no-snapshot flags: the emulator otherwise restores a saved
REM  snapshot, which brings back its cached GPS position (Googleplex, in
REM  California) and silently overrides anything you set. Routing from
REM  California to an Israeli address returns no result, which the app reports
REM  as a routing failure. Cold booting is what makes the location stick.
REM
REM  TO CHANGE THE STARTING POINT: open Google Maps, right-click the spot, and
REM  the menu shows two numbers - latitude first, longitude second.
REM ===========================================================================

REM --- Home address, Hadera. ---
set LAT=32.4332
set LON=34.9318

set AVD=Medium_Phone_API_36.1
set SDK=%LOCALAPPDATA%\Android\Sdk
set ADB=%SDK%\platform-tools\adb.exe
set EMU=%SDK%\emulator\emulator.exe
set PROJECT=%~dp0CarStats.Mobile\CarStats.Mobile

echo.
echo === 1/4  Stopping any running emulator ===
"%ADB%" emu kill >nul 2>&1
timeout /t 3 /nobreak >nul

echo === 2/4  Cold booting %AVD% (takes 2-4 minutes) ===
start "" "%EMU%" -avd %AVD% -no-snapshot-load -no-snapshot-save

echo      waiting for Android to finish booting...
:waitloop
timeout /t 5 /nobreak >nul
for /f "delims=" %%B in ('"%ADB%" shell getprop sys.boot_completed 2^>nul') do set BOOTED=%%B
if not "%BOOTED%"=="1" goto waitloop
echo      booted.

echo === 3/4  Starting the GPS feed at %LAT%, %LON% ===
REM The emulator's GPS only delivers a fix while an app is actively asking for
REM one. A burst at startup lands nowhere, because nothing is listening yet -
REM so this runs continuously in its own minimised window for the whole
REM session, and a position is always ready the moment the app requests it.
REM
REM Closing that window stops the feed. Leave it alone until you are done.
start "" /min "%~dp0gps-feed.bat" %LAT% %LON%
echo      GPS feed running in a minimised window.

echo === 4/4  Starting Expo ===
echo.
echo  Two windows must stay open: THIS one (dev server) and the minimised
echo  "CarStats GPS feed" window. Closing either breaks the demo.
echo.
echo    a = open on the emulator     r = reload     ? = all commands
echo.
cd /d "%PROJECT%"
call npx expo start
