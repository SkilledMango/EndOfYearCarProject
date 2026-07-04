using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;
using CarStats.API.Models;
using CarStats.API.Services;

namespace CarStats.API.Controllers
{
    // User management is admin-panel territory (each action carries AdminOnly),
    // except GetUser: any signed-in user may read their OWN profile. The gate
    // lives per-action because [Authorize] attributes stack — a controller-level
    // AdminOnly would apply to GetUser too, locking drivers out of their profile.
    [Route("api/[controller]")]
    [ApiController]
    public class UsersController : ControllerBase
    {
        private readonly AppDbContext _context;

        public UsersController(AppDbContext context)
        {
            _context = context;
        }

        // GET: Fetch all users (with their vehicles) for the admin panel
        [HttpGet]
        [Authorize(Policy = "AdminOnly")]
        public async Task<ActionResult<IEnumerable<AppUser>>> GetUsers()
        {
            return await _context.Users
                .Include(u => u.Vehicles)
                .ToListAsync();
        }

        // GET: Fetch a single user's profile (with vehicles) for the mobile app.
        // Any signed-in user may read their own; admins may read anyone's.
        [HttpGet("{id}")]
        [Authorize]
        public async Task<ActionResult<AppUser>> GetUser(int id)
        {
            if (!User.CanActFor(id)) return Forbid();

            var user = await _context.Users
                .Include(u => u.Vehicles)
                .FirstOrDefaultAsync(u => u.Id == id);

            if (user == null) return NotFound();
            user.PasswordHash = string.Empty; // never expose the hash to clients
            return user;
        }

        // POST: Create a brand new user
        [HttpPost]
        [Authorize(Policy = "AdminOnly")]
        public async Task<ActionResult<AppUser>> CreateUser(AppUser newUser)
        {
            // Secure the password immediately before saving
            if (!string.IsNullOrEmpty(newUser.NewPassword))
            {
                newUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newUser.NewPassword);
            }
            else
            {
                // Fallback if admin forgets to set a password during creation
                newUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword("DefaultPass123!");
            }

            _context.Users.Add(newUser);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetUsers), new { id = newUser.Id }, newUser);
        }

        // PUT: Edit a user's stats securely
        [HttpPut("{id}")]
        [Authorize(Policy = "AdminOnly")]
        public async Task<IActionResult> UpdateUser(int id, AppUser updatedUser)
        {
            if (id != updatedUser.Id) return BadRequest();

            // 1. Find the existing user in the database first
            var existingUser = await _context.Users.FindAsync(id);
            if (existingUser == null) return NotFound();

            // 2. Update the normal fields
            existingUser.FullName = updatedUser.FullName;
            existingUser.Email = updatedUser.Email;
            existingUser.Role = updatedUser.Role;
            existingUser.TotalFaultsLogged = updatedUser.TotalFaultsLogged;
            existingUser.IsPremiumMember = updatedUser.IsPremiumMember;

            // 3. THE SECURITY MAGIC: If the Admin typed a new password, hash it!
            if (!string.IsNullOrEmpty(updatedUser.NewPassword))
            {
                existingUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword(updatedUser.NewPassword);
            }

            await _context.SaveChangesAsync();
            return NoContent();
        }
        // DELETE: Remove a user
        [HttpDelete("{id}")]
        [Authorize(Policy = "AdminOnly")]
        public async Task<IActionResult> DeleteUser(int id)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null) return NotFound();

            _context.Users.Remove(user);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}