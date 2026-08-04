using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CarStats.API.Controllers
{
    /// <summary>
    /// Current pump prices per fuel type.
    ///
    /// Only 95-octane is regulated in Israel: the Ministry of Energy sets one
    /// national maximum for self-service 95 and revises it at midnight before
    /// the first working day of each month. Since 2007 the state has not
    /// regulated the others, so 98 and diesel are free-market and vary by
    /// station and company — there is no authoritative number to serve for
    /// them, only a typical one.
    ///
    /// That difference is carried in the response as IsOfficial, so the app can
    /// present a regulated price as fact and a free-market one as a starting
    /// figure the driver is expected to correct. Serving all of them from here
    /// rather than baking them into the app means the monthly update is one
    /// value in appsettings.json instead of a new build on every phone.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class FuelPriceController : ControllerBase
    {
        private readonly IConfiguration _config;

        /// <summary>The regulated type. Its price is the one we can state as fact.</summary>
        private const string RegulatedFuelType = "95";

        // Used when configuration is missing or malformed, so a bad deploy
        // shows a slightly stale price rather than no cost estimate at all.
        // Only the 95 figure is an official number; the others are placeholders
        // meant to be replaced from a real receipt.
        private static readonly (string Type, decimal Price)[] Fallbacks =
        {
            (RegulatedFuelType, 8.09m),
            ("98",             10.50m),
            ("diesel",         11.41m),
        };

        private const string FallbackEffectiveFrom = "2026-08-01";

        public FuelPriceController(IConfiguration config)
        {
            _config = config;
        }

        // GET: api/fuelprice
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

            return Ok(new FuelPriceResponse
            {
                // The regulated price stays at the top level so callers that
                // only need "the" petrol price — the trip planner — do not have
                // to know the list exists.
                PricePerLitreILS = regulated.PricePerLitreILS,
                FuelType         = RegulatedFuelType,
                EffectiveFrom    = effectiveFrom,
                Prices           = prices,
            });
        }

        /// <summary>
        /// Reads one price from configuration, falling back on anything that
        /// would produce a nonsensical estimate. A typo in appsettings must not
        /// take the endpoint down, and a zero would silently make fuel free.
        /// </summary>
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
            /// <summary>The regulated 95 price — the default for anything not fuel-type aware.</summary>
            public decimal PricePerLitreILS { get; set; }

            /// <summary>Which type the top-level price refers to. Always 95.</summary>
            public string FuelType { get; set; } = string.Empty;

            /// <summary>ISO date the regulated price took effect, so the app can show where it came from.</summary>
            public string EffectiveFrom { get; set; } = string.Empty;

            /// <summary>Every type the app offers, regulated or not.</summary>
            public List<FuelPriceEntry> Prices { get; set; } = new();
        }

        public class FuelPriceEntry
        {
            public string FuelType { get; set; } = string.Empty;

            /// <summary>Price per litre in shekels, VAT included.</summary>
            public decimal PricePerLitreILS { get; set; }

            /// <summary>
            /// True only for 95. False means free-market: a typical figure the
            /// driver should check against their receipt, not a fact.
            /// </summary>
            public bool IsOfficial { get; set; }
        }
    }
}
