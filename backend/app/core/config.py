"""
配置管理模块
"""
from pydantic_settings import BaseSettings
import os


class Settings(BaseSettings):
    """应用配置类"""

    APP_NAME: str = "A股预测训练平台"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./a_stock_trainer.db")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000,capacitor://localhost")

    DATA_DIR: str = os.getenv("DATA_DIR", "./data")
    MODEL_DIR: str = os.getenv("MODEL_DIR", "./models")
    LOG_DIR: str = os.getenv("LOG_DIR", "./logs")

    WEEKLY_TRAINING_LIMIT: int = 3

    def validate_production(self):
        """生产环境启动校验"""
        if not self.DEBUG and (not self.SECRET_KEY or self.SECRET_KEY.startswith("your-secret")):
            raise RuntimeError("生产环境必须在环境变量中配置 SECRET_KEY")

    class Config:
        env_file = ".env"


settings = Settings()
