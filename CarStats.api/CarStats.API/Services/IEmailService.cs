namespace CarStats.API.Services
{
    public interface IEmailService
    {
        /// <summary>
        /// Sends a verification code to the given address.
        /// Returns true if the provider accepted the message, false otherwise.
        /// </summary>
        Task<bool> SendVerificationCodeAsync(string toEmail, string toName, string code);
    }
}
