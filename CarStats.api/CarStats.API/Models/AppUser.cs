using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace CarStats.API.Models
{
    public enum UserRole
    {
        User = 1,       // Standard driver account
        Admin = 2,      // Can manage DTC dictionary and shops
        SuperAdmin = 3  // Full access including user management
    }

    public class AppUser
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(100)]
        public string FullName { get; set; } = string.Empty;

        [Required]
        public string Email { get; set; } = string.Empty;

        // Never serialized to clients — write-only via NewPassword + BCrypt.
        [JsonIgnore]
        public string PasswordHash { get; set; } = string.Empty;

        [NotMapped]
        public string? NewPassword { get; set; }

        public UserRole Role { get; set; } = UserRole.User;

        // Filled in from a COUNT over VehicleEvents whenever a profile is read,
        // not from this column. The stored value is left over from when it was
        // a running total and is no longer authoritative; dropping it needs a
        // migration, so it stays until one is convenient.
        public int TotalFaultsLogged { get; set; } = 0;
        public bool IsPremiumMember { get; set; } = false;

        // --- EMAIL VERIFICATION ---
        public bool IsEmailVerified { get; set; } = false;

        // The active code must never reach any client — otherwise verification
        // could be bypassed by reading it from the users endpoint.
        [JsonIgnore]
        [MaxLength(6)]
        public string? EmailVerificationCode { get; set; }

        [JsonIgnore]
        public DateTime? VerificationCodeExpiresAt { get; set; }

        /// <summary>
        /// Wrong codes entered against the current code. A six-digit code is
        /// only a million guesses, so without a cap it can simply be tried
        /// until it hits. Reset whenever a new code is issued.
        /// </summary>
        [JsonIgnore]
        public int VerificationAttempts { get; set; } = 0;

        // --- RELATIONSHIPS ---
        public List<Vehicle> Vehicles { get; set; } = new();
        public List<DiagnosticCode> SavedCodes { get; set; } = new();
        public List<VehicleEvent> VehicleEvents { get; set; } = new();
    }
}