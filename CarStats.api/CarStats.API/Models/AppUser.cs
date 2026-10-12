using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace CarStats.API.Models
{
    public enum UserRole
    {
        User = 1,       // נהג רגיל
        Admin = 2,      // מנהל: מילון התקלות והמוסכים
        SuperAdmin = 3  // גישה מלאה, כולל ניהול משתמשים
    }

    // איתור: מודל משתמש
    public class AppUser
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(100)]
        public string FullName { get; set; } = string.Empty;

        [Required]
        public string Email { get; set; } = string.Empty;

        // הגיבוב לעולם לא מוחזר ללקוח
        [JsonIgnore]
        public string PasswordHash { get; set; } = string.Empty;

        // סיסמה זמנית מהקלט, לא נשמרת
        [NotMapped]
        public string? NewPassword { get; set; }

        public UserRole Role { get; set; } = UserRole.User;

        // מחושב מטבלת האירועים בכל קריאת פרופיל
        public int TotalFaultsLogged { get; set; } = 0;
        public bool IsPremiumMember { get; set; } = false;

        public bool IsEmailVerified { get; set; } = false;

        // הקוד לא יוצא מהשרת
        [JsonIgnore]
        [MaxLength(6)]
        public string? EmailVerificationCode { get; set; }

        [JsonIgnore]
        public DateTime? VerificationCodeExpiresAt { get; set; }

        [JsonIgnore]
        public int VerificationAttempts { get; set; } = 0;

        public List<Vehicle> Vehicles { get; set; } = new();
        public List<DiagnosticCode> SavedCodes { get; set; } = new();
        public List<VehicleEvent> VehicleEvents { get; set; } = new();
    }
}
