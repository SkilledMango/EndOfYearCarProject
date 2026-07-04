using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CarStats.API.Controllers
{
    /// <summary>
    /// Server-side proxy for Google Maps Platform calls (Directions + Places
    /// autocomplete). Exists for two reasons:
    ///  1. Google's web-service APIs don't send CORS headers, so the mobile
    ///     app's web build can't call them directly from the browser.
    ///  2. Keeps the Google API key out of the client bundle entirely — it
    ///     lives in gitignored server config ("GoogleMaps:ApiKey").
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

        // GET: api/navigation/route?origin=32.08,34.78&destination=Dizengoff Center
        // Passes Google's Directions response through untouched — the client
        // already knows how to parse it.
        [HttpGet("route")]
        public async Task<IActionResult> GetRoute([FromQuery] string origin, [FromQuery] string destination)
        {
            if (string.IsNullOrWhiteSpace(origin) || string.IsNullOrWhiteSpace(destination))
                return BadRequest("origin and destination are required.");
            if (string.IsNullOrWhiteSpace(ApiKey))
                return StatusCode(StatusCodes.Status503ServiceUnavailable, "Route service is not configured.");

            var url =
                "https://maps.googleapis.com/maps/api/directions/json" +
                $"?origin={Uri.EscapeDataString(origin)}" +
                $"&destination={Uri.EscapeDataString(destination)}" +
                "&departure_time=now" +
                $"&key={ApiKey}";

            var client = _httpFactory.CreateClient();
            var json   = await client.GetStringAsync(url);
            return Content(json, "application/json");
        }

        // GET: api/navigation/nearby-shops?lat=32.08&lng=34.78
        // Live car-repair shops around the user from Google Places, trimmed to
        // the fields the mechanic finder renders (the raw response is huge).
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
                $"&key={ApiKey}";

            var client = _httpFactory.CreateClient();
            var json   = await client.GetStringAsync(url);

            using var doc = JsonDocument.Parse(json);
            var status = doc.RootElement.GetProperty("status").GetString();
            if (status != "OK" && status != "ZERO_RESULTS")
                return StatusCode(StatusCodes.Status502BadGateway, $"Places search failed ({status}).");

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

        // GET: api/navigation/shop-phone?placeId=ChIJ...
        // Phone numbers aren't in the nearby-search payload — fetched lazily
        // when the user taps Call.
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

        // GET: api/navigation/autocomplete?input=diz
        [HttpGet("autocomplete")]
        public async Task<IActionResult> Autocomplete([FromQuery] string input)
        {
            if (string.IsNullOrWhiteSpace(input))
                return BadRequest("input is required.");
            if (string.IsNullOrWhiteSpace(ApiKey))
                return StatusCode(StatusCodes.Status503ServiceUnavailable, "Route service is not configured.");

            var url =
                "https://maps.googleapis.com/maps/api/place/autocomplete/json" +
                $"?input={Uri.EscapeDataString(input)}" +
                "&types=geocode|establishment" +
                $"&key={ApiKey}";

            var client = _httpFactory.CreateClient();
            var json   = await client.GetStringAsync(url);
            return Content(json, "application/json");
        }
    }
}
