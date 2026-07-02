using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;
using CarStats.API.Models;
using CarStats.API.Services;

namespace CarStats.API.Controllers
{
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

    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private const int CodeLifetimeMinutes = 15;

        private readonly AppDbContext _context;
        private readonly IEmailService _email;

        public AuthController(AppDbContext context, IEmailService email)
        {
            _context = context;
            _email   = email;
        }

        // POST: api/auth/register
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.FullName) ||
                string.IsNullOrWhiteSpace(request.Email)    ||
                string.IsNullOrWhiteSpace(request.Password))
                return BadRequest("Full name, email and password are all required.");

            if (request.Password.Length < 6)
                return BadRequest("Password must be at least 6 characters.");

            if (!IsValidEmail(request.Email))
                return BadRequest("Please enter a valid email address.");

            var email = request.Email.ToLower().Trim();

            bool emailTaken = await _context.Users.AnyAsync(u => u.Email.ToLower() == email);
            if (emailTaken)
                return Conflict("An account with that email already exists.");

            // Create the new user — unverified until they confirm the emailed code.
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

            // Do NOT return a session — the client must verify the code first.
            newUser.PasswordHash          = string.Empty;
            newUser.EmailVerificationCode = null;
            return Ok(newUser);
        }

        // POST: api/auth/verify-code
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

            // Already verified — treat as success (idempotent), log them in.
            if (user.IsEmailVerified)
            {
                user.PasswordHash = string.Empty;
                return Ok(user);
            }

            if (user.VerificationCodeExpiresAt == null || user.VerificationCodeExpiresAt < DateTime.UtcNow)
                return BadRequest("That code has expired. Request a new one.");

            if (user.EmailVerificationCode != request.Code.Trim())
                return BadRequest("Incorrect code. Please check and try again.");

            // Success — mark verified and clear the code.
            user.IsEmailVerified           = true;
            user.EmailVerificationCode     = null;
            user.VerificationCodeExpiresAt = null;
            await _context.SaveChangesAsync();

            user.PasswordHash = string.Empty;
            return Ok(user);
        }

        // POST: api/auth/resend-code
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

            await IssueVerificationCodeAsync(user);
            return Ok(new { message = "A new code has been sent." });
        }

        // POST: api/auth/login
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

            // Block unverified accounts — resend a fresh code so they can finish.
            if (!user.IsEmailVerified)
            {
                await IssueVerificationCodeAsync(user);
                return StatusCode(StatusCodes.Status403Forbidden, new
                {
                    code  = "EMAIL_NOT_VERIFIED",
                    email = user.Email,
                });
            }

            user.PasswordHash = string.Empty;
            return Ok(user);
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        /// <summary>
        /// Generates a fresh verification code for the user, saves it, and
        /// emails it. Shared by register, resend-code, and unverified login.
        /// </summary>
        private async Task IssueVerificationCodeAsync(AppUser user)
        {
            user.EmailVerificationCode     = GenerateCode();
            user.VerificationCodeExpiresAt = DateTime.UtcNow.AddMinutes(CodeLifetimeMinutes);
            await _context.SaveChangesAsync();
            await _email.SendVerificationCodeAsync(user.Email, user.FullName, user.EmailVerificationCode!);
        }

        /// <summary>Random 6-digit numeric code, e.g. "048213".</summary>
        private static string GenerateCode() =>
            Random.Shared.Next(0, 1_000_000).ToString("D6");

        /// <summary>Basic email-format check using the framework's mail parser.</summary>
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
