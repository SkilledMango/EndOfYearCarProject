using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CarStats.API.Models
{
    public class Vehicle
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(50)]
        public string Make { get; set; } = string.Empty;        // e.g. "Toyota"

        [Required]
        [MaxLength(50)]
        public string Model { get; set; } = string.Empty;       // e.g. "Corolla"

        public int Year { get; set; }

        [MaxLength(20)]
        public string LicensePlate { get; set; } = string.Empty;

        public double AverageFuelConsumption { get; set; } = 0.0; // L/100km

        // --- FK to the owner ---
        public int AppUserId { get; set; }

        [ForeignKey("AppUserId")]
        public AppUser? User { get; set; }

        // --- Events logged against this vehicle ---
        public List<VehicleEvent> Events { get; set; } = new();
    }
}
