using CarStats.API.Models;

namespace CarStats.API.Data
{
    public static class DbSeeder
    {
        /// <summary>
        /// Seeds the DiagnosticCodes table with real OBD-II codes if it is empty.
        /// Safe to call on every startup — does nothing if data already exists.
        /// </summary>
        public static async Task SeedDiagnosticCodesAsync(AppDbContext context)
        {
            // Only skip if our real codes are already present
        if (context.DiagnosticCodes.Any(d => d.ErrorCode == "P0300")) return;

            var codes = new List<DiagnosticCode>
            {
                // ── GREEN — Minor / Informational ────────────────────────────────────

                new() {
                    ErrorCode        = "P0128",
                    HumanTitle       = "Engine Running Cold",
                    Description      = "Your engine is not reaching its normal operating temperature. This usually means the thermostat is stuck open and needs replacing.",
                    ActionRequired   = "Book a thermostat replacement at your next convenient opportunity.",
                    Severity         = SeverityLevel.Green,
                    EstimatedCostMin = 80,
                    EstimatedCostMax = 250,
                },
                new() {
                    ErrorCode        = "P0442",
                    HumanTitle       = "Small Fuel Vapour Leak",
                    Description      = "A small leak has been detected in the fuel vapour system. The most common cause is a loose or worn gas cap — try tightening it first.",
                    ActionRequired   = "Check your fuel cap is tight. If the light stays on, have the vapour lines inspected.",
                    Severity         = SeverityLevel.Green,
                    EstimatedCostMin = 10,
                    EstimatedCostMax = 150,
                },
                new() {
                    ErrorCode        = "P0420",
                    HumanTitle       = "Catalytic Converter Below Efficiency",
                    Description      = "Your catalytic converter is not cleaning exhaust gases as effectively as it should. The car is still safe to drive short-term but emissions are higher than normal.",
                    ActionRequired   = "Schedule an inspection within the next few weeks. May require a new catalytic converter.",
                    Severity         = SeverityLevel.Green,
                    EstimatedCostMin = 200,
                    EstimatedCostMax = 1200,
                },

                // ── YELLOW — Warning, check soon ─────────────────────────────────────

                new() {
                    ErrorCode        = "P0101",
                    HumanTitle       = "Air Flow Sensor Struggling",
                    Description      = "The mass air flow sensor is reporting inconsistent readings. Your engine may feel sluggish or use more fuel than usual.",
                    ActionRequired   = "Have the MAF sensor cleaned or replaced. Avoid extended highway driving until resolved.",
                    Severity         = SeverityLevel.Yellow,
                    EstimatedCostMin = 150,
                    EstimatedCostMax = 400,
                },
                new() {
                    ErrorCode        = "P0110",
                    HumanTitle       = "Intake Air Temperature Sensor Fault",
                    Description      = "The sensor that measures incoming air temperature has a wiring or circuit problem. Your engine may run slightly rough or use more fuel.",
                    ActionRequired   = "Have the sensor and its wiring inspected. Usually a straightforward repair.",
                    Severity         = SeverityLevel.Yellow,
                    EstimatedCostMin = 100,
                    EstimatedCostMax = 300,
                },
                new() {
                    ErrorCode        = "P0120",
                    HumanTitle       = "Throttle Position Sensor Fault",
                    Description      = "The throttle position sensor is not responding correctly. You may notice hesitation when accelerating or an unstable idle.",
                    ActionRequired   = "Avoid aggressive acceleration. Have the throttle sensor inspected or replaced promptly.",
                    Severity         = SeverityLevel.Yellow,
                    EstimatedCostMin = 150,
                    EstimatedCostMax = 500,
                },
                new() {
                    ErrorCode        = "P0171",
                    HumanTitle       = "Engine Running Lean",
                    Description      = "Your engine is getting too much air and not enough fuel. Common causes include a vacuum leak, dirty fuel injectors, or a weak fuel pump.",
                    ActionRequired   = "Have the fuel system and air intake inspected. Can worsen over time if ignored.",
                    Severity         = SeverityLevel.Yellow,
                    EstimatedCostMin = 100,
                    EstimatedCostMax = 400,
                },
                new() {
                    ErrorCode        = "P0172",
                    HumanTitle       = "Engine Running Rich",
                    Description      = "Your engine is burning too much fuel. This wastes petrol and can damage the catalytic converter over time. You may smell fuel from the exhaust.",
                    ActionRequired   = "Have the oxygen sensors and fuel injectors checked soon.",
                    Severity         = SeverityLevel.Yellow,
                    EstimatedCostMin = 100,
                    EstimatedCostMax = 350,
                },
                new() {
                    ErrorCode        = "P0440",
                    HumanTitle       = "Fuel Vapour System Fault",
                    Description      = "The evaporative emission system, which captures fuel vapours, is not working correctly. This will not affect drivability but increases harmful emissions.",
                    ActionRequired   = "Have the charcoal canister and vapour lines inspected at your next service.",
                    Severity         = SeverityLevel.Yellow,
                    EstimatedCostMin = 100,
                    EstimatedCostMax = 600,
                },
                new() {
                    ErrorCode        = "P0455",
                    HumanTitle       = "Large Fuel Vapour Leak",
                    Description      = "A significant leak has been detected in the fuel vapour system. Unlike a small leak, this likely requires more than just tightening the fuel cap.",
                    ActionRequired   = "Have the evaporative system inspected. Check the fuel cap first, but expect a component replacement.",
                    Severity         = SeverityLevel.Yellow,
                    EstimatedCostMin = 150,
                    EstimatedCostMax = 500,
                },
                new() {
                    ErrorCode        = "P0500",
                    HumanTitle       = "Vehicle Speed Sensor Fault",
                    Description      = "The speed sensor is sending incorrect or no data. Your speedometer may read incorrectly and cruise control may not work.",
                    ActionRequired   = "Avoid using cruise control. Have the speed sensor inspected and replaced.",
                    Severity         = SeverityLevel.Yellow,
                    EstimatedCostMin = 150,
                    EstimatedCostMax = 500,
                },
                new() {
                    ErrorCode        = "P0505",
                    HumanTitle       = "Idle Control System Fault",
                    Description      = "The system that controls engine idling is not functioning correctly. Your engine may idle too high, too low, or hunt up and down.",
                    ActionRequired   = "Have the idle air control valve and throttle body cleaned or replaced.",
                    Severity         = SeverityLevel.Yellow,
                    EstimatedCostMin = 100,
                    EstimatedCostMax = 400,
                },
                new() {
                    ErrorCode        = "P0430",
                    HumanTitle       = "Catalytic Converter Failing (Bank 2)",
                    Description      = "The second catalytic converter on your engine is operating below the required efficiency threshold. Emissions are elevated.",
                    ActionRequired   = "Schedule a service appointment. Continued driving will worsen emissions but is not immediately dangerous.",
                    Severity         = SeverityLevel.Yellow,
                    EstimatedCostMin = 200,
                    EstimatedCostMax = 1200,
                },

                // ── RED — Critical, stop safely ──────────────────────────────────────

                new() {
                    ErrorCode        = "P0300",
                    HumanTitle       = "Engine Misfiring on Multiple Cylinders",
                    Description      = "Two or more cylinders are misfiring randomly. This causes a noticeable shaking or stumbling while driving and can seriously damage your engine and catalytic converter if ignored.",
                    ActionRequired   = "Stop driving as soon as safely possible and arrange a tow or mechanic visit. Do not ignore this code.",
                    Severity         = SeverityLevel.Red,
                    EstimatedCostMin = 200,
                    EstimatedCostMax = 800,
                },
                new() {
                    ErrorCode        = "P0301",
                    HumanTitle       = "Cylinder 1 Misfire Detected",
                    Description      = "Cylinder 1 is misfiring, meaning it is not igniting fuel correctly. You will feel the engine shake or shudder, especially at low speed.",
                    ActionRequired   = "Reduce speed and avoid high revs. Have spark plugs, ignition coils, and injectors checked immediately.",
                    Severity         = SeverityLevel.Red,
                    EstimatedCostMin = 150,
                    EstimatedCostMax = 600,
                },
                new() {
                    ErrorCode        = "P0302",
                    HumanTitle       = "Cylinder 2 Misfire Detected",
                    Description      = "Cylinder 2 is not firing correctly. Continued driving risks damaging the catalytic converter and the engine itself.",
                    ActionRequired   = "Reduce speed and avoid high revs. Have spark plugs, ignition coils, and injectors checked immediately.",
                    Severity         = SeverityLevel.Red,
                    EstimatedCostMin = 150,
                    EstimatedCostMax = 600,
                },
                new() {
                    ErrorCode        = "P0700",
                    HumanTitle       = "Transmission System Fault",
                    Description      = "The transmission control module has detected a serious fault. You may experience rough gear changes, the car getting stuck in one gear, or sluggish acceleration.",
                    ActionRequired   = "Avoid high-speed driving. Have the vehicle towed to a mechanic for a full transmission diagnostic immediately.",
                    Severity         = SeverityLevel.Red,
                    EstimatedCostMin = 500,
                    EstimatedCostMax = 2500,
                },
                new() {
                    ErrorCode        = "P0730",
                    HumanTitle       = "Incorrect Gear Ratio",
                    Description      = "The transmission is not shifting into the correct gear. This can cause the engine to over-rev, overheat, and suffer serious damage under load.",
                    ActionRequired   = "Avoid motorway speeds. Have the transmission inspected by a specialist as soon as possible.",
                    Severity         = SeverityLevel.Red,
                    EstimatedCostMin = 200,
                    EstimatedCostMax = 1500,
                },
                new() {
                    ErrorCode        = "C0035",
                    HumanTitle       = "Front Left Wheel Speed Sensor Fault",
                    Description      = "The ABS and traction control systems are receiving no signal from the front left wheel. Your ABS and stability control will not function in an emergency stop.",
                    ActionRequired   = "Drive cautiously — braking distances may be longer. Have the wheel speed sensor replaced immediately.",
                    Severity         = SeverityLevel.Red,
                    EstimatedCostMin = 150,
                    EstimatedCostMax = 400,
                },
                new() {
                    ErrorCode        = "U0100",
                    HumanTitle       = "Lost Communication with Engine Computer",
                    Description      = "The main engine control module (ECM) has stopped communicating with other systems in the car. Multiple warning lights may be on and engine behaviour may be unpredictable.",
                    ActionRequired   = "Do not continue driving. Have the vehicle recovered and diagnosed by a mechanic immediately.",
                    Severity         = SeverityLevel.Red,
                    EstimatedCostMin = 200,
                    EstimatedCostMax = 1500,
                },
            };

            context.DiagnosticCodes.AddRange(codes);
            await context.SaveChangesAsync();

            Console.WriteLine($"[DbSeeder] Seeded {codes.Count} OBD-II diagnostic codes.");
        }
    }
}
