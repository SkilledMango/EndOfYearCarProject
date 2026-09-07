using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace CarStats.API.Models
{
    // רמות ההרשאה במערכת
    public enum UserRole
    {
        User = 1,       // נהג רגיל
        Admin = 2,      // מנהל: מילון התקלות והמוסכים
        SuperAdmin = 3  // גישה מלאה, כולל ניהול משתמשים
    }

    // טבלת המשתמשים
    public class AppUser
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(100)]
        public string FullName { get; set; } = string.Empty;

        [Required]
        public string Email { get; set; } = string.Empty;

        // הגיבוב לעולם לא מוחזר ללקוח. סיסמה נכנסת רק דרך NewPassword.
        [JsonIgnore]
        public string PasswordHash { get; set; } = string.Empty;

        // לא נשמר בבסיס הנתונים: תיבת קלט זמנית לסיסמה שתגובב ותימחק
        [NotMapped]
        public string? NewPassword { get; set; }

        public UserRole Role { get; set; } = UserRole.User;

        // מתמלא מספירה על טבלת האירועים בכל קריאת פרופיל, ולא נקרא מהעמודה
        // הזו. הערך השמור נשאר מהתקופה שבה זה היה מונה, והוא כבר לא הקובע.
        public int TotalFaultsLogged { get; set; } = 0;
        public bool IsPremiumMember { get; set; } = false;

        // --- אימות מייל ---
        public bool IsEmailVerified { get; set; } = false;

        // הקוד הפעיל חייב להישאר בשרת: אם הוא היה מוחזר בתשובת API,
        // אפשר היה לקרוא אותו ולעקוף את כל תהליך האימות
        [JsonIgnore]
        [MaxLength(6)]
        public string? EmailVerificationCode { get; set; }

        [JsonIgnore]
        public DateTime? VerificationCodeExpiresAt { get; set; }

        /// <summary>
        /// ניחושים שגויים מול הקוד הנוכחי. קוד בן שש ספרות הוא מיליון
        /// אפשרויות בלבד, ולכן בלי הגבלה אפשר פשוט לנסות עד שמצליחים.
        /// מתאפס בכל פעם שמונפק קוד חדש.
        /// </summary>
        [JsonIgnore]
        public int VerificationAttempts { get; set; } = 0;

        // --- קשרים לטבלאות אחרות ---
        public List<Vehicle> Vehicles { get; set; } = new();
        public List<DiagnosticCode> SavedCodes { get; set; } = new();
        public List<VehicleEvent> VehicleEvents { get; set; } = new();
    }
}
