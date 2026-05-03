using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CarStats.API.Models
{
    public class VehicleEvent
    {
        [Key]
        public int Id { get; set; }

        // We will tie this to a specific user/vehicle later, for now we keep it simple
        public string VehicleId { get; set; } = "TEST-CAR-01";

        [Required]
        [MaxLength(10)]
        public string RawErrorCode { get; set; } = string.Empty;

        public DateTime Timestamp { get; set; } = DateTime.UtcNow;

        // Has the user seen the alert for this event?
        public bool IsAcknowledged { get; set; } = false;
    }
}