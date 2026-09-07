using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;
using CarStats.API.Models;
using CarStats.API.Services;

namespace CarStats.API.Controllers
{
    // מבני הבקשות שמגיעות מהאפליקציה
    public class LoginRequest
    {
        public string Email    { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class RegisterRequest
    {
        public string FullName { get; set; } = string.Empty;
        public string Email    { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class VerifyCodeRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Code  { get; set; } = string.Empty;
    }

    public class ResendCodeRequest
    {
        public string Email { get; set; } = string.Empty;
    }

    // הרשמה, אימות מייל והתחברות.
    // הבקר היחיד שפתוח בלי טוקן — כי הוא זה שמחלק אותם.
    [Route("api/[controller]")]
    [ApiController]
    [AllowAnonymous]
    public class AuthController : ControllerBase
    {
        private const int CodeLifetimeMinutes = 15;

        /// <summary>כמה ניחושים שגויים מותרים לפני שצריך לבקש קוד חדש.</summary>
        private const int MaxVerificationAttempts = 5;

        /// <summary>המרווח המינימלי בין שני מיילי אימות לאותו חשבון.</summary>
        private static readonly TimeSpan ResendCooldown = TimeSpan.FromSeconds(60);

        private readonly AppDbContext _context;
        private readonly IEmailService _email;
        private readonly ITokenService _tokens;

        public AuthController(AppDbContext context, IEmailService email, ITokenService tokens)
        {
            _context = context;
            _email   = email;
            _tokens  = tokens;
        }

        /// <summary>התשובה האחידה של login ו-verify-code: הטוקן והמשתמש שלו.</summary>
        private IActionResult Session(AppUser user)
        {
            user.PasswordHash = string.Empty;
            return Ok(new { token = _tokens.CreateToken(user), user });
        }

        // POST: api/auth/register — יוצר משתמש חדש ושולח לו קוד אימות
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest request)
        {
            // בדיקות קלט: שדות חובה, חוזק סיסמה ותקינות מייל
            if (string.IsNullOrWhiteSpace(request.FullName) ||
                string.IsNullOrWhiteSpace(request.Email)    ||
                string.IsNullOrWhiteSpace(request.Password))
                return BadRequest("Full name, email and password are all required.");

            if (!PasswordPolicy.IsAcceptable(request.Password))
                return BadRequest(PasswordPolicy.Requirements);

            if (!IsValidEmail(request.Email))
                return BadRequest("Please enter a valid email address.");

            var email = request.Email.ToLower().Trim();

            bool emailTaken = await _context.Users.AnyAsync(u => u.Email.ToLower() == email);
            if (emailTaken)
                return Conflict("An account with that email already exists.");

            // המשתמש נוצר לא מאומת, והסיסמה נשמרת מגובבת ב-BCrypt
            var newUser = new AppUser
            {
                FullName        = request.FullName.Trim(),
                Email           = email,
                PasswordHash    = BCrypt.Net.BCrypt.HashPassword(request.Password),
                Role            = UserRole.User,
                IsEmailVerified = false,
            };
            _context.Users.Add(newUser);

            await IssueVerificationCodeAsync(newUser);

            // לא מוחזר טוקן: קודם צריך לאמת את הקוד
            newUser.PasswordHash          = string.Empty;
            newUser.EmailVerificationCode = null;
            return Ok(newUser);
        }

        // POST: api/auth/verify-code — מאמת את הקוד שנשלח במייל ופותח סשן
        [HttpPost("verify-code")]
        public async Task<IActionResult> VerifyCode([FromBody] VerifyCodeRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Code))
                return BadRequest("Email and code are required.");

            var email = request.Email.ToLower().Trim();
            var user  = await _context.Users
                .Include(u => u.Vehicles)
                .FirstOrDefaultAsync(u => u.Email.ToLower() == email);

            if (user == null)
                return NotFound("No account found for that email.");

            // חשבון שכבר אומת לא מקבל כאן טוקן — אחרת אפשר היה להתחבר
            // לכל חשבון מאומת בלי סיסמה, רק לפי כתובת המייל
            if (user.IsEmailVerified)
                return BadRequest("This email is already verified. Please log in with your password.");

            if (user.VerificationCodeExpiresAt == null || user.VerificationCodeExpiresAt < DateTime.UtcNow)
                return BadRequest("That code has expired. Request a new one.");

            // הגבלת ניחושים: קוד בן שש ספרות הוא מיליון אפשרויות בלבד
            if (user.VerificationAttempts >= MaxVerificationAttempts)
                return BadRequest("Too many incorrect codes. Request a new one.");

            if (user.EmailVerificationCode != request.Code.Trim())
            {
                user.VerificationAttempts++;
                await _context.SaveChangesAsync();
                return BadRequest("Incorrect code. Please check and try again.");
            }

            // הצליח: מסמנים כמאומת ומוחקים את הקוד
            user.IsEmailVerified           = true;
            user.EmailVerificationCode     = null;
            user.VerificationCodeExpiresAt = null;
            user.VerificationAttempts      = 0;
            await _context.SaveChangesAsync();

            return Session(user);
        }

