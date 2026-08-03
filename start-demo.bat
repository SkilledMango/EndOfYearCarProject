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
REM Runs continuously in its own minimised window: the emulator only hands a
REM GPS fix to an app that is actively asking, so a single burst at startup
REM lands nowhere.
REM
REM Only two things still depend on it - "Use my current location" in Settings
REM and "Near me" on the Mechanics tab. The rest of the app takes typed
REM addresses, so this is a safety net rather than a requirement.
start "" /min "%~dp0gps-feed.bat" %LAT% %LON%
echo      GPS feed running in a minimised window.

echo === 4/4  Starting Expo ===
REM The dev server runs in its OWN window rather than this one. Launched with
REM `call` from inside a batch file its keyboard shortcuts do not work - the
REM terminal is not interactive in that context - so pressing "a" appeared to
REM do nothing. In its own cmd window the shortcuts behave normally.
cd /d "%PROJECT%"
start "CarStats dev server" cmd /k npx expo start

echo      waiting for the bundler to come up...
:waitmetro
timeout /t 3 /nobreak >nul
netstat -an | find ":8081" | find "LISTENING" >nul
if errorlevel 1 goto waitmetro
REM Give Metro a moment past opening the port before sending it a client.
timeout /t 5 /nobreak >nul

REM "localhost" on the emulator means the emulator, not this PC, so the port
REM has to be forwarded first. Expo does this itself when you press "a"; since
REM we are opening the app directly, we do it here. Using a forward rather than
REM this machine's LAN IP means the script keeps working on any network.
"%ADB%" reverse tcp:8081 tcp:8081 >nul 2>&1

echo      opening the app on the emulator...
"%ADB%" shell am start -a android.intent.action.VIEW -d "exp://localhost:8081" >nul 2>&1

echo.
echo  ============================================================
echo   Ready. The app is loading on the emulator.
echo.
echo   Three windows are now open:
echo     - "CarStats dev server"  : the bundler. Closing it stops the app.
echo                                a = reopen on emulator, r = reload
echo     - "CarStats GPS feed"    : minimised. Only affects "Use my current
echo                                location" and "Near me".
echo     - the emulator itself
echo.
echo   This window has finished its work and can be closed.
echo  ============================================================
echo.
pause
