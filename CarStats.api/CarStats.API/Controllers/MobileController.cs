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
        private readonly AppDbContext _context;

        public MobileController(AppDbContext context)
        {
            _context = context;
        }

        // POST: api/mobile/report-dtc
        // The mobile app calls this when it detects an error code via Bluetooth OBD-II
        [HttpPost("report-dtc")]
        public async Task<IActionResult> ReportDtc([FromBody] ReportDtcRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.RawCode))
                return BadRequest("Error code cannot be empty.");

            // Events are always logged under the CALLER's identity — a client
            // can't spoof someone else's UserId (admins may, for testing).
            if (!User.IsAdmin())
                request.UserId = User.GetUserId();

            // Validate FK references — silently clear them if they don't exist
            // so a missing user never causes a 500 crash
            if (request.UserId.HasValue &&
                !await _context.Users.AnyAsync(u => u.Id == request.UserId.Value))
                request.UserId = null;

            // The vehicle must exist AND belong to the user the event is logged under
            if (request.VehicleId.HasValue &&
                !await _context.Vehicles.AnyAsync(v =>
                    v.Id == request.VehicleId.Value && v.AppUserId == request.UserId))
                request.VehicleId = null;

            // 1. Log the raw event, linking it to the user and specific vehicle
            var newEvent = new VehicleEvent
            {
                RawErrorCode = request.RawCode.ToUpper(),
                Timestamp = DateTime.UtcNow,
                AppUserId = request.UserId,
                VehicleId = request.VehicleId
            };
            _context.VehicleEvents.Add(newEvent);

            // Keep the user's lifetime fault counter in sync
            if (request.UserId.HasValue)
            {
                var user = await _context.Users.FindAsync(request.UserId.Value);
                if (user != null) user.TotalFaultsLogged++;
            }

            await _context.SaveChangesAsync();

            // 2. Look up the human-readable translation from the dictionary
            var translation = await _context.DiagnosticCodes
                .FirstOrDefaultAsync(d => d.ErrorCode == newEvent.RawErrorCode);

            // 3. If we don't have a translation yet, return a generic yellow warning
            if (translation == null)
            {
                return Ok(new
                {
                    status = "Logged",
                    message = $"Code {newEvent.RawErrorCode} detected. Please contact support or check the manual.",
                    severity = 2
                });
            }

            // 4. Return the human-readable translation back to the mobile app
            return Ok(new
            {
                status = "Logged",
                translation
            });
        }

        // GET: api/mobile/events/{userId}
        // Returns a user's full vehicle event history, enriched with DTC translations
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

            // Load all referenced DTC translations in ONE query, then join in
            // memory. (Task.WhenAll over the same DbContext is not thread-safe
            // and the previous version also caused an N+1 query per event.)
            var codes = events.Select(e => e.RawErrorCode).Distinct().ToList();
            var dtcRows = await _context.DiagnosticCodes
                .Where(d => codes.Contains(d.ErrorCode))
                .ToListAsync();
            // DistinctBy guards against duplicate ErrorCode rows in the
            // dictionary table; keeps the first match per code like before.
            var dtcMap = dtcRows
                .DistinctBy(d => d.ErrorCode)
                .ToDictionary(d => d.ErrorCode);

            var enriched = events.Select(ev =>
            {
                dtcMap.TryGetValue(ev.RawErrorCode, out var dtc);
                return new
                {
                    ev.Id,
                    ev.RawErrorCode,
                    ev.Timestamp,
                    ev.IsAcknowledged,
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