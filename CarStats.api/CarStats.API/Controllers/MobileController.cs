using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;
using CarStats.API.Models;
using CarStats.API.Services;

namespace CarStats.API.Controllers
{
    public class ReportDtcRequest
    {
        public string RawCode { get; set; } = string.Empty;
        public int? UserId { get; set; }
        public int? VehicleId { get; set; }
    }

    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class MobileController : ControllerBase
    {
        // איתור: מניעת רישום כפול של אותה תקלה (24 שעות)
        private static readonly TimeSpan DuplicateFaultWindow = TimeSpan.FromHours(24);

        // איתור: בדיקת תקינות קוד תקלה (P0300)
        private static readonly System.Text.RegularExpressions.Regex ObdCode =
            new("^[PBCU][0-9A-F]{4}$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        private readonly AppDbContext _context;

        public MobileController(AppDbContext context)
        {
            _context = context;
        }

        // איתור: תרגום קוד תקלה - קבלת תקלה מהאפליקציה, שמירה ותרגום (שרת)
        [HttpPost("report-dtc")]
        public async Task<IActionResult> ReportDtc([FromBody] ReportDtcRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.RawCode))
                return BadRequest("Error code cannot be empty.");
            if (!ObdCode.IsMatch(request.RawCode.Trim()))
                return BadRequest("Not an OBD-II fault code (expected e.g. P0300).");

            // האירוע נרשם על שם בעל הטוקן (מנהל רשאי לבחור, לבדיקות)
            if (!User.IsAdmin())
                request.UserId = User.GetUserId();

            if (request.UserId.HasValue &&
                !await _context.Users.AnyAsync(u => u.Id == request.UserId.Value))
                request.UserId = null;

            // הרכב חייב להיות של אותו משתמש
            if (request.VehicleId.HasValue &&
                !await _context.Vehicles.AnyAsync(v =>
                    v.Id == request.VehicleId.Value && v.AppUserId == request.UserId))
                request.VehicleId = null;

            var rawCode = request.RawCode.Trim().ToUpperInvariant();

            // 1. רישום האירוע, אם לא נרשם כבר ב-24 השעות האחרונות
            var since = DateTime.UtcNow - DuplicateFaultWindow;
            var alreadyLogged = await _context.VehicleEvents.AnyAsync(e =>
                e.RawErrorCode == rawCode &&
                e.Timestamp >= since &&
                e.AppUserId == request.UserId &&
                e.VehicleId == request.VehicleId);

            if (!alreadyLogged)
            {
                _context.VehicleEvents.Add(new VehicleEvent
                {
                    RawErrorCode = rawCode,
                    Timestamp    = DateTime.UtcNow,
                    AppUserId    = request.UserId,
                    VehicleId    = request.VehicleId,
                });

                await _context.SaveChangesAsync();
            }

            // 2. שליפת התרגום מהמילון
            var translation = await _context.DiagnosticCodes
                .FirstOrDefaultAsync(d => d.ErrorCode == rawCode);

            // 3. קוד שלא במילון: האפליקציה תבקש הסבר מ-AI
            if (translation == null)
            {
                return Ok(new
                {
                    status = "Logged",
                    message = $"Code {rawCode} detected. Please contact support or check the manual.",
                    severity = 2
                });
            }

            // 4. החזרת התרגום לאפליקציה
            return Ok(new
            {
                status = "Logged",
                translation
            });
        }

        // איתור: מחיקת אירוע תקלה (מנהל)
        [HttpDelete("events/{id}")]
        [Authorize(Policy = "AdminOnly")]
        public async Task<IActionResult> DeleteEvent(int id)
        {
            var ev = await _context.VehicleEvents.FindAsync(id);
            if (ev == null) return NotFound();
            _context.VehicleEvents.Remove(ev);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // איתור: היסטוריית התקלות של משתמש (שרת)
        [HttpGet("events/{userId}")]
        public async Task<IActionResult> GetUserEvents(int userId)
        {
            if (!User.CanActFor(userId)) return Forbid();

            var userExists = await _context.Users.AnyAsync(u => u.Id == userId);
            if (!userExists) return NotFound("User not found.");

            var events = await _context.VehicleEvents
                .Where(e => e.AppUserId == userId)
                .OrderByDescending(e => e.Timestamp)
                .ToListAsync();

            // כל התרגומים בשאילתה אחת
            var codes = events.Select(e => e.RawErrorCode).Distinct().ToList();
            var dtcRows = await _context.DiagnosticCodes
                .Where(d => codes.Contains(d.ErrorCode))
                .ToListAsync();
            var dtcMap = dtcRows
                .DistinctBy(d => d.ErrorCode)
                .ToDictionary(d => d.ErrorCode);

            // הרכב של כל תקלה, כדי שהסבר ה-AI יתאים ליצרן
            var vehicleMap = await _context.Vehicles
                .Where(v => v.AppUserId == userId)
                .ToDictionaryAsync(v => v.Id);

            var enriched = events.Select(ev =>
            {
                dtcMap.TryGetValue(ev.RawErrorCode, out var dtc);
                var car = ev.VehicleId is int vid && vehicleMap.TryGetValue(vid, out var v) ? v : null;
                return new
                {
                    ev.Id,
                    ev.RawErrorCode,
                    ev.Timestamp,
                    ev.IsAcknowledged,
                    vehicle = car != null ? (object)new { car.Make, car.Model, car.Year } : null,
                    translation = dtc != null ? (object)new
                    {
                        dtc.HumanTitle,
                        dtc.Description,
                        dtc.Severity,
                        dtc.EstimatedCostMin,
                        dtc.EstimatedCostMax
                    } : null
                };
            }).ToList();

            return Ok(enriched);
        }
    }
}
