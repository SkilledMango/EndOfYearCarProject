using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

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

        public string PasswordHash { get; set; } = string.Empty;

        [NotMapped]
        public string? NewPassword { get; set; }

        public UserRole Role { get; set; } = UserRole.User;

        public int TotalFaultsLogged { get; set; } = 0;
        public bool IsPremiumMember { get; set; } = false;

        // --- RELATIONSHIPS ---
        public List<Vehicle> Vehicles { get; set; } = new();
        public List<DiagnosticCode> SavedCodes { get; set; } = new();
        public List<VehicleEvent> VehicleEvents { get; set; } = new();
    }
}