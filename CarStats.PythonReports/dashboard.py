"""
dashboard.py — the same four reports as a WEB dashboard.

Streamlit turns plain Python into a web page: st.dataframe() shows a
table, st.pyplot() shows a matplotlib chart, st.metric() shows a big
number. Same report engine as the console app (reports.py) — this file
only handles display.

Run with:   streamlit run dashboard.py
External package: streamlit  (pip install streamlit)
"""

import streamlit as st

import api_client
import reports

st.set_page_config(page_title="CarStats Admin Reports", page_icon="🚗", layout="wide")

# ─── Admin login (once per browser session) ───────────────────────────────────
# st.session_state survives page reruns, so we only log in one time.

if "logged_in" not in st.session_state:
    st.session_state.logged_in = False

if not st.session_state.logged_in:
    st.title("🚗 CarStats — Admin Reports")
    st.caption("Log in with an admin account (regular users are rejected by the server).")

    with st.form("login"):
        email = st.text_input("Admin email")
        password = st.text_input("Password", type="password")
        submitted = st.form_submit_button("Log in")

    if submitted:
        if api_client.login(email, password):
            st.session_state.logged_in = True
            st.rerun()
        else:
            st.error("Login failed — admin account required.")
    st.stop()   # nothing below runs until we're logged in

# ─── Headline numbers ─────────────────────────────────────────────────────────

st.title("🚗 CarStats — Admin Reports")

stats = api_client.get_stats()
col1, col2, col3 = st.columns(3)
col1.metric("Total users", stats["totalUsers"])
col2.metric("Total vehicles", stats["totalVehicles"])
col3.metric("Total fault events", stats["totalFaults"])

st.divider()

# ─── Report picker ────────────────────────────────────────────────────────────
# reports.ALL_REPORTS is a Dictionary: report title → build function.

title = st.sidebar.radio("Choose a report:", list(reports.ALL_REPORTS))
table, figure = reports.ALL_REPORTS[title]()

st.subheader(title)
left, right = st.columns([1, 1])
left.dataframe(table, use_container_width=True, hide_index=True)
right.pyplot(figure)
