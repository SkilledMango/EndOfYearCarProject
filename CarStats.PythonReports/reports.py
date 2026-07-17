"""
reports.py — the four admin reports: each one is a single function that
prints a table (pandas) and, where it makes sense, shows a graph
(matplotlib). With save=True it writes the table to a CSV file and the
graph to a PNG file inside ./exports instead of showing a window.

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


def _finish(df: pd.DataFrame, title: str, figure, save: bool) -> None:
    """Every report ends here: print the table, then show or save."""
    print(f"\n=== {title} ===")
    print(df.to_string(index=False))

    if save:
        os.makedirs(EXPORT_DIR, exist_ok=True)
        name = title.lower().replace(" ", "_")
        df.to_csv(os.path.join(EXPORT_DIR, name + ".csv"), index=False, encoding="utf-8-sig")
        print("saved:", os.path.join(EXPORT_DIR, name + ".csv"))
        if figure is not None:
            figure.savefig(os.path.join(EXPORT_DIR, name + ".png"), dpi=150, bbox_inches="tight")
            print("saved:", os.path.join(EXPORT_DIR, name + ".png"))
            plt.close(figure)
    elif figure is not None:
        print("(close the chart window to continue)")
        plt.show()


# ─── Report 1: registered users (table only) ─────────────────────────────────

def report_users(save: bool = False) -> None:
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

    _finish(pd.DataFrame(rows), "Registered Users", None, save)


# ─── Report 2: vehicles by make (table + bar chart) ──────────────────────────

def report_vehicles(save: bool = False) -> None:
    users = api_client.get_users()
    vehicles = [v for u in users for v in u["vehicles"]]    # flatten to one List

    # Set — collects each make only ONCE, so its size = number of distinct makes
    makes: set = {v["make"] for v in vehicles}
    print(f"\n{len(vehicles)} vehicles from {len(makes)} different makes")

    df = pd.DataFrame(vehicles)
    table = df.groupby("make").size().reset_index(name="Vehicles")
    table.columns = ["Make", "Vehicles"]

    figure, ax = plt.subplots(figsize=(8, 4.5))
    ax.bar(table["Make"], table["Vehicles"], color="#1353D8")
    ax.set_title("Registered Vehicles by Make")
    ax.set_ylabel("Vehicles")

    _finish(table, "Vehicles by Make", figure, save)


# ─── Report 3: faults by severity (table + pie chart) ────────────────────────

def report_severity(save: bool = False) -> None:
    stats = api_client.get_stats()

    # Tuple — we collect (label, count, color) triples, one per severity
    slices: list[tuple] = []
    for item in stats["severityBreakdown"]:
        label, color = SEVERITY_INFO[item["severity"]]
        slices.append((label, item["count"], color))

    table = pd.DataFrame(slices, columns=["Severity", "Events", "Color"])[["Severity", "Events"]]

    figure, ax = plt.subplots(figsize=(7, 5))
    ax.pie(
        [count for _, count, _ in slices],
        labels=[label for label, _, _ in slices],
        colors=[color for _, _, color in slices],
        autopct="%1.0f%%",
    )
    ax.set_title("Fault Events by Severity")

    _finish(table, "Faults by Severity", figure, save)


# ─── Report 4: most common fault codes (table + bar chart) ───────────────────

def report_top_codes(save: bool = False) -> None:
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

    _finish(table, "Top Fault Codes", figure, save)
