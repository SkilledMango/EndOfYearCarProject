"""
api_client.py — gets the data from our CarStats server.

We log in once with an admin account. The server answers with a token,
we keep the token, and we send it with every request after that.
Regular (non-admin) users are rejected by the server.

External package: requests  (pip install requests)
"""

import requests

API_URL = "https://CarProject.somee.com/api"   # our real production server

# Filled in by login() — sent with every request after a successful login.
auth_header = {}


def login(email: str, password: str) -> bool:
    """Log in. Returns True only if the account is an Admin/SuperAdmin."""
    response = requests.post(
        f"{API_URL}/auth/login",
        json={"email": email, "password": password},
        timeout=60,
    )
    if response.status_code != 200:
        return False

    data = response.json()              # Dictionary: {"token": ..., "user": {...}}
    if data["user"]["role"] < 2:        # roles: 1=User, 2=Admin, 3=SuperAdmin
        print("This account is not an admin.")
        return False

    auth_header["Authorization"] = "Bearer " + data["token"]
    print("Welcome,", data["user"]["fullName"] + "!")
    return True


def get_users() -> list:
    """All users with their vehicles — a List of Dictionaries."""
    response = requests.get(f"{API_URL}/users", headers=auth_header, timeout=60)
    response.raise_for_status()
    return response.json()


def get_stats() -> dict:
    """Ready-made statistics from the server (totals, top codes, severities)."""
    response = requests.get(f"{API_URL}/stats", headers=auth_header, timeout=60)
    response.raise_for_status()
    return response.json()
