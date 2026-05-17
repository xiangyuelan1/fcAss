import requests

base_url = "http://localhost:8000/api"

resp = requests.post(f"{base_url}/auth/register", json={
    "username": "superadmin",
    "email": "superadmin@test.com",
    "password": "admin123"
})
print("Register:", resp.status_code, resp.json())

import sqlite3
conn = sqlite3.connect('a_stock_trainer.db')
cursor = conn.cursor()
cursor.execute("UPDATE users SET is_admin = 1 WHERE username = 'superadmin'")
conn.commit()
cursor.execute("SELECT username, is_admin FROM users WHERE username = 'superadmin'")
print("DB:", cursor.fetchone())
conn.close()
