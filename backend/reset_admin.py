import sqlite3
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

conn = sqlite3.connect('a_stock_trainer.db')
cursor = conn.cursor()

new_password = "admin123"
hashed = pwd_context.hash(new_password)

cursor.execute("UPDATE users SET hashed_password = ? WHERE username = 'admin'", (hashed,))
conn.commit()

cursor.execute("SELECT username, is_admin FROM users WHERE username = 'admin'")
print(cursor.fetchone())

conn.close()
print(f"Admin password reset to: {new_password}")
