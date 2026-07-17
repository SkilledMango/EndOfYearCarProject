"""
reports.py — the four admin reports.

Each build_* function fetches data from the server and returns a pair:
(pandas table, matplotlib chart). Who DISPLAYS them is someone else's job —
main.py prints to the console / opens chart windows, dashboard.py shows the
same pair on a web page. One report engine, two user interfaces.

Course data structures used here (marked with comments):
  List, Dictionary, Tuple, Set

External packages: pandas, matplotlib  (pip install pandas matplotlib)
"""

import os

import matplotlib.pyplot as plt
import pandas as pd

import api_client

# Dictionary: severity number from the server → readable label + chart color
SEVERITY_INFO = {
    1: ("Green (minor)", "#059669"),
    2: ("Yellow (caution)", "#D97706"),
    3: ("Red (critical)", "#BA1A1A"),
}

EXPORT_DIR = "exports"


# ─── Report 1: registered users ───────────────────────────────────────────────

def build_users():
    users = api_client.get_users()      # List of Dictionaries from the server

    rows = []                           # List — one dictionary per table row
    for user in users:
        rows.append({
            "Name": user["fullName"],
            "Email": user["email"],
            "Verified": "Yes" if user["isEmailVerified"] else "No",
            "Vehicles": len(user["vehicles"]),
            "Faults": user["totalFaultsLogged"],
        })
    table = pd.DataFrame(rows)

    # Which users actually use the scanner? Faults logged per user.
    figure, ax = plt.subplots(figsize=(8, 4.5))
    ax.bar(table["Name"], table["Faults"], color="#1353D8")
    ax.set_title("Fault Events Logged per User")
    ax.set_ylabel("Faults logged")

    return table, figure


# ─── Report 2: vehicles by make ───────────────────────────────────────────────

def build_vehicles():
    users = api_client.get_users()
    vehicles = [v for u in users for v in u["vehicles"]]    # flatten to one List

    # Set — collects each make only ONCE, so its size = number of distinct makes
    makes: set = {v["make"] for v in vehicles}
    print(f"({len(vehicles)} vehicles from {len(makes)} different makes)")

    df = pd.DataFrame(vehicles)
    table = df.groupby("make").size().reset_index(name="Vehicles")
    table.columns = ["Make", "Vehicles"]

    figure, ax = plt.subplots(figsize=(8, 4.5))
    ax.bar(table["Make"], table["Vehicles"], color="#1353D8")
    ax.set_title("Registered Vehicles by Make")
    ax.set_ylabel("Vehicles")

    return table, figure


# ─── Report 3: faults by severity ─────────────────────────────────────────────

def build_severity():
    stats = api_client.get_stats()

    # Tuple — we collect (label, count, color) triples, one per severity
    slices: list[tuple] = []
    for item in stats["severityBreakdown"]:
        label, color = SEVERITY_INFO[item["severity"]]
        slices.append((label, item["count"], color))

    table = pd.DataFrame(
        [(label, count) for label, count, _ in slices],
        columns=["Severity", "Events"],
    )

    figure, ax = plt.subplots(figsize=(7, 5))
    ax.pie(
        [count for _, count, _ in slices],
        labels=[label for label, _, _ in slices],
        colors=[color for _, _, color in slices],
        autopct="%1.0f%%",
    )
    ax.set_title("Fault Events by Severity")

    return table, figure


# ─── Report 4: most common fault codes ────────────────────────────────────────

def build_top_codes():
    stats = api_client.get_stats()

    rows = [{
        "Code": item["code"],
        "Meaning": item["title"],
        "Times": item["count"],
    } for item in stats["topCodes"]]
    table = pd.DataFrame(rows)

    figure, ax = plt.subplots(figsize=(8, 4.5))
    ax.barh(table["Code"], table["Times"], color="#003FB1")
    ax.invert_yaxis()                   # most common code on top
    ax.set_title("Most Reported Fault Codes")
    ax.set_xlabel("Times reported")

    return table, figure


# All four reports in one Dictionary — used by both user interfaces.
ALL_REPORTS = {
    "Registered Users": build_users,
    "Vehicles by Make": build_vehicles,
    "Faults by Severity": build_severity,
    "Top Fault Codes": build_top_codes,
}


# ─── Console display helper (used by main.py) ─────────────────────────────────

def show_in_console(title: str, save: bool = False) -> None:
    """Builds a report, prints its table; shows the chart or saves both."""
    table, figure = ALL_REPORTS[title]()

    print(f"\n=== {title} ===")
    print(table.to_string(index=False))

    if save:
        os.makedirs(EXPORT_DIR, exist_ok=True)
        name = title.lower().replace(" ", "_")
        table.to_csv(os.path.join(EXPORT_DIR, name + ".csv"), index=False, encoding="utf-8-sig")
        figure.savefig(os.path.join(EXPORT_DIR, name + ".png"), dpi=150, bbox_inches="tight")
        print(f"saved: {name}.csv + {name}.png")
        plt.close(figure)
    else:
        print("(close the chart window to continue)")
        plt.show()
