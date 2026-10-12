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
    public class UsersController : ControllerBase
    {
        private readonly AppDbContext _context;

        public UsersController(AppDbContext context)
        {
            _context = context;
        }

        // איתור: ניהול משתמשים - רשימת המשתמשים (פאנל ניהול)
        [HttpGet]
        [Authorize(Policy = "AdminOnly")]
        public async Task<ActionResult<IEnumerable<AppUser>>> GetUsers()
        {
            var users = await _context.Users
                .Include(u => u.Vehicles)
                .ToListAsync();

            var faultCounts = await _context.VehicleEvents
                .Where(e => e.AppUserId != null)
                .GroupBy(e => e.AppUserId!.Value)
                .Select(g => new { UserId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.UserId, x => x.Count);

            foreach (var u in users)
                u.TotalFaultsLogged = faultCounts.TryGetValue(u.Id, out var n) ? n : 0;

            return users;
        }

        // איתור: פרטי משתמש ורכביו (מסך הבית באפליקציה)
        [HttpGet("{id}")]
        [Authorize]
        public async Task<ActionResult<AppUser>> GetUser(int id)
        {
            if (!User.CanActFor(id)) return Forbid();

            var user = await _context.Users
                .Include(u => u.Vehicles)
                .FirstOrDefaultAsync(u => u.Id == id);

            if (user == null) return NotFound();
            user.PasswordHash = string.Empty; // הגיבוב לעולם לא יוצא ללקוח

            // הספירה מהאירועים עצמם, לא מהעמודה השמורה
            user.TotalFaultsLogged = await _context.VehicleEvents
                .CountAsync(e => e.AppUserId == id);

            return user;
        }

        // איתור: יצירת משתמש על ידי מנהל
        [HttpPost]
        [Authorize(Policy = "AdminOnly")]
        public async Task<ActionResult<AppUser>> CreateUser(AppUser newUser)
        {
            // מייל ייחודי, כמו בהרשמה
            newUser.Email = newUser.Email.ToLower().Trim();
            if (await _context.Users.AnyAsync(u => u.Email.ToLower() == newUser.Email))
                return Conflict("An account with that email already exists.");

            if (!string.IsNullOrEmpty(newUser.NewPassword))
            {
                if (!PasswordPolicy.IsAcceptable(newUser.NewPassword))
                    return BadRequest(PasswordPolicy.Requirements);

                newUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newUser.NewPassword);
            }
            else
            {
                // סיסמת ברירת מחדל אם המנהל לא הזין
                newUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword("DefaultPass123!");
            }

            _context.Users.Add(newUser);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetUsers), new { id = newUser.Id }, newUser);
        }

        // איתור: עדכון משתמש
        [HttpPut("{id}")]
        [Authorize(Policy = "AdminOnly")]
        public async Task<IActionResult> UpdateUser(int id, AppUser updatedUser)
        {
            if (id != updatedUser.Id) return BadRequest();

            var existingUser = await _context.Users.FindAsync(id);
            if (existingUser == null) return NotFound();

            var newEmail = updatedUser.Email.ToLower().Trim();
            if (await _context.Users.AnyAsync(u => u.Id != id && u.Email.ToLower() == newEmail))
                return Conflict("Another account already uses that email.");

            existingUser.FullName = updatedUser.FullName;
            existingUser.Email = newEmail;
            existingUser.Role = updatedUser.Role;
            existingUser.TotalFaultsLogged = updatedUser.TotalFaultsLogged;
            existingUser.IsPremiumMember = updatedUser.IsPremiumMember;

            // סיסמה חדשה נבדקת ונשמרת מגובבת
            if (!string.IsNullOrEmpty(updatedUser.NewPassword))
            {
                if (!PasswordPolicy.IsAcceptable(updatedUser.NewPassword))
                    return BadRequest(PasswordPolicy.Requirements);

                existingUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword(updatedUser.NewPassword);
            }

            await _context.SaveChangesAsync();
            return NoContent();
        }

        // איתור: מחיקת משתמש
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
