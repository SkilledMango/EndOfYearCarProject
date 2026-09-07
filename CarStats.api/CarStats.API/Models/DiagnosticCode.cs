using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CarStats.API.Models
{
    // דירוג חומרת התקלה, כפי שהוא מוצג לנהג
    public enum SeverityLevel
    {
        Green = 1,  // תקין או לידיעה בלבד
        Yellow = 2, // אזהרה, כדאי לבדוק בקרוב
        Red = 3     // קריטי, לעצור בבטחה
    }

    // מילון התקלות: קוד אחד ומה שהנהג צריך לדעת עליו
    public class DiagnosticCode
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(10)]
        public string ErrorCode { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string HumanTitle { get; set; } = string.Empty;

        [Required]
        public string Description { get; set; } = string.Empty;

        [Required]
        public SeverityLevel Severity { get; set; }

        public string ActionRequired { get; set; } = string.Empty;

        // טווח מחיר התיקון בשקלים. נשמר כ-decimal ולא כמספר עשרוני רגיל, כי זה כסף.
        [Column(TypeName = "decimal(18,2)")]
        public decimal EstimatedCostMin { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal EstimatedCostMax { get; set; }

        // ריק עבור קודי המילון הכללי; מאוכלס רק בקוד ששמור למשתמש מסוים
        public int? AppUserId { get; set; }

        [ForeignKey("AppUserId")]
        public AppUser? User { get; set; }
    }
}
