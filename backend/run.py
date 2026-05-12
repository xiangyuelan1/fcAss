#!/usr/bin/env python3
"""
启动脚本
"""
import sys
import io
import uvicorn
from app.core.config import settings

if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

    print(f"[启动] {settings.APP_NAME}")
    print(f"[地址] http://{settings.HOST}:{settings.PORT}")
    print(f"[文档] http://{settings.HOST}:{settings.PORT}/docs")

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info"
    )
