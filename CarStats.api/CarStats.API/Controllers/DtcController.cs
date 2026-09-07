using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;
using CarStats.API.Models;

namespace CarStats.API.Controllers
{
    // מילון קודי התקלה: קריאה למשתמש מחובר, עריכה למנהלים בלבד
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class DtcController : ControllerBase
    {
        private readonly AppDbContext _context;

        // הזרקת החיבור לבסיס הנתונים
        public DtcController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/dtc — מחזיר את כל המילון. משמש גם את האפליקציה וגם את פאנל הניהול
        [HttpGet]
        public async Task<ActionResult<IEnumerable<DiagnosticCode>>> GetDiagnosticCodes()
        {
            return await _context.DiagnosticCodes.ToListAsync();
        }

        // POST: api/dtc — הוספת קוד חדש למילון מפאנל הניהול
        [HttpPost]
        [Authorize(Policy = "AdminOnly")]
        public async Task<ActionResult<DiagnosticCode>> PostDiagnosticCode(DiagnosticCode diagnosticCode)
        {
            _context.DiagnosticCodes.Add(diagnosticCode);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetDiagnosticCodes), new { id = diagnosticCode.Id }, diagnosticCode);
        }

        // DELETE: api/dtc/{id} — מחיקת קוד מהמילון
        [HttpDelete("{id}")]
        [Authorize(Policy = "AdminOnly")]
        public async Task<IActionResult> DeleteDtc(int id)
        {
            var dtc = await _context.DiagnosticCodes.FindAsync(id);
            if (dtc == null) return NotFound();

            _context.DiagnosticCodes.Remove(dtc);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}
