using System.Text.RegularExpressions;
using CarStats.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CarStats.API.Controllers
{
    public class ScannerAnnounceRequest
    {
        public string DeviceId { get; set; } = string.Empty;   // כתובת ה-MAC של המתאם
        public string LocalIp { get; set; } = string.Empty;    // הכתובת שלו בנקודת הגישה
    }

    // גילוי אוטומטי של המתאם: המתאם מדווח איפה הוא, האפליקציה שואלת. ראו ScannerRegistry.
    [Route("api/[controller]")]
    [ApiController]
    public class ScannerController : ControllerBase
    {
        private static readonly Regex DeviceIdPattern = new("^[0-9A-Fa-f:]{12,17}$");

        private readonly ScannerRegistry _registry;

        public ScannerController(ScannerRegistry registry)
        {
            _registry = registry;
        }

        // POST: api/scanner/announce — נקרא מהמתאם עצמו, שאין לו חשבון משתמש
        [HttpPost("announce")]
        [AllowAnonymous]
        public IActionResult Announce([FromBody] ScannerAnnounceRequest request)
        {
            var deviceId = request.DeviceId ?? "";
            var localIp  = request.LocalIp ?? "";
            if (!DeviceIdPattern.IsMatch(deviceId) || !ScannerRegistry.IsPrivateIPv4(localIp))
                return BadRequest();

            var publicIp = CallerPublicIp();
            if (publicIp == null) return BadRequest();

            _registry.Announce(publicIp, deviceId.ToUpperInvariant(), localIp);
            return Ok(new { ok = true });
        }

        // GET: api/scanner/nearby — האפליקציה: "איזה מתאם דיווח מהרשת שלי?"
        [HttpGet("nearby")]
        [Authorize]
        public IActionResult Nearby()
        {
            var publicIp = CallerPublicIp();
            return Ok(new { addresses = publicIp == null ? new List<string>() : _registry.Nearby(publicIp) });
        }

        private string? CallerPublicIp()
        {
            var ip = HttpContext.Connection.RemoteIpAddress;
            if (ip == null) return null;
            // IPv4 שמגיע עטוף כ-IPv6 (::ffff:1.2.3.4) — כדי ששני הצדדים ייראו אותו דבר
            return (ip.IsIPv4MappedToIPv6 ? ip.MapToIPv4() : ip).ToString();
        }
    }
}
