using System.Text;
using System.Text.Json.Serialization;
using CarStats.API.Data;
using CarStats.API.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ── בסיס הנתונים ──────────────────────────────────────────────────────────────
// LocalDB בפיתוח, ה-SQL Server המתארח ב-Somee בייצור.
var connectionString = builder.Environment.IsDevelopment()
    ? builder.Configuration.GetConnectionString("DefaultConnection")
    : builder.Configuration.GetConnectionString("ProductionConnection");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(connectionString, sql =>
        // ניסיונות חוזרים על תקלות זמניות: בסיס נתונים באחסון חינמי משותף
        // יכול להיות לא זמין לרגע בזמן שהוא מתעורר ממצב חוסר פעילות
        sql.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorNumbersToAdd: null)));

// ── CORS ──────────────────────────────────────────────────────────────────────
// בפיתוח מותר רק localhost, בייצור פתוח לאפליקציה ולפאנל הניהול
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp",
        policy =>
        {
            if (builder.Environment.IsDevelopment())
            {
                policy.SetIsOriginAllowed(origin =>
                          new Uri(origin).Host == "localhost")
                      .AllowAnyHeader()
                      .AllowAnyMethod();
            }
            else
            {
                policy.AllowAnyOrigin()
                      .AllowAnyHeader()
                      .AllowAnyMethod();
            }
        });
});

// ספק המיילים לשליחת קודי אימות
builder.Services.AddHttpClient<IEmailService, BrevoEmailService>();

// לקוח HTTP כללי, משמש את הפרוקסי ל-Google
builder.Services.AddHttpClient();

// ── אימות JWT ─────────────────────────────────────────────────────────────────
// login ו-verify-code מנפיקים טוקן; כל שאר הנקודות דורשות אותו.
builder.Services.AddSingleton<ITokenService, TokenService>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(TokenService.GetKeyMaterial(builder.Configuration, builder.Environment))),
            ValidateIssuer   = true,
            ValidIssuer      = TokenService.Issuer,
            ValidateAudience = true,
            ValidAudience    = TokenService.Audience,
            ValidateLifetime = true,
        };
    });

builder.Services.AddAuthorization(options =>
{
    // מאובטח כברירת מחדל: כל נקודת קצה דורשת טוקן אלא אם סומנה AllowAnonymous,
    // כולל בקרים שיתווספו בעתיד
    options.FallbackPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();

    // פעולות פאנל הניהול: משתמשים, מילון התקלות וסטטיסטיקות
    options.AddPolicy("AdminOnly", policy =>
        policy.RequireRole(nameof(CarStats.API.Models.UserRole.Admin),
                           nameof(CarStats.API.Models.UserRole.SuperAdmin)));
});

builder.Services.AddControllers()
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles);
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// ── עלייה: מיגרציות וטעינת המילון ─────────────────────────────────────────────
// בסיס נתונים באחסון חינמי לרוב ישן בבקשה הראשונה, ולכן מנסים שוב ושוב
// במקום לתת לשרת כולו ליפול בהפעלה.
using (var scope = app.Services.CreateScope())
{
    var db     = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

    const int maxAttempts = 10;
    for (var attempt = 1; ; attempt++)
    {
        try
        {
            db.Database.Migrate();
            await DbSeeder.SeedDiagnosticCodesAsync(db);

            // ── מנהל ראשוני ────────────────────────────────────────────────
            // אי אפשר להתחבר לבסיס הנתונים בייצור מבחוץ, ולכן אי אפשר לקדם
            // משתמש למנהל ידנית. במקום זה, הקונפיגורציה יכולה לציין חשבון
            // אחד שיהיה מנהל-על אחרי כל עלייה של השרת.
            var bootstrapEmail = app.Configuration["Bootstrap:AdminEmail"]?.ToLower().Trim();
            if (!string.IsNullOrWhiteSpace(bootstrapEmail))
            {
                var owner = db.Users.FirstOrDefault(u => u.Email.ToLower() == bootstrapEmail);
                if (owner != null && owner.Role != CarStats.API.Models.UserRole.SuperAdmin)
                {
                    owner.Role = CarStats.API.Models.UserRole.SuperAdmin;
                    await db.SaveChangesAsync();
                    logger.LogInformation("Bootstrap: promoted {Email} to SuperAdmin.", bootstrapEmail);
                }
            }
            break;
        }
        catch (Exception ex) when (attempt < maxAttempts)
        {
            logger.LogWarning(ex,
                "Database not ready on startup (attempt {Attempt}/{Max}) — retrying in 10s. " +
                "This is expected while a free shared-hosting database spins up.",
                attempt, maxAttempts);
            await Task.Delay(TimeSpan.FromSeconds(10));
        }
    }
}

// Swagger רק בפיתוח
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowReactApp");

// אין הפניה כפויה ל-HTTPS: ב-Somee ה-SSL מסתיים בשרת חזית משותף
// שמעביר פנימה HTTP רגיל, ולכן הפניה כפויה הייתה יוצרת לולאה.
// הכתובת הציבורית עדיין מוגשת מעל HTTPS.
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
