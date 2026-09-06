# CarStats — file-by-file guide

Every source file in the project: what it does, and why it exists.

Ordered back-to-front: database → API → mobile app → admin panel → firmware →
tooling. Generated assets (`node_modules/`, `package-lock.json`, `bin/`, `obj/`,
image files, the `design/` exports) are not listed individually.

**Quick map**

| Folder | What lives there |
|---|---|
| `CarStats.api/CarStats.API/` | ASP.NET Core 10 Web API + EF Core + SQL Server |
| `CarStats.Mobile/CarStats.Mobile/` | React Native / Expo app (the product) |
| `CarStats.AdminWeb/CarStats.AdminWeb/` | React + MUI admin panel |
| `CarStats.ESP32/` | Firmware for the OBD-II adapter |
| root | Deploy config, demo launchers, docs |

---

# 1. Backend — `CarStats.api/CarStats.API/`

## 1.1 Startup and project setup

| File | What it does | Why it exists |
|---|---|---|
| `Program.cs` | The whole application bootstrap: picks the connection string (LocalDB in dev, Somee in prod), registers `AppDbContext` with `EnableRetryOnFailure`, sets up CORS, JWT bearer auth, the `AdminOnly` policy, Swagger, HTTP clients — then, on startup, runs `db.Database.Migrate()`, seeds the fault dictionary, and promotes the bootstrap admin. | ASP.NET Core has no `Startup.cs` any more, so this single file is the composition root. Two decisions worth defending: the **retry loop around migration** (a free shared database is often asleep on the first request, and without the retry the whole app dies with `HTTP 500.30`), and the **fallback authorization policy** — every endpoint requires a token unless it explicitly says `[AllowAnonymous]`, so a controller added later cannot accidentally ship unprotected. There is deliberately no `UseHttpsRedirection()`: Somee terminates SSL at a shared front end and forwards plain HTTP internally, so forcing a redirect creates a loop. |
| `CarStats.API.csproj` | Targets .NET 10, nullable enabled; references BCrypt.Net-Next, EF Core SqlServer + Tools, JwtBearer, Swashbuckle. | Also pins `Microsoft.OpenApi` 2.7.5 directly — only to lift a transitive 2.4.1 that carries a known high-severity advisory. |
| `CarStats.API.sln` | Visual Studio solution file. | What you open to build/publish from the IDE. |
| `CarStats.API.http` | Sample HTTP requests. | Lets you hit endpoints from the editor without Postman. |
| `appsettings.json` | Non-secret defaults: LocalDB connection string, empty placeholders for Brevo / Google / Bootstrap, the fuel-price table, logging levels. | Committed so the project builds and runs for anyone who clones it. Real secrets go in `appsettings.Production.json`, which is gitignored. The `FuelPrice` block carries a comment naming the source and date of each price — 95 is regulated by the Ministry of Energy, 98 and diesel are free-market figures read off real receipts. |
| `appsettings.Development.json` | Dev-only overrides. | Keeps local debugging noise out of the shared file. |
| `Properties/launchSettings.json` | Local run profiles (`http` on 5279, `https` on 7077). | The mobile app's dev host constants point at these exact ports. |
| `Properties/PublishProfiles/FTPProfile.pubxml` | Visual Studio FTP publish profile for Somee. | Deployment is FTP-based; the site path must be `www.CarProject.somee.com` or the upload lands in the wrong folder. |
| `dotnet-tools.json` | Local tool manifest (`dotnet-ef`). | So `dotnet ef migrations add` works without a global install. |

## 1.2 Data layer — `Data/`

| File | What it does | Why it exists |
|---|---|---|
| `AppDbContext.cs` | Declares the four tables (`Users`, `Vehicles`, `DiagnosticCodes`, `VehicleEvents`) and configures the relationships in `OnModelCreating`. | The delete behaviour is the interesting part. Deleting a **user** cascades to their vehicles, saved codes and events — that is what "delete my account" should mean. Deleting a **vehicle** uses `ClientSetNull` instead, so fault events survive and the user's timeline is not erased when they sell the car. `ClientSetNull` rather than `SetNull` avoids SQL Server's multiple-cascade-path error, since events are already cascaded from the user side. |
| `DbSeeder.cs` | Inserts the hand-written fault dictionary on startup if the codes are missing. | Note the comment: it does **not** early-return when the table is non-empty. An earlier version did, and that froze the dictionary forever — a database seeded once would skip every code added in a later deploy. Now each code is inserted only if absent, so a deploy can grow the dictionary without touching existing rows. |
| `DtcCatalog.cs` | The rest of the dictionary — generic SAE J2012 `P0xxx` codes with plain-language titles, descriptions, severity, an action, and a shekel cost range. | Kept separate from `DbSeeder` so the original hand-written set stays readable. Manufacturer-specific codes (`P1xxx` and up) are deliberately **not** guessed at here — they differ per make and run into the thousands, so they fall through to the AI explanation in the app. Cost ranges are wide on purpose: the same code can mean a ₪50 sensor or a ₪2,000 job. |

