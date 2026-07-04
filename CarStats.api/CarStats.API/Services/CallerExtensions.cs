using System.Security.Claims;
using CarStats.API.Models;

namespace CarStats.API.Services
{
    /// <summary>
    /// Reads the calling user's identity out of the validated JWT claims.
    /// Used by controllers for ownership checks ("is this my vehicle?").
    /// </summary>
    public static class CallerExtensions
    {
        /// <summary>The caller's user id, or null if the claim is missing/malformed.</summary>
        public static int? GetUserId(this ClaimsPrincipal caller) =>
            int.TryParse(caller.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

        /// <summary>True for Admin and SuperAdmin roles.</summary>
        public static bool IsAdmin(this ClaimsPrincipal caller)
        {
            var role = caller.FindFirstValue(ClaimTypes.Role);
            return role == nameof(UserRole.Admin) || role == nameof(UserRole.SuperAdmin);
        }

        /// <summary>True when the caller is the given user, or an admin acting on their behalf.</summary>
        public static bool CanActFor(this ClaimsPrincipal caller, int userId) =>
            caller.IsAdmin() || caller.GetUserId() == userId;
    }
}
