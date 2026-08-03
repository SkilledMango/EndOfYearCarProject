namespace CarStats.API.Services
{
    /// <summary>
    /// The single definition of what counts as an acceptable password.
    ///
    /// Every path that sets a password goes through here — registration, admin
    /// user creation, and admin password changes — so the rule cannot drift
    /// between them. The mobile app mirrors these rules in utils/password.ts
    /// for immediate feedback, but this is the gate that actually enforces
    /// them: a client can always be bypassed.
    /// </summary>
    public static class PasswordPolicy
    {
        public const int MinLength = 8;

        /// <summary>Message shown to the user when a password is rejected.</summary>
        public const string Requirements =
            "Password must be at least 8 characters and include at least one letter and one number.";

        /// <summary>
        /// True when the password satisfies every rule.
        ///
        /// Deliberately no maximum length and no required symbols: length is
        /// what makes a password hard to guess, and forcing symbols mostly
        /// produces predictable substitutions rather than stronger secrets.
        /// BCrypt handles whatever is passed in.
        /// </summary>
        public static bool IsAcceptable(string? password)
        {
            if (string.IsNullOrWhiteSpace(password)) return false;
            if (password.Length < MinLength) return false;

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
