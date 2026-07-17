import os

import requests

# our real production server. for local testing: set CARSTATS_API=http://localhost:5279/api
API_URL = os.environ.get("CARSTATS_API", "https://CarProject.somee.com/api")

auth_header = {}


# log in with email + password, and keep the token the server sends back
def login(email: str, password: str) -> bool:
    response = requests.post(
        f"{API_URL}/auth/login",
        json={"email": email, "password": password},
        timeout=60,
    )
    if response.status_code != 200:
        return False

    data = response.json()
    if data["user"]["role"] < 2:        # 1=User, 2=Admin, 3=SuperAdmin
        print("This account is not an admin.")
        return False

    auth_header["Authorization"] = "Bearer " + data["token"]
    print("Welcome,", data["user"]["fullName"] + "!")
    return True


# get the list of all users (with their vehicles) from the server
def get_users() -> list:
    response = requests.get(f"{API_URL}/users", headers=auth_header, timeout=60)
    response.raise_for_status()
    return response.json()


# get the ready-made statistics from the server
def get_stats() -> dict:
    response = requests.get(f"{API_URL}/stats", headers=auth_header, timeout=60)
    response.raise_for_status()
    return response.json()
