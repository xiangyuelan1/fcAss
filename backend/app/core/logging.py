"""
日志配置模块
"""
import logging
import logging.handlers
import os
from pathlib import Path
from app.core.config import settings


def setup_logging():
    """配置日志系统"""
    log_dir = Path(settings.LOG_DIR)
    log_dir.mkdir(parents=True, exist_ok=True)
    
    log_level = logging.DEBUG if settings.DEBUG else logging.INFO
    
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    file_handler = logging.handlers.RotatingFileHandler(
        filename=log_dir / 'app.log',
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding='utf-8'
    )
    file_handler.setLevel(log_level)
    file_handler.setFormatter(logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    ))
    
    error_handler = logging.handlers.RotatingFileHandler(
        filename=log_dir / 'error.log',
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding='utf-8'
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s - %(pathname)s:%(lineno)d'
    ))
    
    root_logger = logging.getLogger()
    root_logger.addHandler(file_handler)
    root_logger.addHandler(error_handler)
    
    logging.getLogger('uvicorn').setLevel(logging.INFO)
    logging.getLogger('uvicorn.access').setLevel(logging.INFO)
    logging.getLogger('uvicorn.error').setLevel(logging.ERROR)


class Logger:
    """日志记录器包装类"""
    
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
    
    def debug(self, message: str, **kwargs):
        """调试日志"""
        self.logger.debug(message, extra=kwargs)
    
    def info(self, message: str, **kwargs):
        """信息日志"""
        self.logger.info(message, extra=kwargs)
    
    def warning(self, message: str, **kwargs):
        """警告日志"""
        self.logger.warning(message, extra=kwargs)
    
    def error(self, message: str, **kwargs):
        """错误日志"""
        self.logger.error(message, extra=kwargs)
    
    def critical(self, message: str, **kwargs):
        """严重错误日志"""
        self.logger.critical(message, extra=kwargs)