        // POST: api/auth/resend-code — שולח קוד חדש למשתמש שעדיין לא אומת
        [HttpPost("resend-code")]
        public async Task<IActionResult> ResendCode([FromBody] ResendCodeRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Email))
                return BadRequest("Email is required.");

            var email = request.Email.ToLower().Trim();
            var user  = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email);

            if (user == null)
                return NotFound("No account found for that email.");

            if (user.IsEmailVerified)
                return BadRequest("This email is already verified.");

            // הגבלת קצב: הנקודה פתוחה לכולם ושולחת מייל אמיתי בכל קריאה.
            // זמן ההנפקה נגזר מזמן התפוגה, כדי לא לשמור עמודה נוספת.
            var issuedAt = user.VerificationCodeExpiresAt?.AddMinutes(-CodeLifetimeMinutes);
            if (issuedAt != null && DateTime.UtcNow - issuedAt < ResendCooldown)
                return BadRequest("A code was just sent. Please wait a minute before asking for another.");

            await IssueVerificationCodeAsync(user);
            return Ok(new { message = "A new code has been sent." });
        }

        // POST: api/auth/login — התחברות עם מייל וסיסמה
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Email) ||
                string.IsNullOrWhiteSpace(request.Password))
                return BadRequest("Email and password are required.");

            var user = await _context.Users
                .Include(u => u.Vehicles)
                .FirstOrDefaultAsync(u =>
                    u.Email.ToLower() == request.Email.ToLower().Trim());

            if (user == null)
                return Unauthorized("Invalid email or password.");

            bool passwordValid = BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash);
            if (!passwordValid)
                return Unauthorized("Invalid email or password.");

            // חשבון לא מאומת חסום — ונשלח לו קוד חדש כדי שיוכל להשלים
            if (!user.IsEmailVerified)
            {
                await IssueVerificationCodeAsync(user);
                return StatusCode(StatusCodes.Status403Forbidden, new
                {
                    code  = "EMAIL_NOT_VERIFIED",
                    email = user.Email,
                });
            }

            return Session(user);
        }

        // ── פונקציות עזר ──────────────────────────────────────────────────────

        /// <summary>
        /// מייצר קוד אימות חדש, שומר אותו ושולח אותו במייל.
        /// משותף להרשמה, לשליחה חוזרת ולהתחברות של חשבון לא מאומת.
        /// </summary>
        private async Task IssueVerificationCodeAsync(AppUser user)
        {
            user.EmailVerificationCode     = GenerateCode();
            user.VerificationCodeExpiresAt = DateTime.UtcNow.AddMinutes(CodeLifetimeMinutes);
            // קוד חדש מאפס את מונה הניחושים, אחרת משתמש חסום לא היה יכול להשתחרר
            user.VerificationAttempts      = 0;
            await _context.SaveChangesAsync();
            await _email.SendVerificationCodeAsync(user.Email, user.FullName, user.EmailVerificationCode!);
        }

        /// <summary>קוד אקראי בן שש ספרות, לדוגמה "048213".</summary>
        private static string GenerateCode() =>
            Random.Shared.Next(0, 1_000_000).ToString("D6");

        /// <summary>בדיקת תקינות כתובת מייל בעזרת המנתח של הפריימוורק.</summary>
        private static bool IsValidEmail(string email)
        {
            var trimmed = email.Trim();
            try
            {
                var addr = new System.Net.Mail.MailAddress(trimmed);
                return addr.Address == trimmed;
            }
            catch
            {
                return false;
            }
        }
    }
}
