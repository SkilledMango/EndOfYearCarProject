using System.Text;
using System.Text.Json;

namespace CarStats.API.Services
{
    /// <summary>
    /// שולח את מייל האימות דרך ה-API של Brevo מעל HTTPS.
    /// לא דרך SMTP במכוון: אחסון חינמי חוסם את פורטי ה-SMTP והמייל
    /// פשוט לא היה נשלח.
    ///
    /// ההגדרות יושבות ב-appsettings.Production.json תחת "Brevo":
    /// ApiKey, SenderEmail, SenderName.
    /// </summary>
    public class BrevoEmailService : IEmailService
    {
        private const string BrevoUrl = "https://api.brevo.com/v3/smtp/email";

        private readonly HttpClient _http;
        private readonly IConfiguration _config;
        private readonly ILogger<BrevoEmailService> _logger;

        public BrevoEmailService(HttpClient http, IConfiguration config, ILogger<BrevoEmailService> logger)
        {
            _http   = http;
            _config = config;
            _logger = logger;
        }

        public async Task<bool> SendVerificationCodeAsync(string toEmail, string toName, string code)
        {
            var apiKey      = _config["Brevo:ApiKey"];
            var senderEmail = _config["Brevo:SenderEmail"];
            var senderName  = _config["Brevo:SenderName"] ?? "CarStats";

            // בלי מפתח או כתובת שולח אין מה לשלוח
            if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(senderEmail))
            {
                _logger.LogError("Brevo is not configured — set Brevo:ApiKey and Brevo:SenderEmail.");
                return false;
            }

            // גוף הבקשה בפורמט שהספק מצפה לו
            var payload = new
            {
                sender      = new { name = senderName, email = senderEmail },
                to          = new[] { new { email = toEmail, name = string.IsNullOrWhiteSpace(toName) ? toEmail : toName } },
                subject     = "Your CarStats verification code",
                htmlContent = BuildHtml(code),
            };

            using var req = new HttpRequestMessage(HttpMethod.Post, BrevoUrl);
            req.Headers.Add("api-key", apiKey);
            req.Headers.Add("accept", "application/json");
            req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            // כישלון נרשם ללוג ומוחזר כשקר, ולא נזרק כשגיאה:
            // תקלה אצל ספק המיילים לא אמורה להפיל את ההרשמה כולה
            try
            {
                var res = await _http.SendAsync(req);
                if (res.IsSuccessStatusCode) return true;

                var body = await res.Content.ReadAsStringAsync();
                _logger.LogError("Brevo send failed ({Status}): {Body}", (int)res.StatusCode, body);
                return false;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Brevo request threw while sending to {Email}", toEmail);
                return false;
            }
        }

        // תבנית ה-HTML של המייל שהמשתמש מקבל
        private static string BuildHtml(string code) => $@"
<!DOCTYPE html>
<html>
  <body style='font-family:Segoe UI,Arial,sans-serif;background:#0F0F14;padding:32px;color:#F1F5F9;'>
    <div style='max-width:440px;margin:0 auto;background:#1C1C27;border:1px solid #2A2A38;border-radius:16px;padding:32px;'>
      <h1 style='margin:0 0 8px;font-size:22px;color:#F1F5F9;'>CarStats</h1>
      <p style='color:#94A3B8;font-size:14px;margin:0 0 24px;'>Confirm your email address</p>
      <p style='font-size:14px;color:#F1F5F9;'>Enter this code in the app to finish creating your account:</p>
      <div style='font-size:36px;font-weight:800;letter-spacing:10px;color:#3B82F6;text-align:center;margin:24px 0;'>{code}</div>
      <p style='font-size:12px;color:#94A3B8;'>This code expires in 15 minutes. If you didn't sign up for CarStats, you can ignore this email.</p>
    </div>
  </body>
</html>";
    }
}