## 1.3 Models — `Models/`

These are the EF Core entities; each class is one table.

| File | What it does | Why it exists |
|---|---|---|
| `AppUser.cs` | The account: name, email, BCrypt hash, `UserRole` enum (User / Admin / SuperAdmin), email-verification fields, and navigation lists to vehicles, saved codes and events. | Three fields carry `[JsonIgnore]` — `PasswordHash`, `EmailVerificationCode`, `VerificationCodeExpiresAt`. Without that, `GET /api/users` would hand out the live verification code and verification could be bypassed by reading it back. `NewPassword` is `[NotMapped]`: it is a write-only inbox for a plaintext password that gets hashed and discarded, never stored. `VerificationAttempts` caps wrong guesses — a six-digit code is only a million possibilities, which is brute-forceable without a limit. `TotalFaultsLogged` is a **legacy column**: the real count is now a `COUNT` over events, and the column stays only because dropping it needs a migration. |
| `Vehicle.cs` | Make, model, year, plate, average L/100 km, and the FK to its owner. | `AverageFuelConsumption` is the number every fuel and trip calculation in the app depends on, which is why the add-vehicle flow works so hard to fill it in automatically. |
| `VehicleEvent.cs` | One recorded fault: raw code, timestamp, acknowledged flag, nullable FKs to both the vehicle and the user. | The vehicle FK is **nullable** on purpose — that is what lets a deleted vehicle leave its history behind. The user FK exists so "all my faults" is a single-table query rather than a join through vehicles. |
| `DiagnosticCode.cs` | A dictionary entry: code, human title, description, `SeverityLevel` (Green / Yellow / Red), action required, min/max cost as `decimal(18,2)`. | `decimal` rather than `double` because these are money. The nullable `AppUserId` allows per-user saved codes alongside the global dictionary. |

## 1.4 Services — `Services/`

| File | What it does | Why it exists |
|---|---|---|
| `TokenService.cs` | Issues HS256 JWTs carrying user id, email and role; 30-day lifetime. `GetKeyMaterial()` is `static` and shared with `Program.cs`. | The shared static method means the signing side and the validating side can never drift apart. It **throws** if `Jwt:Key` is missing in production rather than falling back to the dev key — silently issuing forgeable tokens would be far worse than failing to start. 30 days is a deliberate trade-off: this is a phone app, and forcing re-login through an emailed code would cost more usability than it buys security. |
| `IEmailService.cs` | One-method interface for sending a verification code. | Lets the controller depend on the capability, not on Brevo. Swapping providers touches one class. |
| `BrevoEmailService.cs` | Posts to Brevo's HTTP API with the styled verification email; logs and returns `false` on failure instead of throwing. | Uses **HTTPS, not SMTP** — Somee's free tier blocks outbound SMTP ports, so an SMTP client would simply never deliver. Returning `false` rather than throwing means a mail outage does not turn registration into a 500. |
| `PasswordPolicy.cs` | The single definition of an acceptable password: ≥ 8 chars, at least one letter and one digit. | Every path that sets a password — registration, admin create, admin change — goes through here, so the rule cannot drift between them. `utils/password.ts` in the app mirrors it for instant feedback, but this is the gate that actually enforces it, because any client can be bypassed. No max length and no required symbols: length is what makes a password hard to guess, and mandatory symbols mostly produce predictable substitutions. |
| `CallerExtensions.cs` | `GetUserId()`, `IsAdmin()`, `CanActFor(userId)` read off the validated JWT claims. | This is the authorization primitive of the whole API. `[Authorize]` proves *someone* is signed in; `CanActFor` is what proves it is **your** vehicle, **your** profile, **your** events. Without it any logged-in user could read anyone's data by changing an id in the URL. |

## 1.5 Controllers — `Controllers/`

