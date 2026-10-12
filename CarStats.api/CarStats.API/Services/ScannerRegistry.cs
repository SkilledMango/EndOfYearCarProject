using System.Collections.Concurrent;
using System.Net;

namespace CarStats.API.Services
{
    // איתור: זיווג מתאם לטלפון לפי כתובת IP ציבורית
    public class ScannerRegistry
    {
        private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);

        // כמה מתאמים לכתובת: ספקים סלולריים משתפים כתובת אחת
        private const int MaxPerPublicAddress = 8;

        private record Entry(string DeviceId, string LocalIp, DateTime SeenAt);

        private readonly ConcurrentDictionary<string, List<Entry>> _byPublicIp = new();

        public void Announce(string publicIp, string deviceId, string localIp)
        {
            var list = _byPublicIp.GetOrAdd(publicIp, _ => new List<Entry>());
            lock (list)
            {
                list.RemoveAll(e => e.DeviceId == deviceId || DateTime.UtcNow - e.SeenAt > Lifetime);
                list.Insert(0, new Entry(deviceId, localIp, DateTime.UtcNow));
                if (list.Count > MaxPerPublicAddress) list.RemoveRange(MaxPerPublicAddress, list.Count - MaxPerPublicAddress);
            }
        }

        public List<string> Nearby(string publicIp)
        {
            if (!_byPublicIp.TryGetValue(publicIp, out var list)) return new List<string>();
            lock (list)
            {
                return list.Where(e => DateTime.UtcNow - e.SeenAt <= Lifetime)
                           .Select(e => e.LocalIp)
                           .Distinct()
                           .ToList();
            }
        }

        // רק כתובת פרטית, כך שאי אפשר להפנות את האפליקציה החוצה
        public static bool IsPrivateIPv4(string value)
        {
            if (!IPAddress.TryParse(value, out var ip) || ip.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork)
                return false;
            var b = ip.GetAddressBytes();
            return b[0] == 10
                || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)
                || (b[0] == 192 && b[1] == 168);
        }
    }
}
