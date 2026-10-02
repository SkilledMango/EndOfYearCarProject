using System.ComponentModel.DataAnnotations;

namespace CarStats.API.Models
{
    // מטמון תשובות ה-AI. כל דגם רכב או קוד תקלה נשאל פעם אחת בלבד,
    // וכך המכסה החינמית לא נגמרת גם כשהרבה משתמשים פותחים את אותו מסך.
    public class AiCacheEntry
    {
        [Key]
        [MaxLength(200)]
        public string Key { get; set; } = string.Empty;   // למשל "specs:2020:toyota:corolla:"

        public string Value { get; set; } = string.Empty; // התשובה המעובדת, כ-JSON

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
