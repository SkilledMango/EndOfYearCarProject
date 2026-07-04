using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;

namespace CarStats.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Policy = "AdminOnly")] // analytics dashboard is admin-panel only
    public class StatsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public StatsController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/stats
        [HttpGet]
        public async Task<IActionResult> GetStats()
        {
            // ── Totals ────────────────────────────────────────────────────────
            var totalUsers    = await _context.Users.CountAsync();
            var totalVehicles = await _context.Vehicles.CountAsync();
            var totalFaults   = await _context.VehicleEvents.CountAsync();

            // ── Fetch DTC dictionary into memory (small table) ────────────────
            var allDtcs = await _context.DiagnosticCodes
                .Select(d => new { d.ErrorCode, d.HumanTitle, d.Severity })
                .ToListAsync();
            // Group defensively — the dictionary table may contain duplicate
            // ErrorCode rows (same guard as MobileController).
            var dtcMap = allDtcs
                .GroupBy(d => d.ErrorCode)
                .ToDictionary(g => g.Key, g => g.First());

            // ── Most common fault codes (top 6) ───────────────────────────────
            var topCodes = await _context.VehicleEvents
                .GroupBy(e => e.RawErrorCode)
                .Select(g => new { code = g.Key, count = g.Count() })
                .OrderByDescending(x => x.count)
                .Take(6)
                .ToListAsync();

            var topCodesEnriched = topCodes.Select(tc =>
            {
                dtcMap.TryGetValue(tc.code, out var dtc);
                return new
                {
                    tc.code,
                    tc.count,
                    title    = dtc?.HumanTitle ?? "Unknown",
                    severity = dtc?.Severity,
                };
            }).ToList();

            // ── Faults per day (last 14 days) — group in memory ───────────────
            var twoWeeksAgo = DateTime.UtcNow.AddDays(-14);
            var recentTimestamps = await _context.VehicleEvents
                .Where(e => e.Timestamp >= twoWeeksAgo)
                .Select(e => e.Timestamp)
                .ToListAsync();

            var faultsByDay = recentTimestamps
                .GroupBy(t => t.Date)
                .Select(g => new { date = g.Key, count = g.Count() })
                .OrderBy(x => x.date)
                .ToList();

            // ── Recent fault events (last 8) ──────────────────────────────────
            var recentEvents = await _context.VehicleEvents
                .OrderByDescending(e => e.Timestamp)
                .Take(8)
                .Select(e => new
                {
                    e.Id,
                    e.RawErrorCode,
                    e.Timestamp,
                    e.AppUserId,
                })
                .ToListAsync();

            // Fetch user names for those events sequentially (safe with DbContext)
            var userIds = recentEvents
                .Where(e => e.AppUserId.HasValue)
                .Select(e => e.AppUserId!.Value)
                .Distinct()
                .ToList();

            var users = await _context.Users
                .Where(u => userIds.Contains(u.Id))
                .Select(u => new { u.Id, u.FullName })
                .ToListAsync();
            var userMap = users.ToDictionary(u => u.Id, u => u.FullName);

            var recentEnriched = recentEvents.Select(ev =>
            {
                var userName = ev.AppUserId.HasValue && userMap.TryGetValue(ev.AppUserId.Value, out var name)
                    ? name : "Unknown user";
                dtcMap.TryGetValue(ev.RawErrorCode, out var dtc);
                return new
                {
                    ev.Id,
                    ev.RawErrorCode,
                    ev.Timestamp,
                    userName,
                    title    = dtc?.HumanTitle ?? "Unknown code",
                    severity = dtc?.Severity,
                };
            }).ToList();

            // ── Severity breakdown (joined in memory) ─────────────────────────
            var allCodes = await _context.VehicleEvents
                .Select(e => e.RawErrorCode)
                .ToListAsync();

            var severityBreakdown = allCodes
                .Select(code => dtcMap.TryGetValue(code, out var dtc) ? (int?)dtc.Severity : null)
                .Where(s => s.HasValue)
                .GroupBy(s => s!.Value)
                .Select(g => new { severity = g.Key, count = g.Count() })
                .OrderBy(x => x.severity)
                .ToList();

            return Ok(new
            {
                totalUsers,
                totalVehicles,
                totalFaults,
                topCodes        = topCodesEnriched,
                faultsByDay,
                recentEvents    = recentEnriched,
                severityBreakdown,
            });
        }
    }
}
