using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;
using CarStats.API.Models;
using CarStats.API.Services;

namespace CarStats.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize] // signed-in users only — and each action checks the garage is theirs
    public class VehiclesController : ControllerBase
    {
        private readonly AppDbContext _context;

        public VehiclesController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/vehicles/user/{userId}
        // Returns all vehicles belonging to a specific user
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

        // POST: api/vehicles
        // Add a new vehicle to a user's garage
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

        // PUT: api/vehicles/{id}
        // Update a vehicle's details (model year, plate, fuel average, etc.)
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

        // DELETE: api/vehicles/{id}
        // Remove a vehicle from a user's garage
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteVehicle(int id)
        {
            var vehicle = await _context.Vehicles.FindAsync(id);
            if (vehicle == null) return NotFound();
            if (!User.CanActFor(vehicle.AppUserId)) return Forbid();

            // Release the fault history first.
            //
            // The relationship is configured ClientSetNull, which only rewrites
            // events EF is already tracking — and none are loaded here. Without
            // this the database receives a bare DELETE against rows that still
            // reference the vehicle and rejects it on the foreign key, so any
            // car that has ever logged a fault could not be removed at all.
            //
            // Nulling rather than deleting is deliberate: the events belong to
            // the user's history and stay in it after the car is gone.
            await _context.VehicleEvents
                .Where(e => e.VehicleId == id)
                .ExecuteUpdateAsync(s => s.SetProperty(e => e.VehicleId, (int?)null));

            _context.Vehicles.Remove(vehicle);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}
