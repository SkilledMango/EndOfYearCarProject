
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CarStats.API.Migrations
{
    /// <inheritdoc />
    public partial class FinalizeRelationships : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AppUserId",
                table: "DiagnosticCodes",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_DiagnosticCodes_AppUserId",
                table: "DiagnosticCodes",
                column: "AppUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_DiagnosticCodes_Users_AppUserId",
                table: "DiagnosticCodes",
                column: "AppUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_DiagnosticCodes_Users_AppUserId",
                table: "DiagnosticCodes");

            migrationBuilder.DropIndex(
                name: "IX_DiagnosticCodes_AppUserId",
                table: "DiagnosticCodes");

            migrationBuilder.DropColumn(
                name: "AppUserId",
                table: "DiagnosticCodes");
        }
    }
}
