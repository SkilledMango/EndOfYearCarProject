"""
CarStats Admin Reports — Python end-of-year assignment (Alternative A).

Statistical reports for the CarStats final project, shown as tables
(pandas) and graphs (matplotlib), pulled live from the project's real
REST API with a JWT admin login.

Interactive use:
    python main.py                     # menu + login prompt (production API)
    python main.py --api http://localhost:5279/api

Non-interactive use (e.g. to regenerate all files before a presentation):
    python main.py --export-all --email admin@x.com --password ****
"""

import argparse
import getpass
import sys

# Windows consoles often default to a legacy encoding (cp1252) that cannot
# print the table borders and the ₪ sign — force UTF-8 for our output.
sys.stdout.reconfigure(encoding="utf-8")

import matplotlib.pyplot as plt
from tabulate import tabulate

import charts
import exporter
import reports
from api_client import CarStatsClient, DEFAULT_BASE_URL


# ─── Pretty printing ──────────────────────────────────────────────────────────

def print_table(df, title: str) -> None:
    """Prints a DataFrame as a framed console table."""
    print(f"\n=== {title} ===")
    if df.empty:
        print("(no data yet)")
    else:
        print(tabulate(df, headers="keys", tablefmt="rounded_grid", showindex=False))


# ─── Report actions ───────────────────────────────────────────────────────────
# Each action fetches fresh data, prints the table, and returns an optional
# (figure, export_name) tuple so the caller decides to show or save it.

def report_summary(client: CarStatsClient):
    stats = client.get_stats()
    print_table(reports.build_totals(stats), "CarStats — Headline Numbers")
    return None


def report_users(client: CarStatsClient):
    users = client.get_users()
    print_table(reports.build_users_table(users), "Registered Users")
    return None


def report_vehicles(client: CarStatsClient):
    users = client.get_users()
    table = reports.build_vehicles_by_make(users)
    print_table(table, "Vehicles by Make")
    if table.empty:
        return None
    return (charts.chart_vehicles_by_make(table), "vehicles_by_make")


def report_fuel(client: CarStatsClient):
    users = client.get_users()
    table = reports.build_vehicles_by_make(users)
    print_table(table, "Fuel Consumption by Make")
    if table.empty:
        return None
    return (charts.chart_fuel_by_make(table), "fuel_by_make")


def report_severity(client: CarStatsClient):
    stats = client.get_stats()
    table = reports.build_severity_breakdown(stats)
    print_table(table, "Fault Events by Severity")
    if table.empty:
        return None
    return (charts.chart_severity_breakdown(table), "severity_breakdown")


def report_top_codes(client: CarStatsClient):
    stats = client.get_stats()
    table = reports.build_top_codes(stats)
    print_table(table, "Most Reported Fault Codes")
    if table.empty:
        return None
    return (charts.chart_top_codes(table), "top_fault_codes")


def report_faults_per_day(client: CarStatsClient):
    stats = client.get_stats()
    table = reports.build_faults_per_day(stats)
    print_table(table, "Fault Events per Day (last 14 days)")
    if table.empty:
        return None
    return (charts.chart_faults_per_day(table), "faults_per_day")


def report_dtc_costs(client: CarStatsClient):
    dtc_rows = client.get_dtc_dictionary()
    print_table(reports.build_dtc_dictionary_stats(dtc_rows), "Repair Cost Ranges per Severity")
    return None


# The menu itself is a Dictionary: choice → (label, action function).
MENU: dict[str, tuple[str, callable]] = {
    "1": ("Headline numbers (users / vehicles / faults)", report_summary),
    "2": ("Registered users table", report_users),
    "3": ("Vehicles by make (table + bar chart)", report_vehicles),
    "4": ("Fuel consumption by make (table + bar chart)", report_fuel),
    "5": ("Fault severity breakdown (table + pie chart)", report_severity),
    "6": ("Top fault codes (table + bar chart)", report_top_codes),
    "7": ("Faults per day, last 14 days (table + line chart)", report_faults_per_day),
    "8": ("Repair cost ranges per severity (table)", report_dtc_costs),
}

