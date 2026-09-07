using System.Security.Claims;
using CarStats.API.Models;

namespace CarStats.API.Services
{
    /// <summary>
    /// קורא את זהות המשתמש מתוך הטוקן המאומת.
    /// זו בדיקת ההרשאות של כל הבקרים: "האם הרכב הזה באמת שלי?".
    /// </summary>
    public static class CallerExtensions
    {
        /// <summary>מזהה המשתמש הקורא, או null אם התביעה חסרה או פגומה.</summary>
        public static int? GetUserId(this ClaimsPrincipal caller) =>
            int.TryParse(caller.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

        /// <summary>אמת עבור מנהל ומנהל-על.</summary>
        public static bool IsAdmin(this ClaimsPrincipal caller)
        {
            var role = caller.FindFirstValue(ClaimTypes.Role);
            return role == nameof(UserRole.Admin) || role == nameof(UserRole.SuperAdmin);
        }

        /// <summary>אמת כשהקורא הוא המשתמש עצמו, או מנהל שפועל בשמו.</summary>
        public static bool CanActFor(this ClaimsPrincipal caller, int userId) =>
            caller.IsAdmin() || caller.GetUserId() == userId;
    }
}
