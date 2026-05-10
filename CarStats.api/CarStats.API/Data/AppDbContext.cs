using Microsoft.EntityFrameworkCore;
using CarStats.API.Models;

namespace CarStats.API.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<DiagnosticCode> DiagnosticCodes { get; set; }

        public DbSet<VehicleEvent> VehicleEvents { get; set; }

        public DbSet<MechanicShop> MechanicShops { get; set; }

        public DbSet<AppUser> Users { get; set; }
    }
}