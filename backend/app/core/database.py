"""
数据库连接和会话管理
"""
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings
import os
import logging

logger = logging.getLogger(__name__)

# 创建数据库引擎
# 对于SQLite，需要设置check_same_thread=False以支持多线程
connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=settings.DEBUG,  # 调试模式下打印SQL语句
    pool_pre_ping=True,   # 连接池健康检查
)

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 声明基类
Base = declarative_base()


def get_db() -> Session:
    """获取数据库会话的依赖函数"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """初始化数据库，创建所有表"""
    Base.metadata.create_all(bind=engine)
    print("数据库初始化完成")


def drop_db():
    """删除所有表（谨慎使用）"""
    Base.metadata.drop_all(bind=engine)
    print("数据库表已删除")


# 需要检查的迁移列定义
# 格式: {表名: [(列名, 列类型SQL), ...]}
_MIGRATION_COLUMNS = {
    "users": [
        ("last_login_at", "DATETIME"),
        ("last_login_ip", "VARCHAR(45)"),
        ("last_heartbeat", "DATETIME"),
    ],
    "user_models": [
        ("feature_config", "JSON"),
        ("target_config", "JSON"),
        ("train_date_range", "JSON"),
    ],
    "community_models": [
        ("feature_config", "JSON"),
        ("target_config", "JSON"),
        ("train_date_range", "JSON"),
    ],
    "payment_config": [
        ("register_fee", "DECIMAL(10,2) DEFAULT 1.00"),
        ("pay_type", "VARCHAR(20) DEFAULT 'alipay'"),
    ],
}


def _get_existing_columns(table_name: str) -> set:
    """获取表中已存在的列名集合"""
    insp = inspect(engine)
    if not insp.has_table(table_name):
        return set()
    return {col["name"] for col in insp.get_columns(table_name)}


def _migrate_db():
    """
    增量迁移：检查并添加已有表中缺失的列。
    SQLAlchemy 的 create_all 不会给已有表添加新列，
    因此需要通过 ALTER TABLE ADD COLUMN 手动补充。
    """
    migrated = False
    for table_name, columns in _MIGRATION_COLUMNS.items():
        existing = _get_existing_columns(table_name)
        if existing is None:
            continue
        for col_name, col_type in columns:
            if col_name not in existing:
                sql = f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"
                try:
                    with engine.connect() as conn:
                        conn.execute(text(sql))
                        conn.commit()
                    logger.info(f"[迁移] {table_name}.{col_name} 已添加")
                    migrated = True
                except Exception as e:
                    logger.warning(f"[迁移] 添加 {table_name}.{col_name} 失败: {e}")
    if migrated:
        print("[OK] 数据库增量迁移完成")
    else:
        print("[OK] 数据库结构已是最新，无需迁移")
