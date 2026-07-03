# CarStats — End-of-Year Project

OBD-II car diagnostics app for Israeli drivers: plain-language fault codes, fuel tracking, mechanic finder.

## Structure
- `CarStats.api/CarStats.API/` — ASP.NET Core 10 + EF Core, SQL Server. Migrations auto-apply on startup (`db.Database.Migrate()`).
- `CarStats.Mobile/CarStats.Mobile/` — React Native + Expo (TypeScript, expo-router tabs).
- `CarStats.AdminWeb/CarStats.AdminWeb/` — React + Vite + MUI admin panel.
- `CarStats.ESP32/` — ESP32 OBD-II adapter firmware (serves `/status`, `/live-data`, `/dtcs`, `/vin` over WiFi at 192.168.148.100).
- `design/` — Stitch design exports (PNG + HTML per screen). The app follows this light "Soft Tech" design system.

## Commands
- API: `dotnet build` / `dotnet run` in `CarStats.api/CarStats.API` (LocalDB in dev)
- Mobile: `npx expo start --clear` in `CarStats.Mobile/CarStats.Mobile`; typecheck with `npx tsc --noEmit`
- Admin: `npm run dev` / `npx vite build` in `CarStats.AdminWeb/CarStats.AdminWeb`
- New migration: `dotnet ef migrations add <Name>` (never `database update` against prod — startup migrate handles it)

## Production (Somee free hosting)
- API: `https://CarProject.somee.com` · DB: `CarProjectDB.mssql.somee.com` (MS SQL 2022, 30 MB cap)
- Deploy: VS Publish via FTP, Site path MUST be `www.CarProject.somee.com`. School WiFi blocks FTP — use phone hotspot. If DLLs give 550 errors, STOP WEBSITE in the Somee panel first, publish, then START.
- Prod DB only accepts connections from inside Somee's network (port 1433 blocked externally).
- Secrets live in gitignored files: `appsettings.Production.json` (conn string + Brevo email API key) and mobile `.env` (`EXPO_PUBLIC_GEMINI_API_KEY`).

## Conventions
- Mobile colors come ONLY from `constants/theme.ts` tokens (`Dashboard`, `Severity`, `SeveritySoft`, `Plate`) — no hardcoded hex in screens.
- All outbound HTTP in mobile services goes through `services/http.ts` `fetchWithTimeout`.
- `AppUser.PasswordHash` / `EmailVerificationCode` are `[JsonIgnore]` — never expose them in API responses.
- Auth flow: register → emailed 6-digit code (Brevo) → verify-code → login blocked until verified.
- Fuel lookup chain: Israeli registry (plate) → EPA → NRCan → Gemini → fuel-type default.

## Gotchas
- Stop the locally running API before building/publishing — it locks `CarStats.API.exe` (recurring MSB3021/3027 errors).
- Israeli registry truncates Hebrew make names at ~14 chars — `translateMake()` prefix-matches.
- Currency is ₪ (shekels) throughout the UI.
