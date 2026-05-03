using Microsoft.EntityFrameworkCore;
using CarStats.API.Data;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// This registers our database connection using the string from appsettings.json
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// We will need controllers to build our API endpoints later
builder.Services.AddControllers();

var app = builder.Build();

// Configure the HTTP request pipeline.
app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();