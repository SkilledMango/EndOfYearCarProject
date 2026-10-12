using Microsoft.EntityFrameworkCore;
using CarStats.API.Models;

namespace CarStats.API.Data
{
    // איתור: טבלאות מסד הנתונים (DbContext)
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<DiagnosticCode> DiagnosticCodes { get; set; }
        public DbSet<VehicleEvent> VehicleEvents { get; set; }
        public DbSet<AppUser> Users { get; set; }
        public DbSet<Vehicle> Vehicles { get; set; }
        public DbSet<AiCacheEntry> AiCache { get; set; }

        // חוקי המחיקה בין הטבלאות
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<DiagnosticCode>()
                .HasOne(c => c.User)
                .WithMany(u => u.SavedCodes)
                .HasForeignKey(c => c.AppUserId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<VehicleEvent>()
                .HasOne(v => v.User)
                .WithMany(u => u.VehicleEvents)
                .HasForeignKey(v => v.AppUserId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Vehicle>()
                .HasOne(v => v.User)
                .WithMany(u => u.Vehicles)
                .HasForeignKey(v => v.AppUserId)
                .OnDelete(DeleteBehavior.Cascade);

            // מחיקת רכב רק מנתקת ממנו את התקלות, וההיסטוריה נשמרת
            modelBuilder.Entity<VehicleEvent>()
                .HasOne(e => e.Vehicle)
                .WithMany(v => v.Events)
                .HasForeignKey(e => e.VehicleId)
                .OnDelete(DeleteBehavior.ClientSetNull);
        }
    }
}
