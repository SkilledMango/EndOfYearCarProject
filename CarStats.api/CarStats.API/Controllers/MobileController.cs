using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;
using CarStats.API.Models;

namespace CarStats.API.Controllers
{
    public class ReportDtcRequest
    {
        public string RawCode { get; set; } = string.Empty;
        public int? UserId { get; set; }
    }

    [Route("api/[controller]")]
    [ApiController]
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

            // 1. Log the raw event, linking it to the user if provided
            var newEvent = new VehicleEvent
            {
                RawErrorCode = request.RawCode.ToUpper(),
                Timestamp = DateTime.UtcNow,
                AppUserId = request.UserId
            };
            _context.VehicleEvents.Add(newEvent);
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
            var userExists = await _context.Users.AnyAsync(u => u.Id == userId);
            if (!userExists) return NotFound("User not found.");

            var events = await _context.VehicleEvents
                .Where(e => e.AppUserId == userId)
                .OrderByDescending(e => e.Timestamp)
                .ToListAsync();

            var enriched = await Task.WhenAll(events.Select(async ev =>
            {
                var dtc = await _context.DiagnosticCodes
                    .FirstOrDefaultAsync(d => d.ErrorCode == ev.RawErrorCode);

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
            }));

            return Ok(enriched);
        }
    }
}