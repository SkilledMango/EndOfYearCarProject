namespace CarStats.API.Services
{
    // ממשק שליחת המייל. הבקר תלוי ביכולת לשלוח, לא בספק מסוים,
    // ולכן החלפת ספק נוגעת במחלקה אחת בלבד.
    public interface IEmailService
    {
        /// <summary>
        /// שולח קוד אימות לכתובת הנתונה.
        /// מחזיר אמת אם הספק קיבל את ההודעה, ושקר אחרת.
        /// </summary>
        Task<bool> SendVerificationCodeAsync(string toEmail, string toName, string code);
    }
}
