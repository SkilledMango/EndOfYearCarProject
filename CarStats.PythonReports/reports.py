"""
reports.py — turns raw API data into pandas DataFrames (the "tables" half
of the assignment).

Each build_* function returns a DataFrame ready to print or export.
This module deliberately exercises the course data structures:

  * List        — the API returns JSON arrays → Python lists of records
  * Dictionary  — every record is a dict; we also build lookup dicts
  * Tuple       — (label, value) pairs collected before building DataFrames
  * Set         — used to count DISTINCT things (e.g. car makes, fault codes)

External package used: pandas (pip install pandas)
"""

import pandas as pd

# Maps the API's numeric severity to a readable label.
SEVERITY_LABELS: dict[int, str] = {1: "Green (minor)", 2: "Yellow (caution)", 3: "Red (critical)"}

ROLE_LABELS: dict[int, str] = {1: "User", 2: "Admin", 3: "SuperAdmin"}


def build_users_table(users: list[dict]) -> pd.DataFrame:
    """Overview of every registered user."""
    rows = []                                   # List of dicts → DataFrame rows
    for user in users:
        rows.append({
            "Name": user["fullName"],
            "Email": user["email"],
            "Role": ROLE_LABELS.get(user["role"], "?"),
            "Verified": "Yes" if user["isEmailVerified"] else "No",
            "Premium": "Yes" if user["isPremiumMember"] else "No",
            "Vehicles": len(user.get("vehicles") or []),
            "Faults logged": user["totalFaultsLogged"],
        })
    return pd.DataFrame(rows)


def build_vehicles_by_make(users: list[dict]) -> pd.DataFrame:
    """How many vehicles of each make are registered, and their average fuel use."""
    all_vehicles = [v for u in users for v in (u.get("vehicles") or [])]

    # A Set gives us the number of DISTINCT makes in one line.
    distinct_makes: set[str] = {v["make"] for v in all_vehicles}
    print(f"  ({len(all_vehicles)} vehicles, {len(distinct_makes)} distinct makes)")

    if not all_vehicles:
        return pd.DataFrame(columns=["Make", "Vehicles", "Avg L/100km"])

    df = pd.DataFrame(all_vehicles)
    grouped = df.groupby("make").agg(
        Vehicles=("id", "count"),
        Avg_L_100km=("averageFuelConsumption", "mean"),
    ).reset_index()
    grouped.columns = ["Make", "Vehicles", "Avg L/100km"]
    grouped["Avg L/100km"] = grouped["Avg L/100km"].round(1)
    return grouped.sort_values("Vehicles", ascending=False).reset_index(drop=True)


def build_severity_breakdown(stats: dict) -> pd.DataFrame:
    """Fault events grouped by severity level (from the server aggregates)."""
    # Collect (label, count) Tuples first, then build the frame.
    pairs: list[tuple[str, int]] = [
        (SEVERITY_LABELS.get(item["severity"], "Unknown"), item["count"])
        for item in stats.get("severityBreakdown", [])
    ]
    return pd.DataFrame(pairs, columns=["Severity", "Events"])


def build_top_codes(stats: dict) -> pd.DataFrame:
    """The most frequently reported fault codes."""
    rows = [{
        "Code": item["code"],
        "Meaning": item["title"],
        "Severity": SEVERITY_LABELS.get(item.get("severity"), "Unknown"),
        "Times reported": item["count"],
    } for item in stats.get("topCodes", [])]
    return pd.DataFrame(rows)


def build_faults_per_day(stats: dict) -> pd.DataFrame:
    """Fault events per day over the last two weeks."""
    rows = [{
        "Date": pd.to_datetime(item["date"]).date(),
        "Faults": item["count"],
    } for item in stats.get("faultsByDay", [])]
    return pd.DataFrame(rows)


def build_dtc_dictionary_stats(dtc_rows: list[dict]) -> pd.DataFrame:
    """
    Repair-cost statistics of the fault-code DICTIONARY itself:
    per severity — number of known codes and their min/avg/max estimated cost.
    """
    if not dtc_rows:
        return pd.DataFrame()

    df = pd.DataFrame(dtc_rows)
    df["Severity"] = df["severity"].map(SEVERITY_LABELS)
    grouped = df.groupby("Severity").agg(
        Known_codes=("errorCode", "count"),
        Min_cost=("estimatedCostMin", "min"),
        Avg_cost=("estimatedCostMax", "mean"),
        Max_cost=("estimatedCostMax", "max"),
    ).reset_index()
    grouped.columns = ["Severity", "Known codes", "Min cost (₪)", "Avg max cost (₪)", "Max cost (₪)"]
    grouped["Avg max cost (₪)"] = grouped["Avg max cost (₪)"].round(0)
    return grouped


def build_totals(stats: dict) -> pd.DataFrame:
    """One-row headline numbers for the summary screen."""
    return pd.DataFrame([{
        "Total users": stats["totalUsers"],
        "Total vehicles": stats["totalVehicles"],
        "Total fault events": stats["totalFaults"],
    }])
