using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;
using CarStats.API.Models;

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

    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _context;

        public AuthController(AppDbContext context)
        {
            _context = context;
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

            // Check email is not already taken
            bool emailTaken = await _context.Users
                .AnyAsync(u => u.Email.ToLower() == request.Email.ToLower().Trim());

            if (emailTaken)
                return Conflict("An account with that email already exists.");

            // Create the new user — always as a regular User, never Admin
            var newUser = new AppUser
            {
                FullName     = request.FullName.Trim(),
                Email        = request.Email.ToLower().Trim(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
                Role         = UserRole.User,
            };

            _context.Users.Add(newUser);
            await _context.SaveChangesAsync();

            // Return the created user (same shape as login response)
            newUser.PasswordHash = string.Empty;
            return Ok(newUser);
        }

        // POST: api/auth/login
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Email) ||
                string.IsNullOrWhiteSpace(request.Password))
                return BadRequest("Email and password are required.");

            // Find the user by email (case-insensitive)
            var user = await _context.Users
                .Include(u => u.Vehicles)
                .FirstOrDefaultAsync(u =>
                    u.Email.ToLower() == request.Email.ToLower().Trim());

            if (user == null)
                return Unauthorized("Invalid email or password.");

            // Verify the password against the stored BCrypt hash
            bool passwordValid = BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash);
            if (!passwordValid)
                return Unauthorized("Invalid email or password.");

            // Never send the password hash to the client
            user.PasswordHash = string.Empty;

            return Ok(user);
        }
    }
}
