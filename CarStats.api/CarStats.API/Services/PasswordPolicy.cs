namespace CarStats.API.Services
{
    // איתור: חוקי סיסמה (שרת)
    public static class PasswordPolicy
    {
        public const int MinLength = 8;

        public const string Requirements =
            "Password must be at least 8 characters and include at least one letter and one number.";

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
