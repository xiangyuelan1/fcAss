"""
配置管理模块
"""
from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """应用配置类"""
    
    APP_NAME: str = "A股预测训练平台"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    DATABASE_URL: str = "sqlite:///./a_stock_trainer.db"
    
    DATA_DIR: str = "./data"
    MODEL_DIR: str = "./models"
    LOG_DIR: str = "./logs"
    
    REDIS_URL: Optional[str] = None
    
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    
    AKSHARE_TIMEOUT: int = 30
    MAX_RETRY: int = 3
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

os.makedirs(settings.DATA_DIR, exist_ok=True)
os.makedirs(settings.MODEL_DIR, exist_ok=True)
os.makedirs(settings.LOG_DIR, exist_ok=True)
