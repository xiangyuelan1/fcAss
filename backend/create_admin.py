import requests
import sqlite3
import sys

base_url = "http://localhost:8000/api"

username = "admin"
password = "admin123"
email = "admin@astock.local"

resp = requests.post(f"{base_url}/auth/register", json={
    "username": username,
    "email": email,
    "password": password
})

if resp.status_code == 200:
    print(f"用户 {username} 注册成功")
elif resp.status_code == 400 and "已存在" in resp.json().get("detail", ""):
    print(f"用户 {username} 已存在，跳过注册")
else:
    print(f"注册响应: {resp.status_code}", resp.json())

conn = sqlite3.connect('a_stock_trainer.db')
cursor = conn.cursor()
cursor.execute("UPDATE users SET is_admin = 1, is_active = 1 WHERE username = ?", (username,))
conn.commit()
cursor.execute("SELECT username, is_admin, is_active FROM users WHERE username = ?", (username,))
row = cursor.fetchone()
if row:
    print(f"管理员设置完成: 用户名={row[0]}, is_admin={row[1]}, is_active={row[2]}")
else:
    print(f"错误: 用户 {username} 不存在")
    sys.exit(1)
conn.close()
