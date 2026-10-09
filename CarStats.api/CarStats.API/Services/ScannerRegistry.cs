using System.Collections.Concurrent;
using System.Net;

namespace CarStats.API.Services
{
    /// <summary>
    /// איפה כל מתאם נמצא ברשת המקומית שלו — כדי שהאפליקציה תמצא אותו לבד.
    ///
    /// המתאם מתחבר לנקודת הגישה של הטלפון ויוצא לאינטרנט דרכו, ולכן השרת
    /// רואה את שניהם מאותה כתובת ציבורית. המתאם מדווח "אני ב-10.56.150.100",
    /// והאפליקציה שואלת "מה דווח מהכתובת הציבורית שלי?". זו אותה שיטה שבה
    /// Philips Hue מוצאת את הגשר שלה.
    ///
    /// נשמר בזיכרון בלבד: המתאם מדווח שוב כל דקה, כך שאתחול של השרת לא מאבד כלום.
    /// </summary>
    public class ScannerRegistry
    {
        /// <summary>דיווח ישן מזה נחשב למתאם שכבר לא שם.</summary>
        private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);

        /// <summary>
        /// כמה מתאמים לשמור לכל כתובת ציבורית. ספקים סלולריים משתפים כתובת אחת
        /// בין לקוחות רבים, ולכן ייתכנו כמה — האפליקציה בודקת כל אחד ומוצאת את שלה.
        /// </summary>
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

        /// <summary>הכתובות המקומיות שדווחו מהכתובת הציבורית הזו, מהחדשה לישנה.</summary>
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

        /// <summary>
        /// רק כתובת IPv4 פרטית (10.x, 172.16–31.x, 192.168.x) — מתאם אמיתי תמיד
        /// יושב ברשת כזו, וכך אי אפשר להשתמש ברשימה כדי לשלוח את האפליקציה לכתובת חיצונית.
        /// </summary>
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
