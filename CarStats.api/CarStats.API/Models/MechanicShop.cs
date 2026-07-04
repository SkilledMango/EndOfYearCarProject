using System.ComponentModel.DataAnnotations;

namespace CarStats.API.Models
{
    public class MechanicShop
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(100)]
        public string Name { get; set; } = string.Empty;

        [Required]
        public string Address { get; set; } = string.Empty;

        [Phone]
        public string PhoneNumber { get; set; } = string.Empty;

        public string Specialty { get; set; } = "General"; // e.g., "Brakes", "Engine", "Electric"

        // Shown as the "4.8 (120)" chip in the mobile mechanic finder.
        // 0 means "not rated yet" — the mobile app hides the chip.
        [Range(0, 5)]
        public double Rating { get; set; }
        public int ReviewCount { get; set; }

        // For future Google Maps integration
        public double Latitude { get; set; }
        public double Longitude { get; set; }
    }
}