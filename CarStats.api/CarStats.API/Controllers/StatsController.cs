using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;

namespace CarStats.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Policy = "AdminOnly")]
    public class StatsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public StatsController(AppDbContext context)
        {
            _context = context;
        }

        // איתור: סטטיסטיקות לפאנל הניהול (שרת)
        [HttpGet]
        public async Task<IActionResult> GetStats()
        {
            var totalUsers    = await _context.Users.CountAsync();
            var totalVehicles = await _context.Vehicles.CountAsync();
            var totalFaults   = await _context.VehicleEvents.CountAsync();

            var allDtcs = await _context.DiagnosticCodes
                .Select(d => new { d.ErrorCode, d.HumanTitle, d.Severity })
                .ToListAsync();
            var dtcMap = allDtcs
                .DistinctBy(d => d.ErrorCode)
                .ToDictionary(d => d.ErrorCode);

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

            // הקיבוץ נעשה במסד הנתונים, לא בזיכרון
            var countsByCode = await _context.VehicleEvents
                .GroupBy(e => e.RawErrorCode)
                .Select(g => new { code = g.Key, count = g.Count() })
                .ToListAsync();

            var severityBreakdown = countsByCode
                .Select(x => new
                {
                    severity = dtcMap.TryGetValue(x.code, out var dtc) ? (int?)dtc.Severity : null,
                    x.count,
                })
                .Where(x => x.severity.HasValue)
                .GroupBy(x => x.severity!.Value)
                .Select(g => new { severity = g.Key, count = g.Sum(x => x.count) })
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
