using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using CarStats.API.Data;
using CarStats.API.Models;
using Microsoft.EntityFrameworkCore;

namespace CarStats.API.Services
{
    public class AiService
    {
        private readonly IHttpClientFactory _httpFactory;
        private readonly IConfiguration _config;
        private readonly AppDbContext _db;
        private readonly ILogger<AiService> _log;

        public AiService(IHttpClientFactory httpFactory, IConfiguration config,
                         AppDbContext db, ILogger<AiService> log)
        {
            _httpFactory = httpFactory;
            _config      = config;
            _db          = db;
            _log         = log;
        }

        public enum Failure { None, NoProvider, RateLimited, Unavailable }

        public record AiResult(JsonElement? Json, string Provider, Failure Failure)
        {
            public bool Ok => Json != null;
        }

        private string? GroqKey   => _config["Ai:GroqKey"];
        private string? GeminiKey => _config["Ai:GeminiKey"];
        private string  GroqModel => _config["Ai:GroqModel"] ?? "openai/gpt-oss-120b";

        // איתור: שרשרת ספקי ה-AI - קודם Groq ואז Gemini
        public async Task<AiResult> AskJsonAsync(string prompt, Func<JsonElement, bool> isUsable)
        {
            var providers = new List<(string Name, Func<string, Task<(string? Text, bool RateLimited)>> Ask)>();
            if (!string.IsNullOrWhiteSpace(GroqKey))
                providers.Add(("groq", AskGroqAsync));
            if (!string.IsNullOrWhiteSpace(GeminiKey))
            {
                providers.Add(("gemini-flash-lite", p => AskGeminiAsync("gemini-2.5-flash-lite", p)));
                providers.Add(("gemini-flash",      p => AskGeminiAsync("gemini-2.5-flash", p)));
            }

            if (providers.Count == 0)
                return new AiResult(null, "none", Failure.NoProvider);

            var allRateLimited = true;
            foreach (var (name, ask) in providers)
            {
                try
                {
                    var (text, rateLimited) = await ask(prompt);
                    if (!rateLimited) allRateLimited = false;
                    if (text == null) continue;

                    var json = ExtractJson(text);
                    if (json is JsonElement el && isUsable(el))
                        return new AiResult(el, name, Failure.None);

                    _log.LogWarning("AI provider {Provider} gave an unusable answer", name);
                }
                catch (Exception ex)
                {
                    allRateLimited = false;
                    _log.LogWarning(ex, "AI provider {Provider} failed", name);
                }
            }

            return new AiResult(null, "none", allRateLimited ? Failure.RateLimited : Failure.Unavailable);
        }

        private async Task<(string? Text, bool RateLimited)> AskGroqAsync(string prompt)
        {
            var client = _httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(15);

            using var request = new HttpRequestMessage(HttpMethod.Post,
                "https://api.groq.com/openai/v1/chat/completions");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", GroqKey);
            var body = new Dictionary<string, object>
            {
                ["model"]           = GroqModel,
                ["messages"]        = new[] { new { role = "user", content = prompt } },
                ["temperature"]     = 0,
                ["max_tokens"]      = 600,
                ["response_format"] = new { type = "json_object" },
            };
            // חשיבה קצרה חוסכת טוקנים
            if (GroqModel.StartsWith("openai/gpt-oss"))
                body["reasoning_effort"] = "low";
            request.Content = JsonContent(body);

            using var response = await client.SendAsync(request);
            if ((int)response.StatusCode == 429) return (null, true);
            if (!response.IsSuccessStatusCode)
            {
                _log.LogWarning("Groq returned {Status}", (int)response.StatusCode);
                return (null, false);
            }

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var text = doc.RootElement.GetProperty("choices")[0]
                          .GetProperty("message").GetProperty("content").GetString();
            return (text, false);
        }

        private async Task<(string? Text, bool RateLimited)> AskGeminiAsync(string model, string prompt)
        {
            var client = _httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(15);

            // המפתח בכותרת ולא בכתובת, כדי שלא יופיע בלוגים
            using var request = new HttpRequestMessage(HttpMethod.Post,
                $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent");
            request.Headers.Add("x-goog-api-key", GeminiKey);
            request.Content = JsonContent(new
            {
                contents = new[] { new { parts = new[] { new { text = prompt } } } },
                generationConfig = new
                {
                    temperature = 0,
                    responseMimeType = "application/json",
                    maxOutputTokens = 800,
                },
            });

            using var response = await client.SendAsync(request);

            if ((int)response.StatusCode == 429) return (null, true);
            if (!response.IsSuccessStatusCode)
            {
                _log.LogWarning("Gemini {Model} returned {Status}", model, (int)response.StatusCode);
                return (null, false);
            }

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var text = doc.RootElement.GetProperty("candidates")[0]
                          .GetProperty("content").GetProperty("parts")[0]
                          .GetProperty("text").GetString();
            return (text, false);
        }

        // איתור: מטמון תשובות AI
        public async Task<string?> GetCachedAsync(string key)
        {
            var entry = await _db.AiCache.FindAsync(key);
            return entry?.Value;
        }

        // כישלון בשמירה במטמון לא מפיל את הבקשה
        public async Task SetCachedAsync(string key, string json)
        {
            var entry = await _db.AiCache.FindAsync(key);
            if (entry == null)
            {
                entry = new AiCacheEntry { Key = key, Value = json, CreatedAt = DateTime.UtcNow };
                _db.AiCache.Add(entry);
            }
            else
            {
                entry.Value     = json;
                entry.CreatedAt = DateTime.UtcNow;
            }

            try
            {
                await _db.SaveChangesAsync();
            }
            catch (DbUpdateException ex)
            {
                _log.LogWarning(ex, "Could not cache AI answer for {Key}", key);
                _db.Entry(entry).State = EntityState.Detached;
            }
        }

        private static StringContent JsonContent(object body) =>
            new(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

        // לוקחים רק את אובייקט ה-JSON מתוך התשובה
        private static JsonElement? ExtractJson(string text)
        {
            var open  = text.IndexOf('{');
            var close = text.LastIndexOf('}');
            if (open < 0 || close <= open) return null;
            try
            {
                using var doc = JsonDocument.Parse(text[open..(close + 1)]);
                return doc.RootElement.Clone();
            }
            catch (JsonException)
            {
                return null;
            }
        }
    }
}
