# CarStats — Admin Statistical Reports (Python)

Python end-of-year assignment, **Alternative A**: statistical admin reports
for the CarStats final project, shown as **tables** (pandas) and **graphs**
(matplotlib), pulled live from the project's real REST API over an
authenticated JWT admin login.

## Run it

```bash
pip install -r requirements.txt
python main.py                 # production API + interactive menu
python main.py --api http://localhost:5279/api   # local dev API
python main.py --export-all --email <admin> --password <pw>   # batch export
```

Log in with a CarStats **admin** account — the statistics endpoints are
role-protected on the server, so a regular driver login is rejected.

## Modules

| File | Responsibility |
|---|---|
| `main.py` | Menu, printing, export-all, CLI arguments |
| `api_client.py` | JWT login + authenticated HTTP calls (`requests`) |
| `reports.py` | Raw JSON → pandas DataFrames (the tables) |
| `charts.py` | DataFrames → matplotlib figures (the graphs) |
| `exporter.py` | Saves tables to CSV and charts to PNG under `exports/` |

## Where each course requirement is answered

| Requirement | Where |
|---|---|
| Project built from modules | five modules above, one responsibility each |
| Tables **and** graphs | every report prints a pandas table; five have matplotlib charts |
| List / Dictionary | API JSON → lists of dicts everywhere; `MENU` and `SEVERITY_LABELS` dicts |
| Tuple | `(label, value)` pairs in `build_severity_breakdown`; menu values are tuples |
| Set | distinct car makes in `build_vehicles_by_make` |
| External packages (pip) | `requests`, `pandas`, `matplotlib`, `tabulate` |
| Save/manage data | reads from the live API, writes CSV + PNG to `exports/` |
| Extra value | real JWT auth against the production server, brand-matched chart styling, batch CLI mode |
