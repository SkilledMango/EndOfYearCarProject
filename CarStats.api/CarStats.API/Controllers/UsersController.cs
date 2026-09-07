using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;
using CarStats.API.Models;
using CarStats.API.Services;

namespace CarStats.API.Controllers
{
    // ניהול משתמשים לפאנל הניהול, חוץ מ-GetUser שכל משתמש מחובר רשאי לקרוא
    // על עצמו. ההרשאה מוגדרת לכל פעולה בנפרד ולא על הבקר כולו, אחרת גם
    // קריאת פרופיל הייתה נחסמת למנהלים בלבד.
    [Route("api/[controller]")]
    [ApiController]
    public class UsersController : ControllerBase
    {
        private readonly AppDbContext _context;

        public UsersController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/users — כל המשתמשים והרכבים שלהם, לפאנל הניהול
        [HttpGet]
        [Authorize(Policy = "AdminOnly")]
        public async Task<ActionResult<IEnumerable<AppUser>>> GetUsers()
        {
            var users = await _context.Users
                .Include(u => u.Vehicles)
                .ToListAsync();

            // ספירת התקלות מחושבת בשאילתה מקובצת אחת, באותה דרך כמו ב-GetUser,
            // כדי שהפאנל והאפליקציה לא יציגו מספרים שונים
            var faultCounts = await _context.VehicleEvents
                .Where(e => e.AppUserId != null)
                .GroupBy(e => e.AppUserId!.Value)
                .Select(g => new { UserId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.UserId, x => x.Count);

            foreach (var u in users)
                u.TotalFaultsLogged = faultCounts.TryGetValue(u.Id, out var n) ? n : 0;

            return users;
        }

        // GET: api/users/{id} — פרופיל משתמש בודד לאפליקציה.
        // כל אחד רשאי לקרוא את עצמו, מנהל רשאי לקרוא כל אחד.
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

            // הספירה נעשית על האירועים עצמם ולא נקראת מהעמודה השמורה:
            // מונה שמור מאבד עדכונים כששולחים כמה קודים במקביל, ואחרי
            // שהוא שגוי הדדופליקציה מונעת ממנו לתקן את עצמו לנצח.
            user.TotalFaultsLogged = await _context.VehicleEvents
                .CountAsync(e => e.AppUserId == id);

            return user;
        }

        // POST: api/users — יצירת משתמש חדש מפאנל הניהול
        [HttpPost]
        [Authorize(Policy = "AdminOnly")]
        public async Task<ActionResult<AppUser>> CreateUser(AppUser newUser)
        {
            // אותו כלל ייחודיות כמו בהרשמה עצמית: שני חשבונות לאותו מייל
            // היו הופכים את חיפוש המשתמש בהתחברות לדו-משמעי
            newUser.Email = newUser.Email.ToLower().Trim();
            if (await _context.Users.AnyAsync(u => u.Email.ToLower() == newUser.Email))
                return Conflict("An account with that email already exists.");

            // הסיסמה מגובבת מיד לפני השמירה
            if (!string.IsNullOrEmpty(newUser.NewPassword))
            {
                if (!PasswordPolicy.IsAcceptable(newUser.NewPassword))
                    return BadRequest(PasswordPolicy.Requirements);

                newUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newUser.NewPassword);
            }
            else
            {
                // ברירת מחדל אם מנהל יצר חשבון בלי סיסמה. היא עומדת בתנאי
                // המדיניות, ולכן אפשר להתחבר עם החשבון ולהחליף אותה אחר כך.
                newUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword("DefaultPass123!");
            }

            _context.Users.Add(newUser);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetUsers), new { id = newUser.Id }, newUser);
        }

        // PUT: api/users/{id} — עדכון פרטי משתמש ותפקיד
        [HttpPut("{id}")]
        [Authorize(Policy = "AdminOnly")]
        public async Task<IActionResult> UpdateUser(int id, AppUser updatedUser)
        {
            if (id != updatedUser.Id) return BadRequest();

            // 1. איתור המשתמש הקיים
            var existingUser = await _context.Users.FindAsync(id);
            if (existingUser == null) return NotFound();

            // שינוי מייל לא יכול להתנגש בחשבון אחר
            var newEmail = updatedUser.Email.ToLower().Trim();
            if (await _context.Users.AnyAsync(u => u.Id != id && u.Email.ToLower() == newEmail))
                return Conflict("Another account already uses that email.");

            // 2. עדכון השדות הרגילים
            existingUser.FullName = updatedUser.FullName;
            existingUser.Email = newEmail;
            existingUser.Role = updatedUser.Role;
            existingUser.TotalFaultsLogged = updatedUser.TotalFaultsLogged;
            existingUser.IsPremiumMember = updatedUser.IsPremiumMember;

            // 3. אם המנהל הזין סיסמה חדשה — היא נבדקת מול אותה מדיניות
            //    כמו בהרשמה, ונשמרת מגובבת בלבד
            if (!string.IsNullOrEmpty(updatedUser.NewPassword))
            {
                if (!PasswordPolicy.IsAcceptable(updatedUser.NewPassword))
                    return BadRequest(PasswordPolicy.Requirements);

                existingUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword(updatedUser.NewPassword);
            }

            await _context.SaveChangesAsync();
            return NoContent();
        }

        // DELETE: api/users/{id} — מחיקת משתמש. הרכבים והאירועים שלו נמחקים איתו.
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
