using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CarStats.API.Models
{
    public class VehicleEvent
    {
        [Key]
        public int Id { get; set; }

        public string VehicleId { get; set; } = string.Empty;
        public string RawErrorCode { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
        public bool IsAcknowledged { get; set; }

        // --- ADD THESE TWO LINES ---
        public int? AppUserId { get; set; }

        [ForeignKey("AppUserId")]
        public AppUser? User { get; set; } // This is the "User" property the error was complaining about!
    }
}