| File | Endpoints | What it does and why |
|---|---|---|
| `AuthController.cs` | `POST /api/auth/register`, `verify-code`, `resend-code`, `login` | The only `[AllowAnonymous]` controller — it is the one that hands tokens out. Registration hashes with BCrypt, stores a random 6-digit code, and emails it; login is **refused until verified** and re-sends a code instead. Wrong codes are capped (5), resends are rate-limited by a minimum gap, and codes expire — three separate defences because a 6-digit code is weak on its own. Both session-granting endpoints return the same `{ token, user }` shape so the client has one code path. |
| `UsersController.cs` | `GET /api/users` (admin), `GET /api/users/{id}`, `POST`, `PUT`, `DELETE` (admin) | Profile reads and admin user management. The single-user read is `[Authorize]` + `CanActFor`, so you can fetch yourself and an admin can fetch anyone. This is where **fault counts are computed as a `COUNT` over `VehicleEvents`** rather than read from the stored column: a scan reports every code at once, so three faults arrive as three concurrent requests, and a stored counter loses increments to the lost-update race. Worse, once wrong it can never recover, because deduplication stops a later scan from correcting it. |
| `VehiclesController.cs` | `GET /api/vehicles/user/{userId}`, `POST`, `PUT`, `DELETE` | The garage. Every action re-checks ownership through `CanActFor` — the route parameter is attacker-controlled, so the token is the only trustworthy statement of who is calling. Delete relies on the `ClientSetNull` rule so history survives. |
| `MobileController.cs` | `POST /api/mobile/report-dtc`, `GET /api/mobile/events/{userId}` | The app's hot path. `report-dtc` takes a raw code, looks it up in the dictionary, records a `VehicleEvent`, and returns the translation. It **deduplicates within a time window** — a car re-reports an active fault on every single scan, so without this one ongoing fault would fill the history with dozens of identical rows and inflate the count. `events/{userId}` returns the history enriched with dictionary data so the list screen needs one request, not one per row. |
| `DtcController.cs` | `GET /api/dtc`, `POST` (admin), `DELETE /{id}` (admin) | Serves the whole dictionary to the app (it is small enough to fetch and filter client-side, which is what makes the fault-detail screen deep-linkable) and backs the admin panel's dictionary editor. |
| `NavigationController.cs` | `GET /api/navigation/route`, `nearby-shops`, `shop-phone`, `autocomplete`, `geocode` | A server-side proxy for Google Maps Platform. Two reasons, both real: Google's web-service APIs send **no CORS headers**, so the app's web build cannot call them from a browser at all; and an API key shipped in a client bundle can be extracted and spent on someone else's bill. The key lives only in gitignored server config. `shop-phone` is a separate lazy call because Place Details is billed per request — fetching a phone number for every shop in a list would cost real money for numbers nobody taps. |
| `FuelPriceController.cs` | `GET /api/fuelprice` | Returns the regulated 95 price plus 98 and diesel, each flagged `IsOfficial`. | Israel's Ministry of Energy revises the 95 price monthly, so a constant compiled into the app could only be corrected by shipping a new build. Reading it from server config means a price change is a config edit. The reader guards against a bad config value: a typo must not take the endpoint down, and a zero would silently make fuel free. |
| `StatsController.cs` | `GET /api/stats` (admin) | Powers the admin analytics dashboard: totals, top 6 codes, faults per day for 14 days, recent events, severity breakdown. Grouping happens **in memory** after fetching, because the dictionary table is tiny and the alternative is SQL that EF cannot always translate — clarity beats a micro-optimisation on a table this size. |

## 1.6 Migrations — `Migrations/`

EF Core's schema history. Each pair is `<timestamp>_<Name>.cs` (the up/down
operations) plus a `.Designer.cs` snapshot; `AppDbContextModelSnapshot.cs` is the
current state EF compares against when generating the next one.

| Migration | What it added |
|---|---|
| `InitialCreate` | Users, vehicles, diagnostic codes — the first schema. |
| `AddVehicleEvents` | The fault-history table. |
| `AddPasswordHash` / `AddPasswordColumn` | Moving auth onto stored BCrypt hashes. |
| `FinalizeRelationships`, `ApplyUserConnections`, `ConnectVehicleEvents` | Wiring the foreign keys and cascade rules into their final shape. |
| `AddVehiclesAndUserRoles` | The `UserRole` enum (User / Admin / SuperAdmin). |
| `AddEmailVerification` | Verification code, expiry and verified flag. |
| `AddShopRating` → `RemoveMechanicShops` | Shops were originally stored in our own database; this pair adds a rating column and then drops the table entirely once mechanics moved to live Google Places results. Kept rather than squashed, because the history is the honest record of the decision. |
| `AddVerificationAttempts` | The wrong-guess counter. |

