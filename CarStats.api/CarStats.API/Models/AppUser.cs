using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema; // Add this!

namespace CarStats.API.Models
{
	public class AppUser
	{
		[Key]
		public int Id { get; set; }

		[Required]
		[MaxLength(100)]
		public string FullName { get; set; } = string.Empty;

		[Required]
		public string Email { get; set; } = string.Empty;

		// 1. THIS IS SAVED TO THE DATABASE
		public string PasswordHash { get; set; } = string.Empty;

		// 2. THIS IS ONLY USED TO RECEIVE DATA FROM REACT (Not saved to DB)
		[NotMapped]
		public string? NewPassword { get; set; }

		public string LicensePlate { get; set; } = string.Empty;
		public string VehicleModel { get; set; } = string.Empty;
		public double AverageFuelConsumption { get; set; } = 0.0;
		public int TotalFaultsLogged { get; set; } = 0;
		public bool IsPremiumMember { get; set; } = false;
	}
}