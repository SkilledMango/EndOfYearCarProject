using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CarStats.API.Migrations
{
    /// <inheritdoc />
    public partial class ConnectVehicleEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "RawErrorCode",
                table: "VehicleEvents",
                type: "nvarchar(max)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(10)",
                oldMaxLength: 10);

            migrationBuilder.AddColumn<int>(
                name: "AppUserId",
                table: "VehicleEvents",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_VehicleEvents_AppUserId",
                table: "VehicleEvents",
                column: "AppUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_VehicleEvents_Users_AppUserId",
                table: "VehicleEvents",
                column: "AppUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_VehicleEvents_Users_AppUserId",
                table: "VehicleEvents");

            migrationBuilder.DropIndex(
                name: "IX_VehicleEvents_AppUserId",
                table: "VehicleEvents");

            migrationBuilder.DropColumn(
                name: "AppUserId",
                table: "VehicleEvents");

            migrationBuilder.AlterColumn<string>(
                name: "RawErrorCode",
                table: "VehicleEvents",
                type: "nvarchar(10)",
                maxLength: 10,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");
        }
    }
}
