using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;
using CarStats.API.Models;
using CarStats.API.Services;

namespace CarStats.API.Controllers
{
    // המוסך של המשתמש. כל פעולה בודקת מחדש שהרכב באמת שלו.
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class VehiclesController : ControllerBase
    {
        private readonly AppDbContext _context;

        public VehiclesController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/vehicles/user/{userId} — כל הרכבים של משתמש מסוים
        [HttpGet("user/{userId}")]
        public async Task<ActionResult<IEnumerable<Vehicle>>> GetVehiclesForUser(int userId)
        {
            if (!User.CanActFor(userId)) return Forbid();

            var userExists = await _context.Users.AnyAsync(u => u.Id == userId);
            if (!userExists) return NotFound("User not found.");

            return await _context.Vehicles
                .Where(v => v.AppUserId == userId)
                .ToListAsync();
        }

        // POST: api/vehicles — הוספת רכב למוסך
        [HttpPost]
        public async Task<ActionResult<Vehicle>> AddVehicle(Vehicle newVehicle)
        {
            if (!User.CanActFor(newVehicle.AppUserId)) return Forbid();

            var userExists = await _context.Users.AnyAsync(u => u.Id == newVehicle.AppUserId);
            if (!userExists) return BadRequest("The specified user does not exist.");

            _context.Vehicles.Add(newVehicle);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetVehiclesForUser), new { userId = newVehicle.AppUserId }, newVehicle);
        }

        // PUT: api/vehicles/{id} — עדכון פרטי רכב: דגם, שנה, מספר רישוי וצריכה
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateVehicle(int id, Vehicle updatedVehicle)
        {
            if (id != updatedVehicle.Id) return BadRequest();

            var existing = await _context.Vehicles.FindAsync(id);
            if (existing == null) return NotFound();
            if (!User.CanActFor(existing.AppUserId)) return Forbid();

            existing.Make = updatedVehicle.Make;
            existing.Model = updatedVehicle.Model;
            existing.Year = updatedVehicle.Year;
            existing.LicensePlate = updatedVehicle.LicensePlate;
            existing.AverageFuelConsumption = updatedVehicle.AverageFuelConsumption;

            await _context.SaveChangesAsync();
            return NoContent();
        }

        // DELETE: api/vehicles/{id} — הסרת רכב מהמוסך
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteVehicle(int id)
        {
            var vehicle = await _context.Vehicles.FindAsync(id);
            if (vehicle == null) return NotFound();
            if (!User.CanActFor(vehicle.AppUserId)) return Forbid();

            // קודם מנתקים את היסטוריית התקלות מהרכב.
            // בלי זה בסיס הנתונים היה דוחה את המחיקה בגלל המפתח הזר,
            // ורכב שדיווח אי פעם על תקלה לא היה ניתן למחיקה בכלל.
            // מנתקים ולא מוחקים, כדי שההיסטוריה של הנהג תישאר גם אחרי מכירת הרכב.
            await _context.VehicleEvents
                .Where(e => e.VehicleId == id)
                .ExecuteUpdateAsync(s => s.SetProperty(e => e.VehicleId, (int?)null));

            _context.Vehicles.Remove(vehicle);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}
