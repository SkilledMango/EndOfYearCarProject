using System.Text.Json;
using CarStats.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CarStats.API.Controllers
{
    public class VehicleSpecsRequest
    {
        public string Make { get; set; } = string.Empty;
        public string Model { get; set; } = string.Empty;
        public int Year { get; set; }
        // סוג הדלק מהמרשם הישראלי, אם ידוע. עוזר להבדיל בין גרסת בנזין לדיזל.
        public string? FuelTypeHint { get; set; }
    }

    public class ExplainFaultRequest
    {
        public string Code { get; set; } = string.Empty;
        public string? Make { get; set; }
        public string? Model { get; set; }
        public int? Year { get; set; }
    }

    // שאלות AI על רכבים ותקלות. כל תשובה נשמרת במטמון בבסיס הנתונים.
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class AiController : ControllerBase
    {
        private readonly AiService _ai;

        public AiController(AiService ai)
        {
            _ai = ai;
        }

        // איתור: AI משלים מפרט רכב - מיכל או סוללה, צריכה, חשמלי
        // POST: api/ai/vehicle-specs — חשמלי או דלק, גודל מיכל/סוללה וצריכה, בשאלה אחת
        [HttpPost("vehicle-specs")]
        public async Task<IActionResult> VehicleSpecs([FromBody] VehicleSpecsRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Make) || string.IsNullOrWhiteSpace(request.Model) || request.Year <= 0)
                return BadRequest("make, model and year are required.");
            // אותם גבולות כמו בטבלת הרכבים, וכך גם מפתח המטמון לא חורג מ-200 תווים
            if (request.Make.Length > 50 || request.Model.Length > 50 || (request.FuelTypeHint?.Length ?? 0) > 30)
                return BadRequest("make, model or fuel type is too long.");

            var key = $"specs:{request.Year}:{request.Make}:{request.Model}:{request.FuelTypeHint}"
                .ToLowerInvariant().Trim();

            // תשובה שמורה בלי מספרים היא שארית מלפני שהיה שלב ההערכה — שואלים מחדש
            var cached = await _ai.GetCachedAsync(key);
            if (cached != null && JsonSerializer.Deserialize<Specs>(cached, JsonOptions) is { IsComplete: true })
                return Content(cached, "application/json");

            var car = $"{request.Year} {request.Make} {request.Model}" +
                      (string.IsNullOrWhiteSpace(request.FuelTypeHint) ? "" : $" (Israeli registry fuel type: {request.FuelTypeHint})");

            // שלב 1: הנתונים הרשמיים. המודל מתבקש לא לנחש, כדי שמספר רשמי יהיה באמת רשמי
            var official = await _ai.AskJsonAsync(
                $"Give the factory specs of a {car}.\n" + SpecsFormat +
                "consumption: official WLTP combined figure — L/100km for fuel cars, kWh/100km for electric cars.\n" +
                "Use null for anything you do not know. Do not guess wildly.",
                HasPowertrain);
            var specs = official.Ok ? BuildSpecs(official.Json!.Value, official.Provider, estimated: false) : null;

            // שלב 2: דגם חדש או נדיר שהמודל לא מכיר לעומק — במקום שדה ריק, הערכה
            // לפי רכבים דומים. רק השדות החסרים מתמלאים ממנה, והיא מסומנת כהערכה
            if (specs is not { IsComplete: true })
            {
                var guess = await _ai.AskJsonAsync(
                    $"The official specs of a {car} are not known to you exactly. Give your best realistic estimate, " +
                    "based on this model if you know anything about it, otherwise on typical cars of the same type, size and era.\n" +
                    SpecsFormat +
                    "consumption: combined figure — L/100km for fuel cars, kWh/100km for electric cars.",
                    HasPowertrain);
                if (guess.Ok)
                    specs = Merge(specs, BuildSpecs(guess.Json!.Value, guess.Provider, estimated: true));
            }

            // כישלון לא נשמר במטמון — תקלה רגעית אצל הספק לא צריכה להיזכר כ"דגם לא מוכר"
            if (specs == null)
                return Ok(Unknown("none"));

            // רק תשובה מלאה נשמרת לתמיד; חלקית תישאל שוב בפעם הבאה
            if (specs.IsComplete)
                await _ai.SetCachedAsync(key, JsonSerializer.Serialize(specs, JsonOptions));
            return Ok(specs);
        }

        // איתור: הסבר AI לקוד תקלה שלא במילון (שרת)
        // POST: api/ai/explain-fault — הסבר בשפה פשוטה לקוד שאינו במילון שלנו
        [HttpPost("explain-fault")]
        public async Task<IActionResult> ExplainFault([FromBody] ExplainFaultRequest request)
        {
            var code = request.Code?.Trim().ToUpperInvariant() ?? "";
            if (code.Length < 4 || code.Length > 8 || !code.All(char.IsAsciiLetterOrDigit))
                return BadRequest("A valid fault code is required.");
            if ((request.Make?.Length ?? 0) > 50 || (request.Model?.Length ?? 0) > 50)
                return BadRequest("make or model is too long.");

            // כל מה שנכנס לשאלה חייב להיות גם במפתח. אחרת משתמש אחד יכול להכניס
            // הוראות לשדה הדגם, והתשובה המזויפת הייתה נשמרת לכל בעלי אותו יצרן.
            var key = $"dtc:{code}:{request.Make}:{request.Model}:{request.Year}".ToLowerInvariant().Trim();

            var cached = await _ai.GetCachedAsync(key);
            if (cached != null)
                return Content(cached, "application/json");

            var car = request.Year != null && !string.IsNullOrWhiteSpace(request.Make)
                ? $" on a {request.Year} {request.Make} {request.Model}"
                : "";

            var prompt =
                "You are explaining an OBD-II diagnostic trouble code to a car owner who " +
                $"is not a mechanic. Explain code {code}{car}.\n\n" +
                "Reply as strict JSON with exactly these keys and nothing else:\n" +
                "{\"title\": \"...\", \"description\": \"...\", \"action\": \"...\", \"severity\": \"low|medium|high\"}\n\n" +
                "title: under 8 words, plain language, no jargon.\n" +
                "description: 2 sentences on what is wrong and what the driver would notice.\n" +
                "action: 1 sentence on what they should do and how urgently.\n" +
                "severity: low if it can wait, medium if it should be booked in, high if " +
                "driving on could be unsafe or cause damage.\n" +
                // P1/B1/C1/U1 ו-P3 הם קודי יצרן: אותו קוד אומר דברים שונים אצל יצרנים שונים
                (car.Length > 0
                    ? "Codes whose second character is 1 or 3 are manufacturer-specific: give the meaning this " +
                      "manufacturer uses, not a generic one.\n"
                    : "") +
                "Do not mention prices. If you do not recognise the code, reply exactly: {\"title\": \"unknown\"}";

            var result = await _ai.AskJsonAsync(prompt, json =>
            {
                var title = Str(json, "title");
                return title.Length > 0
                    && !title.Equals("unknown", StringComparison.OrdinalIgnoreCase)
                    && Str(json, "description").Length > 0;
            });

            if (!result.Ok)
            {
                var reason = result.Failure switch
                {
                    AiService.Failure.NoProvider  => "no-key",
                    AiService.Failure.RateLimited => "rate-limited",
                    _                              => "unavailable",
                };
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new { reason });
            }

            var json = result.Json!.Value;
            var explanation = new
            {
                title       = Str(json, "title"),
                description = Str(json, "description"),
                action      = Str(json, "action"),
                severity    = Str(json, "severity"),
                source      = result.Provider,
            };
            var serialized = JsonSerializer.Serialize(explanation, JsonOptions);
            await _ai.SetCachedAsync(key, serialized);
            return Content(serialized, "application/json");
        }

        // ─── עזרים ────────────────────────────────────────────────────────────

        private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

        /// <summary>
        /// מה שהאפליקציה מקבלת על דגם. Estimated = לפחות אחד המספרים הוא הערכה של
        /// ה-AI לפי רכבים דומים, ולא נתון רשמי — האפליקציה אומרת זאת לנהג.
        /// </summary>
        private record Specs(bool? IsElectric, string Powertrain, double? TankCapacity, double? Consumption,
                             string Source, bool Estimated = false)
        {
            [System.Text.Json.Serialization.JsonIgnore]
            public bool IsComplete => IsElectric != null && TankCapacity != null && Consumption != null;
        }

        private const string SpecsFormat =
            "Reply as strict JSON with exactly these keys and nothing else:\n" +
            "{\"powertrain\": \"electric|plugin_hybrid|hybrid|diesel|petrol|unknown\", " +
            "\"tank_litres\": number or null, \"battery_kwh\": number or null, \"consumption\": number or null}\n" +
            "tank_litres: fuel tank capacity (null for fully electric cars).\n" +
            "battery_kwh: usable battery capacity (only for electric cars, otherwise null).\n";

        private static bool HasPowertrain(JsonElement json) =>
            json.TryGetProperty("powertrain", out var p) && p.ValueKind == JsonValueKind.String;

        /// <summary>
        /// משלים את החסר בתשובה הרשמית מתוך ההערכה — רק כששתיהן מסכימות על סוג
        /// ההנעה, אחרת גודל מיכל של רכב דלק היה נכנס כגודל סוללה.
        /// </summary>
        private static Specs Merge(Specs? official, Specs guess)
        {
            if (official == null || official.IsElectric == null) return guess;
            if (guess.IsElectric != official.IsElectric) return official;
            var tank = official.TankCapacity ?? guess.TankCapacity;
            var use  = official.Consumption ?? guess.Consumption;
            var filled = (official.TankCapacity == null && tank != null) || (official.Consumption == null && use != null);
            return official with { TankCapacity = tank, Consumption = use, Estimated = official.Estimated || filled };
        }

        private static Specs Unknown(string source) => new(null, "unknown", null, null, source);

        // ממיר את תשובת המודל לערכים שהאפליקציה משתמשת בהם, עם בדיקות היגיון:
        // מספר מחוץ לטווח של רכב אמיתי נזרק במקום להיכנס למוסך של הנהג
        private static Specs BuildSpecs(JsonElement json, string provider, bool estimated)
        {
            var powertrain = Str(json, "powertrain").ToLowerInvariant();
            var isElectric = powertrain == "electric";

            double? capacity = isElectric
                ? InRange(Num(json, "battery_kwh"), 10, 200)
                : InRange(Num(json, "tank_litres"), 20, 150);

            double? consumption = isElectric
                ? InRange(Num(json, "consumption"), 8, 40)    // קוט"ש ל-100 ק"מ
                : InRange(Num(json, "consumption"), 2, 35);   // ליטר ל-100 ק"מ

            bool? electricFlag = powertrain is "unknown" or "" ? null : isElectric;

            return new Specs(
                electricFlag,
                powertrain,
                capacity,
                consumption is double c ? Math.Round(c, 1) : null,
                provider,
                estimated && (capacity != null || consumption != null));
        }

        private static string Str(JsonElement json, string name) =>
            json.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()!.Trim() : "";

        private static double? Num(JsonElement json, string name) =>
            json.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;

        private static double? InRange(double? value, double min, double max) =>
            value is double v && v >= min && v <= max ? v : null;
    }
}
