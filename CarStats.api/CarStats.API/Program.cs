using System.Text;
using System.Text.Json.Serialization;
using CarStats.API.Data;
using CarStats.API.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Environment.IsDevelopment()
    ? builder.Configuration.GetConnectionString("DefaultConnection")
    : builder.Configuration.GetConnectionString("ProductionConnection");

// איתור: חיבור למסד הנתונים
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(connectionString, sql =>
        // ניסיונות חוזרים: מסד נתונים חינמי מתעורר לאט
        sql.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorNumbersToAdd: null)));

// איתור: הגדרת CORS - מי רשאי לפנות לשרת
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

builder.Services.AddHttpClient<IEmailService, BrevoEmailService>();

builder.Services.AddHttpClient();

builder.Services.AddScoped<AiService>();
builder.Services.AddSingleton<ScannerRegistry>();

// איתור: אימות טוקן JWT בשרת
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
    // כל נקודה דורשת טוקן, אלא אם סומנה AllowAnonymous
    options.FallbackPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();

    // איתור: הרשאת מנהל (AdminOnly)
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

// מנסים שוב: מסד הנתונים ישן בבקשה הראשונה
using (var scope = app.Services.CreateScope())
{
    var db     = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

    const int maxAttempts = 10;
    for (var attempt = 1; ; attempt++)
    {
        try
        {
            // איתור: יצירת מסד הנתונים בהפעלת השרת (Migrations + מילון)
            db.Database.Migrate();
            await DbSeeder.SeedDiagnosticCodesAsync(db);

            // מנהל ראשוני מהקונפיגורציה
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

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowReactApp");

// בלי הפניה ל-HTTPS: ב-Somee זה יוצר לולאה
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
