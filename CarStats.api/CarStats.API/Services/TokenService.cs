using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using CarStats.API.Models;
using Microsoft.IdentityModel.Tokens;

namespace CarStats.API.Services
{
    public interface ITokenService
    {
        /// <summary>מייצר טוקן חתום לסשן של משתמש מאומת.</summary>
        string CreateToken(AppUser user);
    }

    /// <summary>
    /// מנפיק טוקני JWT חתומים בשיטת HS256, הנושאים את מזהה המשתמש,
    /// המייל והתפקיד. מפתח החתימה מגיע מהקונפיגורציה בלבד.
    /// </summary>
    public class TokenService : ITokenService
    {
        public const string Issuer   = "CarStats.API";
        public const string Audience = "CarStats.Clients";

        // סשן ארוך במכוון: זו אפליקציית טלפון, והתחברות תכופה מחדש
        // דרך קוד במייל הייתה מזיקה יותר ממה שהיא מגינה
        private const int LifetimeDays = 30;

        private readonly SymmetricSecurityKey _key;

        public TokenService(IConfiguration config, IWebHostEnvironment env)
        {
            _key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(GetKeyMaterial(config, env)));
        }

        /// <summary>
        /// משותפת ליצירת הטוקן כאן ולאימות שלו ב-Program.cs,
        /// כדי ששני הצדדים ישתמשו תמיד באותו מפתח.
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

            // בסביבת Production זורקים שגיאה במקום ליפול למפתח ידוע:
            // עדיף ששרת לא יעלה מאשר שינפיק בשקט טוקנים שאפשר לזייף
            if (!env.IsDevelopment())
                throw new InvalidOperationException(
                    "Jwt:Key is not configured. Set it in appsettings.Production.json.");

            return "carstats-local-development-signing-key-not-for-production";
        }

        // הרכבת הטוקן: מזהה, מייל ותפקיד, עם חתימה ותאריך תפוגה
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
