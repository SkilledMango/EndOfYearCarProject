using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CarStats.API.Models
{
    // איתור: מודל רכב
    public class Vehicle
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(50)]
        public string Make { get; set; } = string.Empty;

        [Required]
        [MaxLength(50)]
        public string Model { get; set; } = string.Empty;

        public int Year { get; set; }

        [MaxLength(20)]
        public string LicensePlate { get; set; } = string.Empty;

        // צריכה ל-100 ק"מ: ליטרים, או קוט"ש ברכב חשמלי
        public double AverageFuelConsumption { get; set; } = 0.0;

        public bool IsElectric { get; set; } = false;

        // מיכל בליטרים או סוללה בקוט"ש; 0 = לא ידוע
        public double TankCapacity { get; set; } = 0.0;

        public int AppUserId { get; set; }

        [ForeignKey("AppUserId")]
        public AppUser? User { get; set; }

        public List<VehicleEvent> Events { get; set; } = new();
    }
}
