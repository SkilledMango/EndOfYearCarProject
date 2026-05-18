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

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // 1. Existing connection for Diagnostic Codes
            modelBuilder.Entity<DiagnosticCode>()
                .HasOne(c => c.User)
                .WithMany(u => u.SavedCodes)
                .HasForeignKey(c => c.AppUserId)
                .OnDelete(DeleteBehavior.Cascade);

            // 2. NEW connection for Vehicle Events
            modelBuilder.Entity<VehicleEvent>()
                .HasOne(v => v.User)
                .WithMany(u => u.VehicleEvents)
                .HasForeignKey(v => v.AppUserId)
                .OnDelete(DeleteBehavior.Cascade);
        }
    }
}