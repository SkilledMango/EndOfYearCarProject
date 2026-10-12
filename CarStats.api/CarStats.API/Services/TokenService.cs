using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using CarStats.API.Models;
using Microsoft.IdentityModel.Tokens;

namespace CarStats.API.Services
{
    public interface ITokenService
    {
        string CreateToken(AppUser user);
    }

    public class TokenService : ITokenService
    {
        public const string Issuer   = "CarStats.API";
        public const string Audience = "CarStats.Clients";

        // סשן ארוך (30 יום) במכוון
        private const int LifetimeDays = 30;

        private readonly SymmetricSecurityKey _key;

        public TokenService(IConfiguration config, IWebHostEnvironment env)
        {
            _key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(GetKeyMaterial(config, env)));
        }

        public static string GetKeyMaterial(IConfiguration config, IWebHostEnvironment env)
        {
            var configured = config["Jwt:Key"];
            if (!string.IsNullOrWhiteSpace(configured))
            {
                if (configured.Length < 32)
                    throw new InvalidOperationException("Jwt:Key must be at least 32 characters for HS256.");
                return configured;
            }

            // בייצור בלי מפתח - השרת לא עולה
            if (!env.IsDevelopment())
                throw new InvalidOperationException(
                    "Jwt:Key is not configured. Set it in appsettings.Production.json.");

            return "carstats-local-development-signing-key-not-for-production";
        }

        // איתור: יצירת טוקן JWT
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
