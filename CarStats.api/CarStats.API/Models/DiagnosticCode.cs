using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CarStats.API.Models
{
    public enum SeverityLevel
    {
        Green = 1,  // Good/Info
        Yellow = 2, // Warning - Check soon
        Red = 3     // Critical - Stop safely
    }

    public class DiagnosticCode
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(10)]
        public string ErrorCode { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string HumanTitle { get; set; } = string.Empty;

        [Required]
        public string Description { get; set; } = string.Empty;

        [Required]
        public SeverityLevel Severity { get; set; }

        public string ActionRequired { get; set; } = string.Empty;

        [Column(TypeName = "decimal(18,2)")]
        public decimal EstimatedCostMin { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal EstimatedCostMax { get; set; }

        public int? AppUserId { get; set; }

        [ForeignKey("AppUserId")]
        public AppUser? User { get; set; }
    }
}