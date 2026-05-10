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

        // For future Google Maps integration
        public double Latitude { get; set; }
        public double Longitude { get; set; }
    }
}