using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;
using CarStats.API.Models;

namespace CarStats.API.Controllers
{
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
        // The mobile app calls this when it finds an error code via Bluetooth
        [HttpPost("report-dtc")]
        public async Task<IActionResult> ReportDtc([FromBody] string rawCode)
        {
            if (string.IsNullOrWhiteSpace(rawCode))
            {
                return BadRequest("Error code cannot be empty.");
            }

            // 1. Log the event in the database
            var newEvent = new VehicleEvent
            {
                RawErrorCode = rawCode.ToUpper()
            };
            _context.VehicleEvents.Add(newEvent);
            await _context.SaveChangesAsync();

            // 2. Look up the human-readable translation from the dictionary
            var translation = await _context.DiagnosticCodes
                .FirstOrDefaultAsync(d => d.ErrorCode == newEvent.RawErrorCode);

            // 3. If we don't have a translation yet, return a generic warning
            if (translation == null)
            {
                return Ok(new
                {
                    status = "Logged",
                    message = $"Code {newEvent.RawErrorCode} detected. Please contact support or check the manual.",
                    severity = 2 // Default to yellow warning if unknown
                });
            }

            // 4. Return the beautifully translated, human-readable data back to the mobile app
            return Ok(new
            {
                status = "Logged",
                translation = translation
            });
        }
    }
}