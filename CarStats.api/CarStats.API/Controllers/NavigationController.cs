using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CarStats.API.Controllers
{
    /// <summary>
    /// פרוקסי בצד השרת לשירותי Google Maps. קיים משתי סיבות:
    /// Google לא שולחת כותרות CORS ולכן גרסת הווב לא יכולה לקרוא לה ישירות,
    /// ומפתח שנמצא בקוד הלקוח ניתן לחילוץ ולשימוש על חשבוננו.
    /// המפתח יושב בקונפיגורציה של השרת בלבד.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class NavigationController : ControllerBase
    {
        private readonly IHttpClientFactory _httpFactory;
        private readonly IConfiguration _config;

        public NavigationController(IHttpClientFactory httpFactory, IConfiguration config)
        {
            _httpFactory = httpFactory;
            _config      = config;
        }

        private string? ApiKey => _config["GoogleMaps:ApiKey"];

        // GET: api/navigation/route — מסלול, מרחק וזמן נסיעה עם תנועה חיה.
        // התשובה של Google מועברת כמו שהיא, כי הלקוח כבר יודע לפרסר אותה.
        [HttpGet("route")]
        public async Task<IActionResult> GetRoute([FromQuery] string origin, [FromQuery] string destination)
        {
            if (string.IsNullOrWhiteSpace(origin) || string.IsNullOrWhiteSpace(destination))
                return BadRequest("origin and destination are required.");
            if (string.IsNullOrWhiteSpace(ApiKey))
                return StatusCode(StatusCodes.Status503ServiceUnavailable, "Route service is not configured.");

            // region מטה שם מקום דו-משמעי לישראל, ו-language מחזיר שמות רחובות
            // בעברית כדי שיתאימו לשלטים שהנהג רואה בפועל
            var url =
                "https://maps.googleapis.com/maps/api/directions/json" +
                $"?origin={Uri.EscapeDataString(origin)}" +
                $"&destination={Uri.EscapeDataString(destination)}" +
                "&departure_time=now" +
                "&region=il" +
                "&language=he" +
                $"&key={ApiKey}";

            var client = _httpFactory.CreateClient();
            var json   = await client.GetStringAsync(url);
            return Content(json, "application/json");
        }

        // GET: api/navigation/nearby-shops — מוסכים חיים סביב המשתמש.
        //   kind=fuel (ברירת מחדל) — כל המוסכים, מהקרוב לרחוק
        //   kind=electric — מוסכים לרכב חשמלי והיברידי
        //   make / makeHe — יצרן הרכב באנגלית ובעברית: המוסך המורשה הקרוב שלו עולה לראש הרשימה
        // התשובה מקוצצת לשדות שהמסך באמת מציג, כי המקורית ענקית.
        [HttpGet("nearby-shops")]
        public async Task<IActionResult> NearbyShops(
            [FromQuery] double lat, [FromQuery] double lng,
            [FromQuery] string? kind = null, [FromQuery] string? make = null, [FromQuery] string? makeHe = null)
        {
            if (string.IsNullOrWhiteSpace(ApiKey))
                return StatusCode(StatusCodes.Status503ServiceUnavailable, "Shop search is not configured.");

            List<Shop> shops;
            if (kind == "electric")
            {
                // "רכב חשמלי" לבד מחזיר גם מעבדות קורקינטים, ולכן שתי שאילתות וסינון
                var a = await SearchAsync(lat, lng, "מוסך היברידי חשמלי");
                var b = await SearchAsync(lat, lng, "רכב חשמלי");
                if (a == null && b == null)
                    return StatusCode(StatusCodes.Status502BadGateway, "Places search failed.");
                shops = (a ?? new()).Concat(b ?? new())
                    .Where(s => !NotACarShop.IsMatch(s.Name))
                    .DistinctBy(s => s.PlaceId)
                    .OrderBy(s => DistanceKm(lat, lng, s.Latitude, s.Longitude))
                    .ToList();
            }
            else
            {
                var all = await SearchAsync(lat, lng, null);
                if (all == null) return StatusCode(StatusCodes.Status502BadGateway, "Places search failed.");
                shops = all;
            }

            // המוסך המורשה הקרוב של יצרן הרכב — ראשון ברשימה, ומסומן ככזה.
            // החיפוש של Google לפי מילת מפתח מחזיר גם מוסכים כלליים, ולכן נדרש
            // שהיצרן יופיע בשם המוסך עצמו.
            var names = new[] { make, makeHe }.Where(n => !string.IsNullOrWhiteSpace(n) && n!.Length <= 30).ToList();
            if (names.Count > 0)
            {
                var brandHits = await SearchAsync(lat, lng, makeHe ?? make);
                var brand = brandHits?.FirstOrDefault(s =>
                    names.Any(n => s.Name.Contains(n!, StringComparison.OrdinalIgnoreCase)));
                if (brand != null)
                {
                    shops.RemoveAll(s => s.PlaceId == brand.PlaceId);
                    shops.Insert(0, brand with { IsBrandService = true });
                }
            }

            return Ok(shops);
        }

        private record Shop(string PlaceId, string Name, string Address, double Rating, int ReviewCount,
                            double Latitude, double Longitude, bool IsBrandService = false);

        // שמות שמסגירים שזה לא מוסך לרכב: קורקינטים, אופניים, עמדות טעינה ניידות
        private static readonly System.Text.RegularExpressions.Regex NotACarShop =
            new("קורקינט|אופני|scooter|bike|דלקן", System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        /// <summary>חיפוש מוסכים אחד ב-Google, מהקרוב לרחוק. null כשהחיפוש נכשל.</summary>
        private async Task<List<Shop>?> SearchAsync(double lat, double lng, string? keyword)
        {
            var url =
                "https://maps.googleapis.com/maps/api/place/nearbysearch/json" +
                $"?location={lat},{lng}" +
                "&rankby=distance" +
                "&type=car_repair" +
                (keyword == null ? "" : $"&keyword={Uri.EscapeDataString(keyword)}") +
                // שמות בעברית, כדי שהרשימה תתאים לשילוט ברחוב
                "&language=he" +
                $"&key={ApiKey}";

            var client = _httpFactory.CreateClient();
            var json   = await client.GetStringAsync(url);

            using var doc = JsonDocument.Parse(json);
            var status = doc.RootElement.GetProperty("status").GetString();
            if (status != "OK" && status != "ZERO_RESULTS") return null;

            // בניית רשימה מצומצמת: שם, כתובת, דירוג ומיקום
            var shops = new List<Shop>();
            if (doc.RootElement.TryGetProperty("results", out var results))
            {
                foreach (var place in results.EnumerateArray())
                {
                    var loc = place.GetProperty("geometry").GetProperty("location");
                    shops.Add(new Shop(
                        place.GetProperty("place_id").GetString() ?? "",
                        place.GetProperty("name").GetString() ?? "",
                        place.TryGetProperty("vicinity", out var v) ? v.GetString() ?? "" : "",
                        place.TryGetProperty("rating", out var r) ? r.GetDouble() : 0,
                        place.TryGetProperty("user_ratings_total", out var t) ? t.GetInt32() : 0,
                        loc.GetProperty("lat").GetDouble(),
                        loc.GetProperty("lng").GetDouble()));
                }
            }
            return shops;
        }

        // מרחק אווירי בק"מ (הברסין) — לסידור תוצאות של שתי שאילתות יחד
        private static double DistanceKm(double lat1, double lng1, double lat2, double lng2)
        {
            const double R = 6371;
            var dLat = (lat2 - lat1) * Math.PI / 180;
            var dLng = (lng2 - lng1) * Math.PI / 180;
            var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                    Math.Cos(lat1 * Math.PI / 180) * Math.Cos(lat2 * Math.PI / 180) * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
            return R * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        }

        // GET: api/navigation/shop-phone — מספר הטלפון של מוסך.
        // נשלף רק בלחיצה על "חייג", כי הוא לא חלק מתוצאות החיפוש והקריאה מחויבת בנפרד.
        [HttpGet("shop-phone")]
        public async Task<IActionResult> ShopPhone([FromQuery] string placeId)
        {
            if (string.IsNullOrWhiteSpace(placeId))
                return BadRequest("placeId is required.");
            if (string.IsNullOrWhiteSpace(ApiKey))
                return StatusCode(StatusCodes.Status503ServiceUnavailable, "Shop search is not configured.");

            var url =
                "https://maps.googleapis.com/maps/api/place/details/json" +
                $"?place_id={Uri.EscapeDataString(placeId)}" +
                "&fields=formatted_phone_number,international_phone_number" +
                $"&key={ApiKey}";

            var client = _httpFactory.CreateClient();
            var json   = await client.GetStringAsync(url);

            using var doc = JsonDocument.Parse(json);
            string? phone = null;
            if (doc.RootElement.TryGetProperty("result", out var result))
            {
                if (result.TryGetProperty("international_phone_number", out var intl)) phone = intl.GetString();
                else if (result.TryGetProperty("formatted_phone_number", out var local)) phone = local.GetString();
            }
            return Ok(new { phone });
        }

        // GET: api/navigation/autocomplete — השלמה אוטומטית של כתובות
        [HttpGet("autocomplete")]
        public async Task<IActionResult> Autocomplete([FromQuery] string input)
        {
            if (string.IsNullOrWhiteSpace(input))
                return BadRequest("input is required.");
            if (string.IsNullOrWhiteSpace(ApiKey))
                return StatusCode(StatusCodes.Status503ServiceUnavailable, "Route service is not configured.");

            // מוגבל לישראל ומוטה למרכז הארץ. בלי ההגבלה, תחילת שם רחוב
            // מתאימה לאלפי מקומות בעולם והתוצאות כמעט אף פעם לא רלוונטיות.
            var url =
                "https://maps.googleapis.com/maps/api/place/autocomplete/json" +
                $"?input={Uri.EscapeDataString(input)}" +
                "&types=geocode|establishment" +
                "&components=country:il" +
                "&location=31.5,34.9&radius=150000" +
                "&language=he" +
                $"&key={ApiKey}";

            var client = _httpFactory.CreateClient();
            var json   = await client.GetStringAsync(url);
            return Content(json, "application/json");
        }

        // GET: api/navigation/geocode — כתובת שהוקלדה אל קואורדינטות,
        // כדי שלא כל תכונה תהיה תלויה ב-GPS של המכשיר.
        // כאן התשובה כן מקוצצת: הקורא רוצה נקודה אחת ולא את כל הפלט של Google.
        [HttpGet("geocode")]
        public async Task<IActionResult> Geocode([FromQuery] string address)
        {
            if (string.IsNullOrWhiteSpace(address))
                return BadRequest("address is required.");
            if (string.IsNullOrWhiteSpace(ApiKey))
                return StatusCode(StatusCodes.Status503ServiceUnavailable, "Geocoding is not configured.");

            // אותה הטיה לישראל כמו בהשלמה, ופלט בעברית כדי ששאילתה בעברית
            // לא תחזור מתועתקת לאנגלית
            var url =
                "https://maps.googleapis.com/maps/api/geocode/json" +
                $"?address={Uri.EscapeDataString(address)}" +
                "&components=country:IL" +
                "&language=he" +
                "&region=il" +
                $"&key={ApiKey}";

            var client = _httpFactory.CreateClient();
            var json   = await client.GetStringAsync(url);

            using var doc = JsonDocument.Parse(json);
            var root      = doc.RootElement;
            var status    = root.TryGetProperty("status", out var s) ? s.GetString() : "UNKNOWN_ERROR";

            // כתובת שלא נמצאה היא תוצאה רגילה של שגיאת הקלדה ולא תקלת שרת,
            // ולכן מוחזר 404 ולא שגיאה
            if (status != "OK" ||
                !root.TryGetProperty("results", out var results) ||
                results.GetArrayLength() == 0)
            {
                return NotFound(new { status, message = "No location found for that address." });
            }

            var first    = results[0];
            var location = first.GetProperty("geometry").GetProperty("location");

            return Ok(new
            {
                latitude         = location.GetProperty("lat").GetDouble(),
                longitude        = location.GetProperty("lng").GetDouble(),
                formattedAddress = first.TryGetProperty("formatted_address", out var fa)
                                   ? fa.GetString()
                                   : address,
            });
        }
    }
}
