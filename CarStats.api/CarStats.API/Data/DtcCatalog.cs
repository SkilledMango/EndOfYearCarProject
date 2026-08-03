using CarStats.API.Models;

namespace CarStats.API.Data
{
    /// <summary>
    /// Additional generic OBD-II codes, kept separate from DbSeeder so the
    /// original hand-written set stays readable.
    ///
    /// These are the SAE J2012 generic P0xxx codes a car in Israel is most
    /// likely to actually throw. Manufacturer-specific codes (P1xxx and up)
    /// differ per make and are deliberately not guessed at here — those fall
    /// through to the AI explanation instead.
    ///
    /// Cost ranges are typical Israeli garage prices in shekels, parts and
    /// labour, and are wide on purpose: the same code can mean a ₪50 sensor or
    /// a ₪2000 job depending on the car.
    /// </summary>
    public static class DtcCatalog
    {
        public static List<DiagnosticCode> Codes => new()
        {
            // ── Air / fuel metering ──────────────────────────────────────────
            new() {
                ErrorCode        = "P0102",
                HumanTitle       = "Air Flow Sensor Reading Too Low",
                Description      = "The sensor measuring how much air enters the engine is reporting less than it should. The engine may hesitate, idle roughly, or use more fuel than normal.",
                ActionRequired   = "Often just a dirty sensor. Have it cleaned or replaced within the next couple of weeks.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 80,  EstimatedCostMax = 700,
            },
            new() {
                ErrorCode        = "P0106",
                HumanTitle       = "Manifold Pressure Sensor Out of Range",
                Description      = "The sensor that measures pressure in the intake manifold is giving readings that do not match engine conditions. This can cause poor acceleration and higher fuel use.",
                ActionRequired   = "Book a diagnostic. Usually a sensor or a cracked vacuum hose.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 100, EstimatedCostMax = 600,
            },
            new() {
                ErrorCode        = "P0113",
                HumanTitle       = "Intake Air Temperature Sensor Reading High",
                Description      = "The intake air temperature sensor is reporting an implausibly high value, so the engine computer is guessing at the air temperature. Usually a minor fault.",
                ActionRequired   = "Have the sensor and its wiring checked at your next service.",
                Severity         = SeverityLevel.Green,
                EstimatedCostMin = 60,  EstimatedCostMax = 350,
            },
            new() {
                ErrorCode        = "P0117",
                HumanTitle       = "Coolant Temperature Sensor Reading Low",
                Description      = "The coolant temperature sensor is reporting an impossibly low temperature. The engine may run rich, idle badly, or the cooling fans may behave oddly.",
                ActionRequired   = "Book a repair soon — the engine computer is running on bad temperature data.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 80,  EstimatedCostMax = 400,
            },
            new() {
                ErrorCode        = "P0118",
                HumanTitle       = "Coolant Temperature Sensor Reading High",
                Description      = "The coolant temperature sensor is reporting an impossibly high value. The car may think the engine is overheating when it is not, or fail to warn you when it really is.",
                ActionRequired   = "Book a repair soon, and watch your temperature gauge in the meantime.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 80,  EstimatedCostMax = 400,
            },
            new() {
                ErrorCode        = "P0122",
                HumanTitle       = "Throttle Position Sensor Reading Low",
                Description      = "The sensor tracking your accelerator position is reading lower than it should. You may feel hesitation, surging, or unexpected changes in power.",
                ActionRequired   = "Have this looked at promptly — throttle faults affect how the car responds to you.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 150, EstimatedCostMax = 900,
            },
            new() {
                ErrorCode        = "P0123",
                HumanTitle       = "Throttle Position Sensor Reading High",
                Description      = "The accelerator position sensor is reading higher than it should. The engine may rev unexpectedly or go into a reduced-power limp mode.",
                ActionRequired   = "Have this looked at promptly — throttle faults affect how the car responds to you.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 150, EstimatedCostMax = 900,
            },
            new() {
                ErrorCode        = "P0131",
                HumanTitle       = "Oxygen Sensor Voltage Low",
                Description      = "The oxygen sensor before the catalytic converter is reading persistently low, which usually means a lean mixture or a failing sensor. Fuel economy suffers.",
                ActionRequired   = "Book an inspection within a few weeks. Often the sensor itself.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 200, EstimatedCostMax = 800,
            },
            new() {
                ErrorCode        = "P0133",
                HumanTitle       = "Oxygen Sensor Responding Slowly",
                Description      = "The oxygen sensor is still working but reacting too slowly, so the engine cannot fine-tune its fuel mixture. Expect slightly worse economy and higher emissions.",
                ActionRequired   = "Plan to replace the sensor. Not urgent, but it will fail a test.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 250, EstimatedCostMax = 800,
            },
            new() {
                ErrorCode        = "P0135",
                HumanTitle       = "Oxygen Sensor Heater Faulty",
                Description      = "The heating element inside the oxygen sensor is not working, so the sensor takes too long to start reading accurately after a cold start.",
                ActionRequired   = "Replace the sensor at your next service. It will fail an emissions test as-is.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 250, EstimatedCostMax = 800,
            },
            new() {
                ErrorCode        = "P0141",
                HumanTitle       = "Rear Oxygen Sensor Heater Faulty",
                Description      = "The heater in the oxygen sensor after the catalytic converter has failed. This mainly affects emissions monitoring rather than how the car drives.",
                ActionRequired   = "Replace at your next service. Will fail an emissions test.",
                Severity         = SeverityLevel.Green,
                EstimatedCostMin = 250, EstimatedCostMax = 800,
            },
            new() {
                ErrorCode        = "P0174",
                HumanTitle       = "Engine Running Lean (Bank 2)",
                Description      = "One side of the engine is getting too much air or too little fuel. Common causes are a vacuum leak, a dirty air flow sensor, or a weak fuel pump.",
                ActionRequired   = "Book a diagnostic within a week or two — running lean can damage the engine over time.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 150, EstimatedCostMax = 1200,
            },
            new() {
                ErrorCode        = "P0175",
                HumanTitle       = "Engine Running Rich (Bank 2)",
                Description      = "One side of the engine is burning too much fuel. You may notice a strong fuel smell, black exhaust smoke and poor economy.",
                ActionRequired   = "Book a diagnostic soon — a rich mixture will damage the catalytic converter.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 150, EstimatedCostMax = 1200,
            },
            new() {
                ErrorCode        = "P0087",
                HumanTitle       = "Fuel Pressure Too Low",
                Description      = "Fuel is not reaching the engine at the pressure it needs. The car may struggle under acceleration, lose power, or stall.",
                ActionRequired   = "Do not plan long journeys. Have the fuel filter and pump checked promptly.",
                Severity         = SeverityLevel.Red,
                EstimatedCostMin = 300, EstimatedCostMax = 2500,
            },

            // ── Ignition and misfires ────────────────────────────────────────
            new() {
                ErrorCode        = "P0303",
                HumanTitle       = "Cylinder 3 Misfiring",
                Description      = "The third cylinder is not burning fuel properly. You will usually feel this as a shake at idle and a loss of power.",
                ActionRequired   = "Have it seen quickly. Continued misfiring can destroy the catalytic converter.",
                Severity         = SeverityLevel.Red,
                EstimatedCostMin = 150, EstimatedCostMax = 1500,
            },
            new() {
                ErrorCode        = "P0304",
                HumanTitle       = "Cylinder 4 Misfiring",
                Description      = "The fourth cylinder is not burning fuel properly. You will usually feel this as a shake at idle and a loss of power.",
                ActionRequired   = "Have it seen quickly. Continued misfiring can destroy the catalytic converter.",
                Severity         = SeverityLevel.Red,
                EstimatedCostMin = 150, EstimatedCostMax = 1500,
            },
            new() {
                ErrorCode        = "P0325",
                HumanTitle       = "Knock Sensor Fault",
                Description      = "The sensor that listens for damaging engine knock has failed. To stay safe the engine computer retards the ignition timing, which costs you power and economy.",
                ActionRequired   = "Book a repair. The car is drivable but noticeably less responsive.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 250, EstimatedCostMax = 1200,
            },
            new() {
                ErrorCode        = "P0335",
                HumanTitle       = "Crankshaft Position Sensor Fault",
                Description      = "The engine computer has lost the signal telling it exactly where the crankshaft is. The car may be hard to start, cut out while driving, or not start at all.",
                ActionRequired   = "Have this repaired before driving further — this fault can stall the car without warning.",
                Severity         = SeverityLevel.Red,
                EstimatedCostMin = 250, EstimatedCostMax = 1200,
            },
            new() {
                ErrorCode        = "P0340",
                HumanTitle       = "Camshaft Position Sensor Fault",
                Description      = "The signal telling the engine computer the camshaft position has been lost. Starting may take longer and the engine may run roughly or lose power.",
                ActionRequired   = "Book a repair promptly.",
                Severity         = SeverityLevel.Red,
                EstimatedCostMin = 250, EstimatedCostMax = 1200,
            },
            new() {
                ErrorCode        = "P0351",
                HumanTitle       = "Ignition Coil 1 Fault",
                Description      = "The ignition coil for the first cylinder is not firing correctly, which causes a misfire, rough running and a loss of power.",
                ActionRequired   = "Have it replaced quickly to protect the catalytic converter.",
                Severity         = SeverityLevel.Red,
                EstimatedCostMin = 200, EstimatedCostMax = 900,
            },

            // ── Emissions ────────────────────────────────────────────────────
            new() {
                ErrorCode        = "P0401",
                HumanTitle       = "Exhaust Gas Recirculation Flow Too Low",
                Description      = "The EGR system, which sends some exhaust back through the engine to cut emissions, is not flowing enough. Usually carbon build-up in the valve or passages.",
                ActionRequired   = "Book a clean or replacement. Will fail an emissions test.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 200, EstimatedCostMax = 1500,
            },
            new() {
                ErrorCode        = "P0402",
                HumanTitle       = "Exhaust Gas Recirculation Flow Too High",
                Description      = "Too much exhaust gas is being recirculated, often because the EGR valve is stuck open. The engine may idle roughly or stall at low speeds.",
                ActionRequired   = "Book a repair within a couple of weeks.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 200, EstimatedCostMax = 1500,
            },
            new() {
                ErrorCode        = "P0441",
                HumanTitle       = "Fuel Vapour Purge Flow Incorrect",
                Description      = "The system that recycles petrol vapour from the tank is not flowing correctly. It does not affect how the car drives, but it will fail an emissions test.",
                ActionRequired   = "Have the purge valve checked at your next service.",
                Severity         = SeverityLevel.Green,
                EstimatedCostMin = 150, EstimatedCostMax = 800,
            },
            new() {
                ErrorCode        = "P0446",
                HumanTitle       = "Fuel Vapour Vent Circuit Fault",
                Description      = "The vent valve in the fuel vapour system is not responding as expected. The car drives normally but the emissions system is not sealing properly.",
                ActionRequired   = "Have it checked at your next service.",
                Severity         = SeverityLevel.Green,
                EstimatedCostMin = 150, EstimatedCostMax = 800,
            },
            new() {
                ErrorCode        = "P0456",
                HumanTitle       = "Very Small Fuel Vapour Leak",
                Description      = "A very small leak has been found in the fuel vapour system. By far the most common cause is a fuel cap that is loose, cracked, or has a worn seal.",
                ActionRequired   = "Tighten the fuel cap first. If the light returns after a few drives, have the system smoke-tested.",
                Severity         = SeverityLevel.Green,
                EstimatedCostMin = 10,  EstimatedCostMax = 500,
            },

            // ── Speed, idle and electrical ───────────────────────────────────
            new() {
                ErrorCode        = "P0501",
                HumanTitle       = "Speed Sensor Reading Implausible",
                Description      = "The vehicle speed signal does not match what the car expects. The speedometer, cruise control and automatic gearbox may all behave oddly.",
                ActionRequired   = "Book a repair — this affects the gearbox as well as the speedometer.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 150, EstimatedCostMax = 900,
            },
            new() {
                ErrorCode        = "P0507",
                HumanTitle       = "Idle Speed Higher Than Expected",
                Description      = "The engine is idling faster than it should. The usual cause is a vacuum leak or a dirty throttle body.",
                ActionRequired   = "Have the throttle body cleaned and the vacuum hoses checked.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 100, EstimatedCostMax = 700,
            },
            new() {
                ErrorCode        = "P0521",
                HumanTitle       = "Oil Pressure Sensor Reading Implausible",
                Description      = "The oil pressure sensor is giving readings that do not make sense. This may be a failed sensor — or genuinely low oil pressure, which is serious.",
                ActionRequired   = "Check your oil level now. If it is correct, have the sensor tested before driving further.",
                Severity         = SeverityLevel.Red,
                EstimatedCostMin = 150, EstimatedCostMax = 1000,
            },
            new() {
                ErrorCode        = "P0562",
                HumanTitle       = "Charging System Voltage Low",
                Description      = "The car's electrical system is running at too low a voltage. Usually a failing alternator, a worn drive belt, or a dying battery.",
                ActionRequired   = "Have the battery and alternator tested soon — the car may fail to start.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 200, EstimatedCostMax = 1800,
            },
            new() {
                ErrorCode        = "P0563",
                HumanTitle       = "Charging System Voltage High",
                Description      = "The electrical system is running at too high a voltage, usually a faulty alternator regulator. Sustained overvoltage can damage electronics and boil the battery.",
                ActionRequired   = "Have the charging system tested promptly.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 250, EstimatedCostMax = 1800,
            },

            // ── Transmission ─────────────────────────────────────────────────
            new() {
                ErrorCode        = "P0715",
                HumanTitle       = "Gearbox Input Speed Sensor Fault",
                Description      = "The automatic gearbox has lost the signal telling it how fast its input shaft is turning. Shifts may be harsh, delayed, or the gearbox may lock into one gear.",
                ActionRequired   = "Have this diagnosed before driving far — gearbox faults get expensive if ignored.",
                Severity         = SeverityLevel.Red,
                EstimatedCostMin = 400, EstimatedCostMax = 2500,
            },
            new() {
                ErrorCode        = "P0720",
                HumanTitle       = "Gearbox Output Speed Sensor Fault",
                Description      = "The gearbox cannot read its output speed, so it does not know how fast the car is actually moving. Shift quality and the speedometer may both be affected.",
                ActionRequired   = "Book a gearbox diagnostic promptly.",
                Severity         = SeverityLevel.Red,
                EstimatedCostMin = 400, EstimatedCostMax = 2500,
            },
            new() {
                ErrorCode        = "P0740",
                HumanTitle       = "Torque Converter Clutch Fault",
                Description      = "The lock-up clutch in the automatic gearbox is not engaging properly. You may notice higher revs at motorway speeds and worse fuel economy.",
                ActionRequired   = "Have the gearbox inspected. Fluid condition is often the first thing to check.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 300, EstimatedCostMax = 3500,
            },
            new() {
                ErrorCode        = "P0741",
                HumanTitle       = "Torque Converter Clutch Stuck Off",
                Description      = "The gearbox's lock-up clutch is commanded on but never engages. Fuel economy drops noticeably and the gearbox runs hotter than it should.",
                ActionRequired   = "Book a gearbox service — running hot shortens its life.",
                Severity         = SeverityLevel.Yellow,
                EstimatedCostMin = 300, EstimatedCostMax = 3500,
            },
        };
    }
}
