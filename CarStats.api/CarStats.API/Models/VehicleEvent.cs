using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CarStats.API.Models
{
    // תקלה בודדת שנרשמה בסריקה. הטבלה הזו היא המקור לספירת התקלות ולמסך ההיסטוריה.
    public class VehicleEvent
    {
        [Key]
        public int Id { get; set; }

        public string RawErrorCode { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
        public bool IsAcknowledged { get; set; }

        // הרכב שבו התגלתה התקלה. יכול להיות ריק — וזה בדיוק מה שמאפשר
        // להיסטוריה לשרוד אחרי שהמשתמש מוחק את הרכב.
        public int? VehicleId { get; set; }

        [ForeignKey("VehicleId")]
        public Vehicle? Vehicle { get; set; }

        // הבעלים. שמור גם ישירות כאן, כדי ש"כל התקלות שלי" תהיה שאילתה אחת.
        public int? AppUserId { get; set; }

        [ForeignKey("AppUserId")]
        public AppUser? User { get; set; }
    }
}
