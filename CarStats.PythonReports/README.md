# CarStats — Admin Reports (Python)

Python end-of-year assignment, **Alternative A**: statistical admin reports
for our final project (the CarStats car-diagnostics app). Tables with
**pandas**, graphs with **matplotlib**, data pulled live from the project's
real server after an **admin login**.

## Two ways to run it

Both use the same report engine (`reports.py`) — only the display differs.

**Web dashboard (nicer UI):**
```bash
pip install -r requirements.txt
streamlit run dashboard.py
```
A browser page opens: log in, pick a report in the sidebar, and the table
and chart appear side by side. Headline numbers show at the top.

**Console menu (simple, no browser):**
```bash
python main.py
```
Log in, pick a report from the numbered menu — the table prints in the
terminal and a chart window opens. Option 5 saves every table as CSV and
every chart as PNG into the `exports/` folder.

Log in with an admin account either way (the server rejects non-admins).
For local testing point it at a dev API with `set CARSTATS_API=http://localhost:5279/api`.

## Files

| File | Job |
|---|---|
| `api_client.py` | Talks to the server (login, fetch data) |
| `reports.py` | The four reports: each returns a (table, chart) pair |
| `main.py` | User interface #1 — console menu |
| `dashboard.py` | User interface #2 — Streamlit web dashboard |

## Requirement checklist (from the assignment doc)

| Requirement | Where |
|---|---|
| Built from modules | 3 modules, one job each |
| Tables **and** graphs | every report prints a pandas table; 3 have matplotlib charts |
| **List** | `rows` in `report_users`; every server response is a list |
| **Dictionary** | `SEVERITY_INFO` in reports.py; every record from the server |
| **Tuple** | `(label, count, color)` triples in `report_severity` |
| **Set** | distinct car makes in `report_vehicles` |
| External packages (pip) | `requests`, `pandas`, `matplotlib`, `streamlit` |
| Save / manage data | reads from the server's DB via its API, writes CSV + PNG files |
| Invested UI | a real web dashboard (Streamlit) on top of the console tool |
| Beyond the requirements | real JWT admin login (server rejects non-admins); one report engine drives two UIs |
