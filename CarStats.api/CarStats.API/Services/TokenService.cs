using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using CarStats.API.Models;
using Microsoft.IdentityModel.Tokens;

namespace CarStats.API.Services
{
    public interface ITokenService
    {
        /// <summary>Creates a signed JWT for a verified user session.</summary>
        string CreateToken(AppUser user);
    }

    /// <summary>
    /// Issues HS256-signed JWTs carrying the user's id, email and role.
    /// The signing key comes from configuration ("Jwt:Key") — a strong random
    /// value in the gitignored appsettings.Production.json for prod, and a
    /// fixed dev-only value for local development.
    /// </summary>
    public class TokenService : ITokenService
    {
        public const string Issuer   = "CarStats.API";
        public const string Audience = "CarStats.Clients";

        // Long-lived sessions: this is a phone app, forcing frequent re-login
        // (with an emailed code round-trip) would hurt more than it protects.
        private const int LifetimeDays = 30;

        private readonly SymmetricSecurityKey _key;

        public TokenService(IConfiguration config, IWebHostEnvironment env)
        {
            _key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(GetKeyMaterial(config, env)));
        }

        /// <summary>
        /// Shared by token creation (here) and token validation (Program.cs)
        /// so both sides always use the same key.
        /// </summary>
        public static string GetKeyMaterial(IConfiguration config, IWebHostEnvironment env)
        {
            var configured = config["Jwt:Key"];
            if (!string.IsNullOrWhiteSpace(configured))
            {
                if (configured.Length < 32)
                    throw new InvalidOperationException("Jwt:Key must be at least 32 characters for HS256.");
                return configured;
            }

            // Never fall back to a known key in production — fail loudly instead
            // of silently issuing forgeable tokens.
            if (!env.IsDevelopment())
                throw new InvalidOperationException(
                    "Jwt:Key is not configured. Set it in appsettings.Production.json.");

            return "carstats-local-development-signing-key-not-for-production";
        }

        public string CreateToken(AppUser user)
        {
            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new(ClaimTypes.Email,          user.Email),
                new(ClaimTypes.Role,           user.Role.ToString()),
            };

            var token = new JwtSecurityToken(
                issuer:             Issuer,
                audience:           Audience,
                claims:             claims,
                expires:            DateTime.UtcNow.AddDays(LifetimeDays),
                signingCredentials: new SigningCredentials(_key, SecurityAlgorithms.HmacSha256));

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
