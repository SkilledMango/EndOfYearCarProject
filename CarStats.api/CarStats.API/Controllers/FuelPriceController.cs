using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CarStats.API.Controllers
{
    // מחירי הדלק. מגיעים מהקונפיגורציה ולא מהקוד, כי מחיר ה-95 מתעדכן
    // כל חודש וקבוע בקוד היה מחייב העלאת גרסה חדשה של השרת.
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class FuelPriceController : ControllerBase
    {
        private readonly IConfiguration _config;

        /// <summary>סוג הדלק המפוקח. רק המחיר שלו הוא עובדה רשמית.</summary>
        private const string RegulatedFuelType = "95";

        // ערכי גיבוי, למקרה שהקונפיגורציה חסרה או שגויה
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

        // GET: api/fuelprice — מחזיר את שלושת סוגי הדלק, כל אחד מסומן אם הוא רשמי
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
                // המחיר המפוקח מוחזר גם ברמה העליונה, כדי שקורא שצריך
                // רק "מחיר בנזין" — כמו מתכנן הנסיעה — לא יצטרך את הרשימה
                PricePerLitreILS = regulated.PricePerLitreILS,
                FuelType         = RegulatedFuelType,
                EffectiveFrom    = effectiveFrom,
                Prices           = prices,
            });
        }

        /// <summary>
        /// קורא מחיר אחד מהקונפיגורציה, עם נפילה לערך הגיבוי בכל מקרה חריג.
        /// שגיאת הקלדה בקובץ ההגדרות לא תפיל את הנקודה, ואפס היה הופך את הדלק לחינם.
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

        // מבנה התשובה שהאפליקציה מקבלת
        public class FuelPriceResponse
        {
            /// <summary>מחיר ה-95 המפוקח — ברירת המחדל לכל מי שלא מבדיל בין סוגי דלק.</summary>
            public decimal PricePerLitreILS { get; set; }

            /// <summary>לאיזה סוג המחיר העליון מתייחס. תמיד 95.</summary>
            public string FuelType { get; set; } = string.Empty;

            /// <summary>התאריך שממנו המחיר המפוקח בתוקף, כדי שהאפליקציה תוכל להציג מקור.</summary>
            public string EffectiveFrom { get; set; } = string.Empty;

            /// <summary>כל סוגי הדלק שהאפליקציה מציעה, מפוקחים או לא.</summary>
            public List<FuelPriceEntry> Prices { get; set; } = new();
        }

        public class FuelPriceEntry
        {
            public string FuelType { get; set; } = string.Empty;

            /// <summary>מחיר לליטר בשקלים, כולל מע"מ.</summary>
            public decimal PricePerLitreILS { get; set; }

            /// <summary>
            /// אמת רק עבור 95. שקר משמעו מחיר שוק חופשי: נתון אופייני
            /// שהנהג אמור לאמת מול הקבלה, ולא עובדה.
            /// </summary>
            public bool IsOfficial { get; set; }
        }
    }
}
