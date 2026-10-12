namespace CarStats.API.Services
{
    public interface IEmailService
    {
        Task<bool> SendVerificationCodeAsync(string toEmail, string toName, string code);
    }
}
