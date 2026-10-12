using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CarStats.API.Controllers
{
    // המחירים בקונפיגורציה, כדי לעדכן אותם בלי גרסה חדשה של השרת
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class FuelPriceController : ControllerBase
    {
        private readonly IConfiguration _config;

        private const string RegulatedFuelType = "95";

        private static readonly (string Type, decimal Price)[] Fallbacks =
        {
            (RegulatedFuelType, 8.27m),
            ("98",             10.50m),
            ("diesel",         11.41m),
        };

        private const string FallbackEffectiveFrom = "2026-10-01";

        private const decimal FallbackElectricityPerKwh = 0.65m;

        public FuelPriceController(IConfiguration config)
        {
            _config = config;
        }

        // איתור: מחיר דלק וחשמל (שרת)
        [HttpGet]
        public ActionResult<FuelPriceResponse> GetFuelPrice()
        {
            var section = _config.GetSection("FuelPrice");

            var prices = Fallbacks
                .Select(f => new FuelPriceEntry
                {
                    FuelType         = f.Type,
                    PricePerLitreILS = ReadPrice(section, f.Type, f.Price),
                    IsOfficial       = f.Type == RegulatedFuelType,
                })
                .ToList();

            var effectiveFrom = section.GetValue<string>("EffectiveFrom");
            if (string.IsNullOrWhiteSpace(effectiveFrom))
                effectiveFrom = FallbackEffectiveFrom;

            var regulated = prices.First(p => p.FuelType == RegulatedFuelType);

            decimal electricity;
            try
            {
                electricity = section.GetValue("ElectricityPerKwhILS", FallbackElectricityPerKwh);
            }
            catch (InvalidOperationException)
            {
                electricity = FallbackElectricityPerKwh;
            }
            if (electricity <= 0) electricity = FallbackElectricityPerKwh;

            return Ok(new FuelPriceResponse
            {
                PricePerLitreILS     = regulated.PricePerLitreILS,
                FuelType             = RegulatedFuelType,
                EffectiveFrom        = effectiveFrom,
                Prices               = prices,
                ElectricityPerKwhILS = electricity,
            });
        }

        // נפילה לערך גיבוי כשההגדרה חסרה או שגויה
        private static decimal ReadPrice(IConfigurationSection section, string fuelType, decimal fallback)
        {
            decimal value;
            try
            {
                value = section.GetValue($"PricePerLitreILS:{fuelType}", fallback);
            }
            catch (InvalidOperationException)
            {
                return fallback;
            }

            return value > 0 ? value : fallback;
        }

        public class FuelPriceResponse
        {
            public decimal PricePerLitreILS { get; set; }

            public string FuelType { get; set; } = string.Empty;

            public string EffectiveFrom { get; set; } = string.Empty;

            public List<FuelPriceEntry> Prices { get; set; } = new();

            public decimal ElectricityPerKwhILS { get; set; }
        }

        public class FuelPriceEntry
        {
            public string FuelType { get; set; } = string.Empty;

            public decimal PricePerLitreILS { get; set; }

            public bool IsOfficial { get; set; }
        }
    }
}