> Never run `dotnet ef database update` against production — `Program.cs`
> migrates on startup. New migration: `dotnet ef migrations add <Name>`.

---

# 2. Mobile app — `CarStats.Mobile/CarStats.Mobile/`

## 2.1 Entry point and routing

| File | What it does | Why it exists |
|---|---|---|
| `index.js` | Imports `./utils/logbox`, then `expo-router/entry`. | Exists purely for **ordering**. expo-router enumerates and loads every file under `app/` itself, so a route module can pull in a noisy library before `app/_layout.tsx` ever runs. Configuring LogBox inside the layout is therefore too late. |
| `app/_layout.tsx` | Root layout: wraps the app in `AuthProvider`, `ThemeProvider` and Paper's `PaperProvider`, picks the navigation theme, and gates routes on auth state — signed-out users are redirected to login, signed-in users away from it. | Also carries a **side-effect import** of `services/notifications`, which registers the geofence task and the notification handler on every launch, *including* background launches. If it were imported only by the Settings screen, the child-safety reminder would silently stop working whenever the app was killed. |
| `app/(tabs)/_layout.tsx` | The bottom tab bar: five tabs, themed colors, `HapticTab` as the button. | `(tabs)` is an expo-router group — the parentheses keep it out of the URL. |

## 2.2 Screens — `app/`

| File | What it does | Why it exists |
|---|---|---|
| `app/(tabs)/index.tsx` | **Garage / home** — the main screen. Connects to the adapter, polls live data once a second, runs a scan, reports each code to the API, shows results, and owns the fuel baseline. | The biggest screen because it is the one that talks to the car. Everything else in the app consumes what happens here. |
| `app/(tabs)/explore.tsx` | **Fault history** — the timeline of past events, pull-to-refresh, tap through to detail. | Reads the enriched events endpoint, so each row already has its title and severity. |
| `app/(tabs)/fuel.tsx` | **Fuel** — log fill-ups, real L/100 km, cost per 100 km, spend this month/year, cost to fill, tank size and fuel type. | Where the driver's own data (fill-ups, tank size) is entered; no API can supply either. |
| `app/(tabs)/navigate.tsx` | **Mechanic finder** — map plus a "nearby mechanics" sheet, sorted by distance, with tap-to-call and directions. | Shops are live Google Places results through the API proxy — real names, real ratings. Falls back to Tel Aviv when location is denied, so the screen is never empty. |
| `app/(tabs)/profile.tsx` | **Profile** — identity, account stats, the garage, refresh and logout. | The fault count shown here is the server-computed `COUNT`, which is why it always matches the history screen. |
| `app/login.tsx` | Sign-in form. | Built on react-native-paper inputs themed to the CarStats palette — the app gets Paper's accessibility, focus states and floating labels without adopting Paper's stock Material look. |
| `app/register.tsx` | Three-step registration: account details → emailed code → first car. | The code step sits *between* the other two deliberately: the account is useless until verified, and adding a car first would strand data on an account that may never be confirmed. |
| `app/settings.tsx` | Appearance (light/dark/system), notification toggles, home address for the geofence, account, about. | Every toggle is wired to a real feature. The home address is entered here and **stored only on the device** — there is no location column in the database. |
| `app/trip-planner.tsx` | Route distance and live traffic, fuel needed, and the "will I make it?" verdict. | Applies the traffic penalty **non-linearly** (idling burns far less than cruising, so the delay penalty is halved). The verdict is shown only when the car reported its own fuel level — never from an estimate, because telling someone they have enough fuel on the strength of a guess is the one failure mode that strands them. |
| `app/fault/[code].tsx` | Fault detail: plain-language explanation, what to do, repair estimate. | Takes **only the code** in the route, then fetches and filters the dictionary itself. That keeps the screen deep-linkable, and means a history row (whose payload omits the action text) shows exactly the same detail as a fresh scan. |

## 2.3 Components — `components/`

