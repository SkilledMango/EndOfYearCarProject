using System.Security.Claims;
using CarStats.API.Models;

namespace CarStats.API.Services
{
    // איתור: בדיקת הרשאות - האם המשתמש הוא הבעלים או מנהל
    public static class CallerExtensions
    {
        public static int? GetUserId(this ClaimsPrincipal caller) =>
            int.TryParse(caller.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

        public static bool IsAdmin(this ClaimsPrincipal caller)
        {
            var role = caller.FindFirstValue(ClaimTypes.Role);
            return role == nameof(UserRole.Admin) || role == nameof(UserRole.SuperAdmin);
        }

        public static bool CanActFor(this ClaimsPrincipal caller, int userId) =>
            caller.IsAdmin() || caller.GetUserId() == userId;
    }
}
