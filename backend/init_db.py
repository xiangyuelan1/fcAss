"""
初始化脚本 - 创建默认管理员账号
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import init_db, get_db
from app.models.user import User
from app.auth import get_password_hash


def create_default_admin():
    """创建默认管理员账号"""
    print("初始化数据库...")
    init_db()
    
    db = next(get_db())
    
    try:
        existing_admin = db.query(User).filter(User.username == "admin").first()
        
        if existing_admin:
            print("管理员账号已存在")
            return
        
        admin = User(
            username="admin",
            email="admin@example.com",
            hashed_password=get_password_hash("admin123"),
            is_active=True,
            is_admin=True
        )
        
        db.add(admin)
        db.commit()
        
        print("=" * 50)
        print("默认管理员账号创建成功！")
        print("=" * 50)
        print("用户名: admin")
        print("密码:   admin123")
        print("=" * 50)
        print()
        print("⚠️  请立即修改默认密码！")
        
    except Exception as e:
        db.rollback()
        print(f"创建管理员失败: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    create_default_admin()
