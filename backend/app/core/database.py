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
        ("nickname", "VARCHAR(50)"),
        ("auto_clear_predictions_daily", "BOOLEAN DEFAULT 1"),
    ],
    "user_models": [
        ("feature_config", "JSON"),
        ("target_config", "JSON"),
        ("train_date_range", "JSON"),
        ("auto_retrain_daily", "BOOLEAN DEFAULT 0"),
        ("auto_predict_pool_daily", "BOOLEAN DEFAULT 0"),
        ("feature_window", "INTEGER DEFAULT 5"),
    ],
    "community_models": [
        ("feature_config", "JSON"),
        ("target_config", "JSON"),
        ("train_date_range", "JSON"),
        ("visibility", "VARCHAR(20) DEFAULT 'public'"),
        ("auto_predict", "BOOLEAN DEFAULT 1"),
        ("prediction_record", "JSON"),
    ],
    "payment_config": [
        ("register_fee", "DECIMAL(10,2) DEFAULT 1.00"),
        ("pay_type", "VARCHAR(20) DEFAULT 'alipay'"),
    ],
}

_MIGRATION_TABLES = {
    "follows": [
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT"),
        ("follower_id", "INTEGER NOT NULL"),
        ("following_id", "INTEGER NOT NULL"),
        ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ],
    "follows_indexes": [
        "CREATE INDEX IF NOT EXISTS ix_follows_follower_id ON follows(follower_id)",
        "CREATE INDEX IF NOT EXISTS ix_follows_following_id ON follows(following_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_follow_pair ON follows(follower_id, following_id)",
    ],
    "auto_predict_pool": [
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT"),
        ("user_id", "INTEGER NOT NULL"),
        ("stock_code", "VARCHAR(20) NOT NULL"),
        ("stock_name", "VARCHAR(50)"),
        ("sort_order", "INTEGER DEFAULT 0"),
        ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ],
    "auto_predict_pool_indexes": [
        "CREATE INDEX IF NOT EXISTS ix_auto_predict_pool_user_id ON auto_predict_pool(user_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_auto_pool_user_stock ON auto_predict_pool(user_id, stock_code)",
    ],
    "prediction_shares": [
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT"),
        ("user_id", "INTEGER NOT NULL"),
        ("task_id", "INTEGER"),
        ("model_id", "INTEGER"),
        ("model_name", "VARCHAR(100)"),
        ("model_type", "VARCHAR(50)"),
        ("stock_code", "VARCHAR(20) NOT NULL"),
        ("stock_name", "VARCHAR(50)"),
        ("target_type", "VARCHAR(50)"),
        ("direction", "VARCHAR(20)"),
        ("prediction_value", "FLOAT"),
        ("confidence", "FLOAT"),
        ("predicted_change_pct", "FLOAT"),
        ("prediction_data", "JSON"),
        ("is_published", "BOOLEAN DEFAULT 0"),
        ("likes_count", "INTEGER DEFAULT 0"),
        ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ],
    "prediction_shares_indexes": [
        "CREATE INDEX IF NOT EXISTS ix_prediction_shares_user_id ON prediction_shares(user_id)",
        "CREATE INDEX IF NOT EXISTS ix_prediction_shares_stock_code ON prediction_shares(stock_code)",
        "CREATE INDEX IF NOT EXISTS ix_prediction_shares_is_published ON prediction_shares(is_published)",
    ],
    "custom_indicators": [
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT"),
        ("user_id", "INTEGER NOT NULL"),
        ("name", "VARCHAR(100) NOT NULL"),
        ("key", "VARCHAR(100) NOT NULL"),
        ("description", "TEXT"),
        ("formula", "TEXT NOT NULL"),
        ("params", "JSON"),
        ("category", "VARCHAR(50) DEFAULT '自定义'"),
        ("is_published", "BOOLEAN DEFAULT 0"),
        ("likes_count", "INTEGER DEFAULT 0"),
        ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
        ("updated_at", "DATETIME"),
    ],
    "custom_indicators_indexes": [
        "CREATE INDEX IF NOT EXISTS ix_custom_indicators_user_id ON custom_indicators(user_id)",
        "CREATE INDEX IF NOT EXISTS ix_custom_indicators_is_published ON custom_indicators(is_published)",
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

    insp = inspect(engine)
    for table_name, columns in _MIGRATION_TABLES.items():
        if table_name.endswith("_indexes"):
            continue
        if not insp.has_table(table_name):
            col_defs = ", ".join(f"{col_name} {col_type}" for col_name, col_type in columns)
            sql = f"CREATE TABLE {table_name} ({col_defs})"
            try:
                with engine.connect() as conn:
                    conn.execute(text(sql))
                    conn.commit()
                logger.info(f"[迁移] 表 {table_name} 已创建")
                migrated = True
            except Exception as e:
                logger.warning(f"[迁移] 创建表 {table_name} 失败: {e}")

    for table_name in _MIGRATION_TABLES:
        if not table_name.endswith("_indexes"):
            continue
        for idx_sql in _MIGRATION_TABLES[table_name]:
            try:
                with engine.connect() as conn:
                    conn.execute(text(idx_sql))
                    conn.commit()
                logger.info(f"[迁移] 索引已创建: {idx_sql}")
                migrated = True
            except Exception as e:
                logger.warning(f"[迁移] 创建索引失败: {e}: {idx_sql}")

    if migrated:
        print("[OK] 数据库增量迁移完成")
    else:
        print("[OK] 数据库结构已是最新，无需迁移")