| File | What it does | Why it exists |
|---|---|---|
| `AddVehicleModal.tsx` | The add-a-car flow, in two paths: **plate lookup** (Israeli registry → auto-fills year/make/model → EPA trim → consumption) and **manual entry** (year → make → model → trim). | The largest component in the app because getting `AverageFuelConsumption` right without asking the driver to know it is genuinely hard — it is the number every fuel and trip calculation depends on. |
| `ScanOverlay.tsx` | Full-screen scan experience: progress ring, live-data tile grid, found-faults card. | Follows the `design/…/live_scan` export down to the ring geometry. A scan takes seconds, and a blank screen for those seconds reads as a crash. |
| `ShopMap.tsx` / `ShopMap.native.tsx` / `ShopMap.types.ts` | The mechanic-finder map, split by platform: the real `react-native-maps` view on iOS/Android, a styled placeholder on web, with shared prop types. | `react-native-maps` is native-only; without the `.native` split the web bundle fails to build. Metro picks the right file automatically. |
| `home/ScannerBanner.tsx` | Adapter connection state at the top of the Garage screen, plus RETRY. | RETRY is the user's only way back once the adapter has been marked offline. |
| `home/LiveGauges.tsx` | RPM, speed, coolant and fuel tiles, refreshed once a second. | The fuel tile doubles as the entry point for setting a baseline on cars that cannot report PID `0x2F`. |
| `home/DtcResultCard.tsx` | One fault from a completed scan, tinted by severity, tappable through to detail. | Severity colour is the fastest signal on the screen: red means stop. |
| `home/FuelSetModal.tsx` | Manual entry of current level and tank size, with ¼ / ½ / ¾ quick fills. | Only reachable on cars whose adapter cannot report the level. The quick fills exist because nobody knows their tank is at 63%. |
| `haptic-tab.tsx` | Adds a light haptic tap to tab presses on iOS. | Small polish; no-ops elsewhere. |
| `ui/icon-symbol.tsx` / `icon-symbol.ios.tsx` | One icon component: SF Symbols on iOS, mapped Material Icons everywhere else. | Lets screens name an icon once and get the platform-native one. |

## 2.4 State and theme — `context/`, `constants/`, `hooks/`

| File | What it does | Why it exists |
|---|---|---|
| `context/AuthContext.tsx` | Holds the signed-in user and JWT for the whole app, persists the session to AsyncStorage, refreshes the profile, and clears notification prefs on logout. | Session persistence is why the app does not ask for a password every launch. The storage key was **bumped** when sessions gained a JWT, because an old stored entry (a bare user with no token) cannot call the API any more and would present as a logged-in account where everything 401s. |
| `context/ThemeContext.tsx` | Resolves the active palette from the Appearance setting (light / dark / system), persists it, and exposes `useTheme()` and `createThemedStyles()`. | The single switchboard for dark mode: screens never import a palette directly, so one setting changes every screen at once. |
| `constants/theme.ts` | The two full palettes (light "Soft Tech" from the design system, plus a derived dark variant) and the `ThemeColors` type. | Single source of truth for colour. The project rule is that **no screen hardcodes a hex value** — otherwise dark mode is only ever half-done. |
| `constants/paperTheme.ts` | Translates the CarStats palette into a Material-3 theme for react-native-paper. | Paper components read colour from an MD3 theme, not from our tokens, so without this file every Paper button would render in stock purple and look like a different app. The mapping is nearly 1:1 because our palette was already built on MD3 role names. |
| `hooks/usePlaceSuggestions.ts` | Debounced Google Places autocomplete through the API proxy. | Extracted from the trip planner so the home-address field in Settings uses the same behaviour — same debounce, same result limit, same silent-failure rule — rather than a second copy of it. Debouncing matters here because autocomplete is billed per keystroke otherwise. |

## 2.5 Services — `services/`

Everything that talks to the outside world.

