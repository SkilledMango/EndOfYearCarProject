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
        // התשובה מקוצצת לשדות שהמסך באמת מציג, כי המקורית ענקית.
        [HttpGet("nearby-shops")]
        public async Task<IActionResult> NearbyShops([FromQuery] double lat, [FromQuery] double lng)
        {
            if (string.IsNullOrWhiteSpace(ApiKey))
                return StatusCode(StatusCodes.Status503ServiceUnavailable, "Shop search is not configured.");

            var url =
                "https://maps.googleapis.com/maps/api/place/nearbysearch/json" +
                $"?location={lat},{lng}" +
                "&rankby=distance" +
                "&type=car_repair" +
                // שמות בעברית, כדי שהרשימה תתאים לשילוט ברחוב
                "&language=he" +
                $"&key={ApiKey}";

            var client = _httpFactory.CreateClient();
            var json   = await client.GetStringAsync(url);

            using var doc = JsonDocument.Parse(json);
            var status = doc.RootElement.GetProperty("status").GetString();
            if (status != "OK" && status != "ZERO_RESULTS")
                return StatusCode(StatusCodes.Status502BadGateway, $"Places search failed ({status}).");

            // בניית רשימה מצומצמת: שם, כתובת, דירוג ומיקום
            var shops = new List<object>();
            if (doc.RootElement.TryGetProperty("results", out var results))
            {
                foreach (var place in results.EnumerateArray())
                {
                    var loc = place.GetProperty("geometry").GetProperty("location");
                    shops.Add(new
                    {
                        placeId     = place.GetProperty("place_id").GetString(),
                        name        = place.GetProperty("name").GetString(),
                        address     = place.TryGetProperty("vicinity", out var v) ? v.GetString() : "",
                        rating      = place.TryGetProperty("rating", out var r) ? r.GetDouble() : 0,
                        reviewCount = place.TryGetProperty("user_ratings_total", out var t) ? t.GetInt32() : 0,
                        latitude    = loc.GetProperty("lat").GetDouble(),
                        longitude   = loc.GetProperty("lng").GetDouble(),
                    });
                }
            }
            return Ok(shops);
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
