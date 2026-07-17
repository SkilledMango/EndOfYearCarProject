# CarStats — Admin Reports (Python)

Python end-of-year assignment, **Alternative A**: statistical admin reports
for our final project (the CarStats car-diagnostics app). Tables with
**pandas**, graphs with **matplotlib**, data pulled live from the project's
real server after an **admin login**.

## Run

```bash
pip install -r requirements.txt
python main.py
```

Log in with an admin account. Pick a report from the menu — the table
prints in the terminal and a chart window opens. Option 5 saves every
table as CSV and every chart as PNG into the `exports/` folder.

## Files

| File | Job |
|---|---|
| `main.py` | Login + menu |
| `api_client.py` | Talks to the server (login, fetch data) |
| `reports.py` | The four reports: build table, draw chart, save files |

## Requirement checklist (from the assignment doc)

| Requirement | Where |
|---|---|
| Built from modules | 3 modules, one job each |
| Tables **and** graphs | every report prints a pandas table; 3 have matplotlib charts |
| **List** | `rows` in `report_users`; every server response is a list |
| **Dictionary** | `SEVERITY_INFO` in reports.py; every record from the server |
| **Tuple** | `(label, count, color)` triples in `report_severity` |
| **Set** | distinct car makes in `report_vehicles` |
| External packages (pip) | `requests`, `pandas`, `matplotlib` |
| Save / manage data | reads from the server's DB via its API, writes CSV + PNG files |
| Beyond the requirements | real JWT admin login — the server itself rejects non-admin users |
