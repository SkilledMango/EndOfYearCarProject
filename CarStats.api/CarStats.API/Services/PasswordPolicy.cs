namespace CarStats.API.Services
{
    /// <summary>
    /// ההגדרה היחידה של סיסמה תקינה.
    /// כל מסלול שמגדיר סיסמה — הרשמה, יצירת משתמש בפאנל ושינוי סיסמה —
    /// עובר דרך כאן, ולכן הכלל לא יכול להשתנות בין מסלול למסלול.
    /// האפליקציה משכפלת את הכללים ב-utils/password.ts רק לצורך משוב מיידי;
    /// האכיפה האמיתית היא כאן, כי כל לקוח ניתן לעקיפה.
    /// </summary>
    public static class PasswordPolicy
    {
        public const int MinLength = 8;

        /// <summary>ההודעה שמוצגת למשתמש כשסיסמה נדחית.</summary>
        public const string Requirements =
            "Password must be at least 8 characters and include at least one letter and one number.";

        /// <summary>
        /// אמת כשהסיסמה עומדת בכל הכללים.
        /// במכוון אין אורך מקסימלי ואין דרישה לתווים מיוחדים: האורך הוא מה
        /// שמקשה על ניחוש, ודרישת סימנים מייצרת בעיקר החלפות צפויות.
        /// </summary>
        public static bool IsAcceptable(string? password)
        {
            if (string.IsNullOrWhiteSpace(password)) return false;
            if (password.Length < MinLength) return false;

            // חייבת להכיל לפחות אות אחת ולפחות ספרה אחת
            var hasLetter = false;
            var hasDigit  = false;

            foreach (var ch in password)
            {
                if (char.IsLetter(ch)) hasLetter = true;
                else if (char.IsDigit(ch)) hasDigit = true;

                if (hasLetter && hasDigit) return true;
            }

            return false;
        }
    }
}
