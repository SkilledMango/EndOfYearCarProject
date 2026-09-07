using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;
using CarStats.API.Models;
using CarStats.API.Services;

namespace CarStats.API.Controllers
{
    // בקשת דיווח על קוד תקלה מהאפליקציה
    public class ReportDtcRequest
    {
        public string RawCode { get; set; } = string.Empty;
        public int? UserId { get; set; }
        public int? VehicleId { get; set; }
    }

    // המסלול המרכזי של האפליקציה: דיווח תקלות ושליפת ההיסטוריה
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class MobileController : ControllerBase
    {
        /// <summary>
        /// כמה זמן אותו קוד נחשב אותה תקלה מתמשכת ולא תקלה חדשה.
        /// רכב מדווח על תקלה פעילה מחדש בכל סריקה.
        /// </summary>
        private static readonly TimeSpan DuplicateFaultWindow = TimeSpan.FromHours(24);

        private readonly AppDbContext _context;

        public MobileController(AppDbContext context)
        {
            _context = context;
        }

        // POST: api/mobile/report-dtc — מקבל קוד מהסריקה, רושם אותו ומחזיר את התרגום
        [HttpPost("report-dtc")]
        public async Task<IActionResult> ReportDtc([FromBody] ReportDtcRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.RawCode))
                return BadRequest("Error code cannot be empty.");

            // האירוע נרשם תמיד על שם הקורא לפי הטוקן, כדי שלא יהיה אפשר
            // לרשום תקלות על חשבון של מישהו אחר. מנהל כן רשאי, לצורך בדיקות.
            if (!User.IsAdmin())
                request.UserId = User.GetUserId();

            // אימות המפתחות הזרים: מזהה שלא קיים מנוקה בשקט, כדי שלא ייפול השרת
            if (request.UserId.HasValue &&
                !await _context.Users.AnyAsync(u => u.Id == request.UserId.Value))
                request.UserId = null;

            // הרכב חייב להתקיים וגם להיות שייך לאותו משתמש
            if (request.VehicleId.HasValue &&
                !await _context.Vehicles.AnyAsync(v =>
                    v.Id == request.VehicleId.Value && v.AppUserId == request.UserId))
                request.VehicleId = null;

            var rawCode = request.RawCode.ToUpper();

            // 1. רישום האירוע, אלא אם אותה תקלה כבר נרשמה היום.
            //    תקלה מתמשכת היא תקלה אחת, גם אם בודקים אותה שלוש פעמים.
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

                // אין כאן מונה לעדכן: ספירת התקלות מחושבת מהשורות האלה
                // בזמן קריאת הפרופיל, ולכן שורת האירוע היא המקור היחיד לאמת.
            }

            // 2. שליפת התרגום מהמילון
            var translation = await _context.DiagnosticCodes
                .FirstOrDefaultAsync(d => d.ErrorCode == rawCode);

            // 3. קוד שאינו במילון מוחזר כאזהרה כללית, והאפליקציה תבקש הסבר מ-AI
            if (translation == null)
            {
                return Ok(new
                {
                    status = "Logged",
                    message = $"Code {rawCode} detected. Please contact support or check the manual.",
                    severity = 2
                });
            }

            // 4. החזרת התרגום המלא לאפליקציה
            return Ok(new
            {
                status = "Logged",
                translation
            });
        }

        // GET: api/mobile/events/{userId} — היסטוריית התקלות של המשתמש, כולל התרגומים
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

            // כל התרגומים נשלפים בשאילתה אחת ומחוברים בזיכרון,
            // במקום שאילתה נפרדת לכל אירוע
            var codes = events.Select(e => e.RawErrorCode).Distinct().ToList();
            var dtcRows = await _context.DiagnosticCodes
                .Where(d => codes.Contains(d.ErrorCode))
                .ToListAsync();
            // הגנה מפני קוד שמופיע פעמיים במילון: נלקחת ההופעה הראשונה
            var dtcMap = dtcRows
                .DistinctBy(d => d.ErrorCode)
                .ToDictionary(d => d.ErrorCode);

            // חיבור כל אירוע לתרגום שלו, אם קיים
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
