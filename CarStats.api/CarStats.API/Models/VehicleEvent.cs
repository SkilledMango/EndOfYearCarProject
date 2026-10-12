using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CarStats.API.Models
{
    // איתור: מודל אירוע תקלה (היסטוריה)
    public class VehicleEvent
    {
        [Key]
        public int Id { get; set; }

        public string RawErrorCode { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
        public bool IsAcknowledged { get; set; }

        // יכול להיות ריק: ההיסטוריה שורדת מחיקת רכב
        public int? VehicleId { get; set; }

        [ForeignKey("VehicleId")]
        public Vehicle? Vehicle { get; set; }

        public int? AppUserId { get; set; }

        [ForeignKey("AppUserId")]
        public AppUser? User { get; set; }
    }
}
