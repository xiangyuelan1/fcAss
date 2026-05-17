import sqlite3
conn = sqlite3.connect('a_stock_trainer.db')
cursor = conn.cursor()
cursor.execute("SELECT username, is_admin FROM users")
for row in cursor.fetchall():
    print(row)
conn.close()
