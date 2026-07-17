"""
CarStats — Admin Reports (Python end-of-year assignment, Alternative A).

Statistical reports about our final project (the CarStats car-diagnostics
app): tables with pandas, graphs with matplotlib, data pulled live from
the project's real server after an admin login.

Run with:  python main.py
"""

import sys

# Windows terminals sometimes use an old encoding — switch to UTF-8 so the
# table borders print correctly.
sys.stdout.reconfigure(encoding="utf-8")

import api_client
import reports


def main() -> None:
    print("========================================")
    print("   CarStats - Admin Statistical Reports")
    print("========================================")

    # ── Admin login (the server rejects non-admin accounts) ──
    email = input("Admin email: ")
    password = input("Password: ")
    if not api_client.login(email, password):
        print("Login failed.")
        return

    # ── Menu loop ──
    while True:
        print("\nReports:")
        print("  1. Registered users (table)")
        print("  2. Vehicles by make (table + bar chart)")
        print("  3. Faults by severity (table + pie chart)")
        print("  4. Top fault codes (table + bar chart)")
        print("  5. Save ALL reports to files (CSV + PNG)")
        print("  0. Exit")
        choice = input("Choose: ").strip()

        if choice == "1":
            reports.report_users()
        elif choice == "2":
            reports.report_vehicles()
        elif choice == "3":
            reports.report_severity()
        elif choice == "4":
            reports.report_top_codes()
        elif choice == "5":
            reports.report_users(save=True)
            reports.report_vehicles(save=True)
            reports.report_severity(save=True)
            reports.report_top_codes(save=True)
            print("\nAll reports saved to the 'exports' folder.")
        elif choice == "0":
            print("Bye!")
            return
        else:
            print("Unknown option.")


if __name__ == "__main__":
    main()
