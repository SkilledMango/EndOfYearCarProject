using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CarStats.API.Migrations
{
    /// <inheritdoc />
    public partial class AddVerificationAttempts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "VerificationAttempts",
                table: "Users",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "VerificationAttempts",
                table: "Users");
        }
    }
}
