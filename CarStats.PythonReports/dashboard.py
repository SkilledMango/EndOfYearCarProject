import io

import streamlit as st

import api_client
import reports

st.set_page_config(page_title="CarStats Admin Reports", page_icon="🚗", layout="wide")

# remember if the user already logged in, so the form only shows once
if "logged_in" not in st.session_state:
    st.session_state.logged_in = False

# login screen - nothing below runs until an admin logs in
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
    st.stop()

# top of the page - the headline numbers
st.title("🚗 CarStats — Admin Reports")

stats = api_client.get_stats()
col1, col2, col3 = st.columns(3)
col1.metric("Total users", stats["totalUsers"])
col2.metric("Total vehicles", stats["totalVehicles"])
col3.metric("Total fault events", stats["totalFaults"])

# one-line automatic insight about the data
st.info("💡 " + reports.insight_from_stats(stats))

st.divider()

# sidebar to pick a report, then show its table and chart side by side
title = st.sidebar.radio("Choose a report:", list(reports.ALL_REPORTS))
table, figure = reports.ALL_REPORTS[title]()

st.subheader(title)
left, right = st.columns([1, 1])
left.dataframe(table, use_container_width=True, hide_index=True)
right.pyplot(figure)

# let the admin download the current report as a CSV file
csv = table.to_csv(index=False).encode("utf-8-sig")
st.download_button("⬇ Download this report (CSV)", csv, file_name=f"{title}.csv", mime="text/csv")

# ...or download all four reports as one Excel file
excel_buffer = io.BytesIO()
reports.save_all_to_excel(excel_buffer)
st.sidebar.download_button(
    "⬇ Download ALL reports (Excel)",
    excel_buffer.getvalue(),
    file_name="CarStats_Reports.xlsx",
    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
)
