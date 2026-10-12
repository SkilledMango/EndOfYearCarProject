using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;
using CarStats.API.Models;

namespace CarStats.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class DtcController : ControllerBase
    {
        private readonly AppDbContext _context;

        public DtcController(AppDbContext context)
        {
            _context = context;
        }

        // איתור: שליפת מילון התקלות (שרת)
        [HttpGet]
        public async Task<ActionResult<IEnumerable<DiagnosticCode>>> GetDiagnosticCodes()
        {
            return await _context.DiagnosticCodes.ToListAsync();
        }

        // איתור: הוספת קוד תקלה למילון (שרת)
        [HttpPost]
        [Authorize(Policy = "AdminOnly")]
        public async Task<ActionResult<DiagnosticCode>> PostDiagnosticCode(DiagnosticCode diagnosticCode)
        {
            _context.DiagnosticCodes.Add(diagnosticCode);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetDiagnosticCodes), new { id = diagnosticCode.Id }, diagnosticCode);
        }

        // איתור: מחיקת קוד תקלה מהמילון (שרת)
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