# Reports included in "export everything" (table producers + chart producers)
EXPORTABLE = {
    "users":               (report_users, "registered_users"),
    "vehicles_by_make":    (report_vehicles, "vehicles_by_make"),
    "fuel_by_make":        (report_fuel, "fuel_by_make"),
    "severity_breakdown":  (report_severity, "severity_breakdown"),
    "top_fault_codes":     (report_top_codes, "top_fault_codes"),
    "faults_per_day":      (report_faults_per_day, "faults_per_day"),
}


# ─── Export-all (also used by the --export-all CLI mode) ──────────────────────

def export_everything(client: CarStatsClient) -> None:
    """Regenerates every table (CSV) and chart (PNG) under ./exports/."""
    users = client.get_users()
    stats = client.get_stats()
    dtc   = client.get_dtc_dictionary()

    tables = {
        "registered_users":   reports.build_users_table(users),
        "vehicles_by_make":   reports.build_vehicles_by_make(users),
        "severity_breakdown": reports.build_severity_breakdown(stats),
        "top_fault_codes":    reports.build_top_codes(stats),
        "faults_per_day":     reports.build_faults_per_day(stats),
        "repair_cost_ranges": reports.build_dtc_dictionary_stats(dtc),
    }
    for name, df in tables.items():
        if not df.empty:
            print("saved", exporter.save_table(df, name))

    chart_builders = {
        "vehicles_by_make":   charts.chart_vehicles_by_make(tables["vehicles_by_make"]),
        "fuel_by_make":       charts.chart_fuel_by_make(tables["vehicles_by_make"]),
        "severity_breakdown": charts.chart_severity_breakdown(tables["severity_breakdown"]),
        "top_fault_codes":    charts.chart_top_codes(tables["top_fault_codes"]),
        "faults_per_day":     charts.chart_faults_per_day(tables["faults_per_day"]),
    }
    for name, figure in chart_builders.items():
        print("saved", exporter.save_chart(figure, name))
        plt.close(figure)


# ─── Entry point ──────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="CarStats admin statistical reports")
    parser.add_argument("--api", default=DEFAULT_BASE_URL, help="API base URL")
    parser.add_argument("--email", help="admin email (otherwise prompted)")
    parser.add_argument("--password", help="admin password (otherwise prompted)")
    parser.add_argument("--export-all", action="store_true",
                        help="export every report to ./exports and exit (no menu)")
    args = parser.parse_args()

    print("──────────────────────────────────────────")
    print("  CarStats — Admin Statistical Reports")
    print("──────────────────────────────────────────")
    print(f"API: {args.api}")

    client = CarStatsClient(args.api)
    email    = args.email or input("Admin email: ")
    password = args.password or getpass.getpass("Password: ")

    print("Logging in…")
    if not client.login(email, password):
        print("Login failed — check the credentials (admin account required).")
        return 1
    print(f"Welcome, {client.admin_name}!")

    if args.export_all:
        export_everything(client)
        print(f"\nAll reports exported to: {exporter.ensure_export_dir()}")
        return 0

    # ── Interactive menu loop ──
    while True:
        print("\nAvailable reports:")
        for key, (label, _) in MENU.items():
            print(f"  {key}. {label}")
        print("  9. Export ALL reports to files (CSV + PNG)")
        print("  0. Exit")

        choice = input("Choose: ").strip()
        if choice == "0":
            print("Bye!")
            return 0
        if choice == "9":
            export_everything(client)
            print(f"\nAll reports exported to: {exporter.ensure_export_dir()}")
            continue
        if choice not in MENU:
            print("Unknown option.")
            continue

        label, action = MENU[choice]
        try:
            result = action(client)
        except Exception as err:            # keep the menu alive on API hiccups
            print(f"Could not build the report: {err}")
            continue

        if result is not None:
            figure, _name = result
            print("(close the chart window to return to the menu)")
            plt.show()


if __name__ == "__main__":
    sys.exit(main())