| File | What it does | Why it exists |
|---|---|---|
| `http.ts` | `fetchWithTimeout(url, ms, init)` — a `fetch` wrapper that aborts on a timer. | `fetch` has **no default timeout**, so a request to an unreachable host (the adapter when you are not in the car, a government API that is down) hangs forever and the screen spins forever with it. Project rule: every outbound call in the app goes through here. |
| `api.ts` | The typed API client: axios instance, `setAuthToken`, all shared enums/interfaces (`SeverityLevel`, `UserRole`, `Vehicle`, `AppUser`, `ReportDtcResponse`…), and one function per endpoint. | One file means the base URL, the timeout and the bearer header are configured exactly once. The interfaces here mirror the C# models, which is what makes a rename on the server show up as a TypeScript error rather than as `undefined` on screen. |
| `scanner.ts` | Talks to the ESP32 at `http://192.168.148.100`: `/status`, `/live-data`, `/dtcs`, `/vin`, with a 3-second timeout. | The adapter joins the phone's hotspot with a **static IP**, so the app can find it without any discovery protocol or WiFi switching. The short timeout is what keeps the UI responsive when the adapter is not there. |
| `demoScanner.ts` | A stand-in for the adapter that returns plausible live data and three codes — `P0300` (red), `P0420` (green) and `P1450` (deliberately *not* in the dictionary, so the AI path is exercised). | Without hardware on the network the entire diagnostics screen is dead, which makes the app impossible to demonstrate away from the car. It is switched on deliberately from the Garage screen and labelled as a demo everywhere it appears — never a silent fallback that could be mistaken for a real car. |
| `dtcLookup.ts` | Asks Gemini to explain a code that is not in the dictionary, in the same plain language the dictionary uses; caches the answer in AsyncStorage permanently. | Manufacturer-specific codes run into the thousands, and showing a driver a bare code with "check the manual" is exactly the problem this project exists to fix. Two deliberate limits: **no repair price is requested** (a wrong number is worse than no number — a model cannot know Israeli garage rates), and the result is **always labelled AI-generated**, never presented as a curated entry. Caching is permanent because a code's meaning does not change. |
| `vehiclelookup.ts` | Israeli plate → vehicle, via the government open-data portal (`data.gov.il`, no key). | The only source that knows Israeli cars. Also where `translateMake()` lives: the registry truncates Hebrew manufacturer names around 14 characters, so matching is done on a prefix rather than an exact string. |
| `vindecode.ts` | 17-character VIN → make/model/year, via NHTSA vPIC (no key). | Works for imports too, because the first three characters (the WMI) are an ISO 3779 global standard. For non-US-market models it may return a generic model name — still enough to identify the car and offer to add it. |
| `fueleconomy.ts` | EPA FuelEconomy.gov (no key): year → make → model → trim, and the consumption figure, converted from MPG to L/100 km. | Gives a real consumption default instead of asking the driver for a number they do not know. US-market data, which is the documented reason the manual add-vehicle path only lists US models. |
| `tankState.ts` | Persists tank level, tank size and fuel type per vehicle in AsyncStorage. | The fuel reading is polled on the home screen, but the fuel tab and the trip planner both need it and neither can poll the car. Rather than lifting scanner state into a context used by three screens, the home screen writes what it knows here and the others read it. Level and capacity are stored separately because they come from different places: the level is measured or estimated, the capacity is typed once by the driver — no API publishes a car's tank size. |
| `notifications.ts` | Notification preferences plus the two features: fault-scan alerts, and the child-safety arrival reminder (a geofence via `expo-location` + `expo-task-manager`). | The geofence is registered **with the operating system**, not polled by the app. Android escalates from cheap cell-tower positioning to GPS only near the boundary, and the app never asks for location itself — which is the only reason the feature is viable on battery, and why it still fires with the app closed. |

## 2.6 Pure logic — `utils/`

Deliberately free of network and storage calls, so every edge case is unit-tested
without mounting a component. This is where the arithmetic that drives the gauges
and the cost estimates lives — where a wrong answer is silent rather than obvious.

| File | What it does | Why it exists |
|---|---|---|
| `fuel.ts` | Fuel types and labels, fallback prices, level estimation from distance and consumption, fill-up cost, running costs, and `tripFuelOutlook`. | Many cars do not support PID `0x2F`, so the level has to be inferred from a driver-set baseline. Contains explicit guards so a missing tank size cannot divide by zero and slam a full car's gauge to empty. |
| `severity.ts` | Maps `SeverityLevel` to a theme colour and a badge label, and folds a whole scan down to its worst fault. | One scan can return five codes; the driver needs one answer about whether to keep driving. |
| `password.ts` | Client-side mirror of the server's password rules. | Instant feedback while typing. The file's own comment says it: change a rule here and change `PasswordPolicy.cs` too, or the app will accept passwords the API then rejects. |
| `route.ts` | Turns a Google Directions status into a message a driver can act on. | `NOT_FOUND` and `ZERO_RESULTS` used to share one message and are genuinely different failures: the first means the address could not be geocoded, the second means both ends were understood but no drivable route joins them. Blaming the address for the second sends the user off rewriting a destination that was never the problem — which is exactly what happens when the emulator reports a position on another continent. |
| `confirm.ts` | A confirm dialog that also works on web. | React Native for Web does not implement `Alert` at all — the call neither fails nor logs, it simply does nothing. So any destructive button whose action runs in the callback appears completely broken in a browser. |
| `logbox.ts` | Hides one exact Expo Go warning about remote push notifications. | That warning renders as a full-screen red error at launch, and it is a statement about Expo Go rather than a fault in this app: our notifications are local and work normally. It matches one message rather than silencing errors broadly, and LogBox only exists in development. |

