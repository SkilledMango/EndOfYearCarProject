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
REM  TO USE YOUR OWN ADDRESS: change LAT and LON below. Get the numbers by
REM  right-clicking your address in Google Maps - the first is latitude, the
REM  second is longitude.
REM ===========================================================================

REM --- Tel Aviv city centre. Replace with your own coordinates. ---
set LAT=32.0853
set LON=34.7818

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

echo === 3/4  Setting location to %LAT%, %LON% ===
REM Sent repeatedly: Android's GPS only delivers a fix while something is
REM asking for one, so a single shot can land before anything is listening.
for /l %%i in (1,1,10) do (
  "%ADB%" emu geo fix %LON% %LAT% >nul 2>&1
  timeout /t 1 /nobreak >nul
)
echo      location set.

echo === 4/4  Starting Expo ===
echo.
echo  Keep THIS window open - it is the dev server.
echo    a = open on the emulator     r = reload     ? = all commands
echo.
echo  If the trip planner ever says there is no route, run this in another
echo  window to re-send the position:
echo    "%ADB%" emu geo fix %LON% %LAT%
echo.
cd /d "%PROJECT%"
call npx expo start
