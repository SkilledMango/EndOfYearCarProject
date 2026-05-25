using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CarStats.API.Models
{
    public class VehicleEvent
    {
        [Key]
        public int Id { get; set; }

        public string RawErrorCode { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
        public bool IsAcknowledged { get; set; }

        // FK → the specific vehicle that triggered this event (nullable)
        public int? VehicleId { get; set; }

        [ForeignKey("VehicleId")]
        public Vehicle? Vehicle { get; set; }

        // FK → the owning user (for direct user-level queries)
        public int? AppUserId { get; set; }

        [ForeignKey("AppUserId")]
        public AppUser? User { get; set; }
    }
}