## 2.7 Tests — `__tests__/` (82 tests, `npm test`)

| File | Covers | Count |
|---|---|---|
| `fuel.test.ts` | Fuel estimation, fill-up cost, running costs, trip outlook | 35 |
| `severity.test.ts` | Severity mapping and folding a scan to its worst fault | 12 |
| `fueleconomy.test.ts` | The consumption lookup chain | 11 |
| `password.test.ts` | Password policy | 10 |
| `vindecode.test.ts` | VIN parsing and vehicle matching | 7 |
| `routeErrorMessage.test.ts` | Route failure messages | 7 |

## 2.8 Mobile config

| File | What it does |
|---|---|
| `package.json` | Dependencies and scripts (`start`, `android`, `web`, `lint`, `test`); Jest is configured here with the `jest-expo` preset. |
| `app.json` | Expo config: name, slug, scheme (`carstatsmobile`), icons, splash, plugins (expo-router, expo-location, expo-notifications…), Android adaptive icon. |
| `tsconfig.json` | Strict TypeScript plus the `@/*` path alias every import in the app uses. |
| `eslint.config.js` | Lint rules (`expo lint`). |
| `.env.example` | Template for `.env` — `EXPO_PUBLIC_GEMINI_API_KEY`. The real `.env` is gitignored. |
| `.vscode/` | Recommended extensions and editor settings. |
| `README.md` | Expo's generated readme. |

---

# 3. Admin panel — `CarStats.AdminWeb/CarStats.AdminWeb/`

| File | What it does | Why it exists |
|---|---|---|
| `index.html` | Vite's HTML entry. | Where React mounts. |
| `src/main.jsx` | Mounts `<App>` inside MUI's `ThemeProvider` and `CssBaseline`. | One provider re-skins every MUI component; `CssBaseline` resets browser defaults so the panel starts from the same surface the app does. |
| `src/App.jsx` | Shell: app bar, tabs (Analytics / Dictionary / Users), logout, and session restore from `localStorage`. | Restoring the session requires **both** halves — the user object for display and the JWT for requests. One without the other is stale and produces a panel that looks logged in but 401s on everything. |
| `src/theme.js` | The MUI theme built from the same Soft Tech tokens as the mobile app, plus the exported `Palette`. | Kept as literal values rather than an import: the two projects build separately and share no package, so a copy with a pointer back to the source is honest about the coupling. |
| `src/Services/api.js` | Axios instance with a request interceptor that attaches the stored JWT, plus every admin call (auth, dictionary, users, vehicles, stats). | Without the interceptor every endpoint returns 401. `login()` also enforces that only Admin / SuperAdmin accounts get through the panel — a normal driver's valid token is rejected here even though the API would accept it for their own data. |
| `src/Components/LoginPage.jsx` | The login gate. | Calls the same `/auth/login` the app does — one auth system, not two. |
| `src/Components/Analytics.jsx` | The dashboard: totals, top codes, faults per day, recent events, severity breakdown. | The reason `StatsController` exists. Severity colours match the app's, so a Red here means the same thing as a Red there. |
| `src/Components/Dashboard.jsx` | The fault-dictionary editor: table, add, delete. | Lets a code be corrected or added without a redeploy. It catches load failures explicitly — an unhandled rejection just shows an empty table, which reads as "the dictionary is empty" rather than "the request failed". |
| `src/Components/UsersManager.jsx` | User management with role editing, plus each user's vehicles inline. | Vehicles are edited here because a support question is almost always about a specific car, not about the account. |
| `src/App.css`, `src/index.css` | Layout and base styles. | |
| `src/assets/`, `public/` | Logo, icons, favicon. | |
| `vite.config.js` | Vite + React plugin config. | |
| `eslint.config.js` | Lint rules. | |

