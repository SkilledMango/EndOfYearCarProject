using Microsoft.EntityFrameworkCore;
using CarStats.API.Models;

namespace CarStats.API.Data
{
    // החיבור לבסיס הנתונים: ארבע הטבלאות והקשרים ביניהן
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<DiagnosticCode> DiagnosticCodes { get; set; }
        public DbSet<VehicleEvent> VehicleEvents { get; set; }
        public DbSet<AppUser> Users { get; set; }
        public DbSet<Vehicle> Vehicles { get; set; }

        // הגדרת הקשרים וחוקי המחיקה
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // 1. קוד שמור שייך למשתמש, ונמחק איתו
            modelBuilder.Entity<DiagnosticCode>()
                .HasOne(c => c.User)
                .WithMany(u => u.SavedCodes)
                .HasForeignKey(c => c.AppUserId)
                .OnDelete(DeleteBehavior.Cascade);

            // 2. אירוע תקלה שייך למשתמש, ונמחק איתו
            modelBuilder.Entity<VehicleEvent>()
                .HasOne(v => v.User)
                .WithMany(u => u.VehicleEvents)
                .HasForeignKey(v => v.AppUserId)
                .OnDelete(DeleteBehavior.Cascade);

            // 3. מחיקת משתמש מוחקת את כל הרכבים שלו
            modelBuilder.Entity<Vehicle>()
                .HasOne(v => v.User)
                .WithMany(u => u.Vehicles)
                .HasForeignKey(v => v.AppUserId)
                .OnDelete(DeleteBehavior.Cascade);

            // 4. מחיקת רכב רק מנתקת ממנו את האירועים, כדי שההיסטוריה תישמר.
            //    ClientSetNull ולא SetNull, כדי להימנע מהתנגשות מסלולי מחיקה
            //    מול המחיקה המדורגת שכבר מוגדרת מצד המשתמש.
            modelBuilder.Entity<VehicleEvent>()
                .HasOne(e => e.Vehicle)
                .WithMany(v => v.Events)
                .HasForeignKey(e => e.VehicleId)
                .OnDelete(DeleteBehavior.ClientSetNull);
        }
    }
}
