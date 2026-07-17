"""
api_client.py — talks to the CarStats REST API.

The CarStats API is protected with JWT authentication: we first log in with
an admin account, receive a token, and attach it as a Bearer header to every
report query. Statistics endpoints are admin-only on the server, so a regular
driver account cannot pull these reports.

External package used: requests (pip install requests)
"""

import requests

# Default is the production server; pass --api http://localhost:5279/api
# on the command line to run against a local development API instead.
DEFAULT_BASE_URL = "https://CarProject.somee.com/api"

# The free host can cold-start slowly, so give it a generous timeout.
TIMEOUT_SECONDS = 60


class CarStatsClient:
    """A small authenticated HTTP client for the CarStats API."""

    def __init__(self, base_url: str = DEFAULT_BASE_URL):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()   # reuses the TCP connection
        self.admin_name: str | None = None

    # ── Authentication ────────────────────────────────────────────────────

    def login(self, email: str, password: str) -> bool:
        """
        Logs in against /auth/login. Returns True only for Admin/SuperAdmin
        accounts — the reports endpoints would reject anyone else anyway.
        On success the JWT is stored on the session for all later calls.
        """
        response = self.session.post(
            f"{self.base_url}/auth/login",
            json={"email": email, "password": password},
            timeout=TIMEOUT_SECONDS,
        )
        if response.status_code != 200:
            return False

        body = response.json()          # Dictionary: {"token": ..., "user": {...}}
        user = body["user"]
        if user["role"] < 2:            # 1=User, 2=Admin, 3=SuperAdmin
            print("This account is not an admin — reports require admin rights.")
            return False

        self.session.headers["Authorization"] = f"Bearer {body['token']}"
        self.admin_name = user["fullName"]
        return True

    # ── Report data sources ───────────────────────────────────────────────

    def _get(self, path: str):
        """GET an API path and return the parsed JSON (raises on HTTP errors)."""
        response = self.session.get(f"{self.base_url}{path}", timeout=TIMEOUT_SECONDS)
        response.raise_for_status()
        return response.json()

    def get_users(self) -> list[dict]:
        """All users with their vehicles (admin-only endpoint)."""
        return self._get("/users")

    def get_stats(self) -> dict:
        """Server-side aggregates: totals, top codes, faults per day, severity."""
        return self._get("/stats")

    def get_dtc_dictionary(self) -> list[dict]:
        """The full fault-code dictionary (code, title, severity, costs)."""
        return self._get("/dtc")

    def get_user_events(self, user_id: int) -> list[dict]:
        """One user's fault-event history."""
        return self._get(f"/mobile/events/{user_id}")
