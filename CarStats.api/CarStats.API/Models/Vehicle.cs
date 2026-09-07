using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CarStats.API.Models
{
    // טבלת הרכבים של המשתמשים
    public class Vehicle
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(50)]
        public string Make { get; set; } = string.Empty;        // יצרן, למשל "Toyota"

        [Required]
        [MaxLength(50)]
        public string Model { get; set; } = string.Empty;       // דגם, למשל "Corolla"

        public int Year { get; set; }

        [MaxLength(20)]
        public string LicensePlate { get; set; } = string.Empty;

        // צריכת דלק ממוצעת בליטר ל-100 ק"מ.
        // זה המספר שכל חישובי הדלק והנסיעה באפליקציה נשענים עליו.
        public double AverageFuelConsumption { get; set; } = 0.0;

        // --- הבעלים של הרכב ---
        public int AppUserId { get; set; }

        [ForeignKey("AppUserId")]
        public AppUser? User { get; set; }

        // --- התקלות שנרשמו על הרכב הזה ---
        public List<VehicleEvent> Events { get; set; } = new();
    }
}
