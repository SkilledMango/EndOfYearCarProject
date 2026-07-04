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
        public DbSet<AppUser> Users { get; set; }
        public DbSet<Vehicle> Vehicles { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // 1. DiagnosticCode → AppUser
            modelBuilder.Entity<DiagnosticCode>()
                .HasOne(c => c.User)
                .WithMany(u => u.SavedCodes)
                .HasForeignKey(c => c.AppUserId)
                .OnDelete(DeleteBehavior.Cascade);

            // 2. VehicleEvent → AppUser (direct user-level cascade)
            modelBuilder.Entity<VehicleEvent>()
                .HasOne(v => v.User)
                .WithMany(u => u.VehicleEvents)
                .HasForeignKey(v => v.AppUserId)
                .OnDelete(DeleteBehavior.Cascade);

            // 3. Vehicle → AppUser (deleting a user removes all their vehicles)
            modelBuilder.Entity<Vehicle>()
                .HasOne(v => v.User)
                .WithMany(u => u.Vehicles)
                .HasForeignKey(v => v.AppUserId)
                .OnDelete(DeleteBehavior.Cascade);

            // 4. VehicleEvent → Vehicle
            //    SetNull so deleting a vehicle keeps the event history intact
            //    (uses NoAction at DB level to avoid multi-cascade-path conflicts)
            modelBuilder.Entity<VehicleEvent>()
                .HasOne(e => e.Vehicle)
                .WithMany(v => v.Events)
                .HasForeignKey(e => e.VehicleId)
                .OnDelete(DeleteBehavior.ClientSetNull);
        }
    }
}