"""
charts.py — the "graphs" half of the assignment.

Each chart_* function receives a DataFrame from reports.py and draws a
matplotlib figure. Figures are returned (not shown) so main.py can either
display them interactively (plt.show) or save them to PNG via exporter.py.

The colors mirror the CarStats app's design system, so the Python reports
visually match the final project.

External package used: matplotlib (pip install matplotlib)
"""

import matplotlib.pyplot as plt
import pandas as pd

# CarStats "Soft Tech" palette (same tokens the mobile app uses)
ENGINE_BLUE = "#1353D8"
DEEP_BLUE   = "#003FB1"
INK         = "#191B23"
SEVERITY_COLORS = {          # Dictionary: severity label → brand color
    "Green (minor)":    "#059669",
    "Yellow (caution)": "#D97706",
    "Red (critical)":   "#BA1A1A",
    "Unknown":          "#6B7280",
}


def _styled_figure(title: str):
    """Creates a consistently styled figure + axes for all reports."""
    fig, ax = plt.subplots(figsize=(9, 5))
    fig.patch.set_facecolor("white")
    ax.set_title(title, fontsize=14, fontweight="bold", color=INK, pad=14)
    ax.spines[["top", "right"]].set_visible(False)
    return fig, ax


def chart_vehicles_by_make(df: pd.DataFrame):
    """Bar chart — number of registered vehicles per make."""
    fig, ax = _styled_figure("Registered Vehicles by Make")
    ax.bar(df["Make"], df["Vehicles"], color=ENGINE_BLUE)
    ax.set_ylabel("Vehicles")
    ax.yaxis.get_major_locator().set_params(integer=True)
    fig.tight_layout()
    return fig


def chart_fuel_by_make(df: pd.DataFrame):
    """Bar chart — average fuel consumption per make (lower is better)."""
    data = df.dropna(subset=["Avg L/100km"])
    fig, ax = _styled_figure("Average Fuel Consumption by Make (L/100km)")
    ax.bar(data["Make"], data["Avg L/100km"], color=DEEP_BLUE)
    ax.set_ylabel("L / 100km")
    fig.tight_layout()
    return fig


def chart_severity_breakdown(df: pd.DataFrame):
    """Pie chart — share of fault events per severity."""
    fig, ax = _styled_figure("Fault Events by Severity")
    colors = [SEVERITY_COLORS.get(label, "#6B7280") for label in df["Severity"]]
    ax.pie(
        df["Events"],
        labels=df["Severity"],
        colors=colors,
        autopct="%1.0f%%",
        startangle=90,
        wedgeprops={"edgecolor": "white", "linewidth": 2},
    )
    ax.axis("equal")
    fig.tight_layout()
    return fig


def chart_top_codes(df: pd.DataFrame):
    """Horizontal bar chart — most common fault codes, worst on top."""
    fig, ax = _styled_figure("Most Reported Fault Codes")
    data = df.sort_values("Times reported")     # smallest first → biggest on top
    colors = [SEVERITY_COLORS.get(label, "#6B7280") for label in data["Severity"]]
    ax.barh(data["Code"] + "  —  " + data["Meaning"], data["Times reported"], color=colors)
    ax.set_xlabel("Times reported")
    ax.xaxis.get_major_locator().set_params(integer=True)
    fig.tight_layout()
    return fig


def chart_faults_per_day(df: pd.DataFrame):
    """Line chart — fault events per day over the last two weeks."""
    fig, ax = _styled_figure("Fault Events per Day (last 14 days)")
    ax.plot(df["Date"], df["Faults"], marker="o", linewidth=2.5, color=ENGINE_BLUE,
            markerfacecolor="white", markeredgecolor=DEEP_BLUE, markeredgewidth=2)
    ax.set_ylabel("Fault events")
    ax.yaxis.get_major_locator().set_params(integer=True)
    fig.autofmt_xdate(rotation=30)
    fig.tight_layout()
    return fig
