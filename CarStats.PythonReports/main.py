import sys

# windows terminals sometimes use an old encoding - switch to utf-8 for the table borders
sys.stdout.reconfigure(encoding="utf-8")

import api_client
import reports


# log in, then show a menu and run the report the user picks
def main() -> None:
    print("========================================")
    print("   CarStats - Admin Statistical Reports")
    print("========================================")

    email = input("Admin email: ")
    password = input("Password: ")
    if not api_client.login(email, password):
        print("Login failed.")
        return

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
            reports.show_in_console("Registered Users")
        elif choice == "2":
            reports.show_in_console("Vehicles by Make")
        elif choice == "3":
            reports.show_in_console("Faults by Severity")
        elif choice == "4":
            reports.show_in_console("Top Fault Codes")
        elif choice == "5":
            for title in reports.ALL_REPORTS:
                reports.show_in_console(title, save=True)
            print("\nAll reports saved to the 'exports' folder.")
        elif choice == "0":
            print("Bye!")
            return
        else:
            print("Unknown option.")


if __name__ == "__main__":
    main()