---

# 4. Firmware — `CarStats.ESP32/`

| File | What it does | Why it exists |
|---|---|---|
| `CarStats.ESP32.ino` | The adapter. Joins the phone's hotspot in station mode with a **static IP** (`192.168.148.100`), brings up the TWAI/CAN driver at 500 kbps, polls the ECU for RPM (`0x0C`), speed (`0x0D`), coolant (`0x05`), engine load (`0x04`) and fuel level (`0x2F`), reads DTCs with mode `0x03`, and serves `/status`, `/live-data`, `/dtcs`, `/vin` and `/debug` as JSON. Falls back to simulated readings when no CAN response arrives. | The whole reason the project needs no commercial scanner. The static IP is what lets the app find it with no discovery protocol. Simulation mode is the hardware equivalent of `demoScanner.ts` — the app works for a demo on a desk. **Two things to fix before submission:** the file's header comment still describes an older access-point design (`192.168.4.1`), which no longer matches the code below it; and the hotspot SSID and password are hardcoded literals in a committed file — they should move to a local, gitignored config header. |
| `platformio.ini` | Board (`esp32-s3-devkitc-1`), framework, monitor speed, ArduinoJson dependency, PSRAM flag. | Makes the build reproducible. The CAN driver needs no library — `driver/twai.h` ships with the board package. |

---

# 5. Root — tooling, deployment, docs

| File | What it does | Why it exists |
|---|---|---|
| `README.md` | The project's main document: problem, architecture, features, engineering decisions, security, testing, how to run, known limitations. | The thing to read first. |
| `CLAUDE.md` | Working notes: structure, commands, production/deploy specifics, conventions, recurring gotchas. | Written for tooling and for whoever picks the project up — it is where the "stop the local API before publishing, it locks the exe" class of knowledge is recorded. |
| `FILE-GUIDE.md` | This file. | |
| `ToDoList.txt` | Remaining work. | |
| `netlify.toml` | Points Netlify at `CarStats.AdminWeb/CarStats.AdminWeb`, `npm run build`, publish `dist`, Node 22. | The repo root holds several projects, so Netlify has to be told which one to build. With this committed, connecting the repo is the entire setup and every push to `main` redeploys the panel. The API and the mobile app are **not** built here. |
| `start-demo.bat` | One-click demo: cold-boots the Android emulator, fixes its GPS to Hadera, starts the dev server, opens the app. | The `-no-snapshot` flags are the point. Otherwise the emulator restores a saved snapshot, which brings back its cached GPS position in California and silently overrides whatever you set — and routing from California to an Israeli address returns no result, which the app correctly reports as a routing failure. Cold booting is what makes the location stick. |
| `gps-feed.bat` | Continuously pushes a fixed position to a running emulator. | The emulator's GPS only hands a fix to an app that is actively asking for one, so a single shot at startup lands nowhere. Needed for "use my current location" and the "near me" mechanics filter. |
| `.claude/launch.json` | Dev-server definition for the Expo web build on port 8081. | Lets the tooling start the app the same way every time. |
| `.gitignore` | Excludes `node_modules/`, `bin/`, `obj/`, `.env`, `appsettings.Production.json`. | **The security boundary of the repository.** The connection string, the Brevo key, the Google key and the JWT signing key all live in files named here — which is why the repo and its full history contain no real credentials. |
| `.gitattributes` | Line-ending normalisation. | Keeps diffs clean across Windows and CI. |

---

## How a fault gets from the car to the driver

1. `CarStats.ESP32.ino` reads mode `0x03` over CAN and serves `["P0420"]` at `/dtcs`.
2. `services/scanner.ts` fetches it through `fetchWithTimeout` (3 s).
3. `app/(tabs)/index.tsx` posts each code to `POST /api/mobile/report-dtc` via `services/api.ts`.
4. `MobileController` looks the code up in `DiagnosticCodes`, deduplicates against recent events, writes a `VehicleEvent`, and returns the translation.
5. If the code was not in the dictionary, `services/dtcLookup.ts` asks Gemini and caches the answer, labelled as AI.
6. `utils/severity.ts` picks the colour; `components/home/DtcResultCard.tsx` renders it; `app/fault/[code].tsx` shows the detail and the shekel estimate.
7. Later, `GET /api/mobile/events/{userId}` replays the same event into the history tab, and `UsersController` counts it — as a `COUNT`, so the two screens can never disagree.
