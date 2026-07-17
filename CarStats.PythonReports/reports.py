import os

import matplotlib.pyplot as plt
import pandas as pd

import api_client

# severity number from the server -> readable label + chart color
SEVERITY_INFO = {
    1: ("Green (minor)", "#059669"),
    2: ("Yellow (caution)", "#D97706"),
    3: ("Red (critical)", "#BA1A1A"),
}

EXPORT_DIR = "exports"


# report 1 - table of all users + a chart of how many faults each one logged
def build_users():
    users = api_client.get_users()

    rows = []
    for user in users:
        rows.append({
            "Name": user["fullName"],
            "Email": user["email"],
            "Verified": "Yes" if user["isEmailVerified"] else "No",
            "Vehicles": len(user["vehicles"]),
            "Faults": user["totalFaultsLogged"],
        })
    table = pd.DataFrame(rows)

    figure, ax = plt.subplots(figsize=(8, 4.5))
    ax.bar(table["Name"], table["Faults"], color="#1353D8")
    ax.set_title("Fault Events Logged per User")
    ax.set_ylabel("Faults logged")
    # tilt the names so long ones don't overlap, and fit everything in the figure
    plt.setp(ax.get_xticklabels(), rotation=35, ha="right")
    figure.tight_layout()

    return table, figure


# report 2 - how many vehicles of each make are registered
def build_vehicles():
    users = api_client.get_users()
    vehicles = [v for u in users for v in u["vehicles"]]

    # a set keeps each make only once, so its size is the number of distinct makes
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


# report 3 - fault events split by severity, shown as a pie chart
def build_severity():
    stats = api_client.get_stats()

    # collect (label, count, color) tuples, one per severity
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


# report 4 - the fault codes reported most often
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
    ax.invert_yaxis()
    ax.set_title("Most Reported Fault Codes")
    ax.set_xlabel("Times reported")

    return table, figure


# all four reports in one dictionary - used by both the console and the dashboard
ALL_REPORTS = {
    "Registered Users": build_users,
    "Vehicles by Make": build_vehicles,
    "Faults by Severity": build_severity,
    "Top Fault Codes": build_top_codes,
}


# a short sentence that highlights the most important finding in the data
def insight_from_stats(stats) -> str:
    known = sum(x["count"] for x in stats["severityBreakdown"])   # faults we can classify
    if known == 0:
        return "No fault events have been logged yet."
    critical = sum(x["count"] for x in stats["severityBreakdown"] if x["severity"] == 3)
    percent_critical = round(critical / known * 100)
    top = max(stats["topCodes"], key=lambda x: x["count"])        # most common fault code
    return (f"{percent_critical}% of classified faults are critical. "
            f"Most common problem: {top['title']} ({top['code']}), {top['count']} reports.")


# fetches the stats and returns the insight sentence (used by the console app)
def headline_insight() -> str:
    return insight_from_stats(api_client.get_stats())


# print a report's table in the terminal, then either show the chart or save both to files
def show_in_console(title: str, save: bool = False) -> None:
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


# save all four report tables into one Excel file, each on its own sheet
def save_all_to_excel(path: str = "CarStats_Reports.xlsx") -> str:
    with pd.ExcelWriter(path) as writer:
        for title, build in ALL_REPORTS.items():
            table, figure = build()
            plt.close(figure)                       # only the table goes into Excel
            table.to_excel(writer, sheet_name=title[:31], index=False)
    return path
