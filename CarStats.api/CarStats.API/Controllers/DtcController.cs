using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;
using CarStats.API.Models;

namespace CarStats.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class DtcController : ControllerBase
    {
        private readonly AppDbContext _context;

        // This injects our database connection into the controller
        public DtcController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/dtc
        // This will be used by both the Admin Panel and the Mobile App to load the dictionary
        [HttpGet]
        public async Task<ActionResult<IEnumerable<DiagnosticCode>>> GetDiagnosticCodes()
        {
            return await _context.DiagnosticCodes.ToListAsync();
        }

        // POST: api/dtc
        // This will be used by the Super Admin Panel to add new codes to the database
        [HttpPost]
        public async Task<ActionResult<DiagnosticCode>> PostDiagnosticCode(DiagnosticCode diagnosticCode)
        {
            _context.DiagnosticCodes.Add(diagnosticCode);
            await _context.SaveChangesAsync();

            // Returns a 201 Created success status
            return CreatedAtAction(nameof(GetDiagnosticCodes), new { id = diagnosticCode.Id }, diagnosticCode);
        }
    }
}