using System.Text;
using System.Text.Json.Serialization;
using CarStats.API.Data;
using CarStats.API.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Register the database connection.
// Uses the hosted SQL Server (Somee) in production, LocalDB in development.
var connectionString = builder.Environment.IsDevelopment()
    ? builder.Configuration.GetConnectionString("DefaultConnection")
    : builder.Configuration.GetConnectionString("ProductionConnection");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(connectionString, sql =>
        // Retry transient failures — e.g. a free shared-hosting SQL Server that is
        // briefly unavailable while its app pool / database spins back up from idle.
        sql.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorNumbersToAdd: null)));

// CORS — allow all origins in development, lock down in production
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
                // Allow the mobile app and admin web from any origin in production
                policy.AllowAnyOrigin()
                      .AllowAnyHeader()
                      .AllowAnyMethod();
            }
        });
});

// Email provider (Brevo HTTP API) for sending verification codes
builder.Services.AddHttpClient<IEmailService, BrevoEmailService>();

// ── JWT authentication ────────────────────────────────────────────────────────
// login / verify-code issue a bearer token; every other endpoint requires it.
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
    // Secure by default: any endpoint without [AllowAnonymous] needs a valid token,
    // including controllers added in the future.
    options.FallbackPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();

    // Admin panel operations (user management, dictionary/shop edits, analytics)
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

// Run migrations and seed data on startup.
// A free shared-hosting database can be briefly unavailable on a cold start,
// so retry for a while instead of letting it crash the whole app
// (which surfaces as "HTTP Error 500.30 - ASP.NET Core app failed to start").
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

// NOTE: No forced HTTPS redirect. Somee terminates SSL at a shared front-end and
// forwards HTTP internally, so UseHttpsRedirection() can cause redirect loops.
// The public endpoint (https://<your-site>.somee.com) still serves over HTTPS.
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
