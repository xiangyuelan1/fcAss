"""
数据库种子脚本 - 创建测试用户、模型、社区数据

用法:
    python seed_test_data.py          # 创建测试数据
    python seed_test_data.py --clean  # 清除旧测试数据后重新创建
"""
import sys
import os
import argparse
from datetime import datetime, timedelta
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import init_db, SessionLocal
from app.models.user import User
from app.models.user_model import UserModel
from app.models.community import (
    CommunityModel,
    CommunitySignal,
    CommunityLike,
    UserPoints,
    PointTransaction,
)
from app.auth import get_password_hash
from app.services.model_service import ModelService

# ---------------------------------------------------------------------------
# 测试用户定义
# ---------------------------------------------------------------------------
TEST_USERS = [
    {
        "username": "quant_rookie",
        "display_name": "量化新手",
        "password": "test1234",
        "email": "rookie@test.com",
        "points": 50,
        "level": 1,
    },
    {
        "username": "tech_analyst",
        "display_name": "技术分析师",
        "password": "test1234",
        "email": "analyst@test.com",
        "points": 200,
        "level": 3,
    },
    {
        "username": "dl_master",
        "display_name": "深度学习达人",
        "password": "test1234",
        "email": "dlmaster@test.com",
        "points": 500,
        "level": 6,
    },
    {
        "username": "steady_investor",
        "display_name": "稳健投资者",
        "password": "test1234",
        "email": "investor@test.com",
        "points": 150,
        "level": 2,
    },
    {
        "username": "strategy_researcher",
        "display_name": "策略研究员",
        "password": "test1234",
        "email": "researcher@test.com",
        "points": 350,
        "level": 4,
    },
]

# ---------------------------------------------------------------------------
# 每个用户的模型定义
# ---------------------------------------------------------------------------
TEST_MODELS = {
    "quant_rookie": [
        {
            "name": "简单涨跌预测",
            "description": "基于XGBoost的A股涨跌预测模型，使用基础技术指标",
            "model_type": "xgboost",
            "features": ["sma", "ema", "rsi", "macd"],
            "feature_config": {"sma_period": 20, "ema_period": 12, "rsi_period": 14},
            "target": "next_day_direction",
            "stock_codes": ["000001", "600036", "000858"],
            "train_date_range": {"start": "2020-01-01", "end": "2024-12-31"},
        },
        {
            "name": "趋势跟踪",
            "description": "基于随机森林的趋势跟踪策略模型",
            "model_type": "randomforest",
            "features": ["sma", "ema", "macd", "bollinger"],
            "feature_config": {"sma_period": 30, "ema_period": 20, "bollinger_period": 20},
            "target": "next_day_return",
            "stock_codes": ["600519", "000858", "601318"],
            "train_date_range": {"start": "2020-01-01", "end": "2024-12-31"},
        },
    ],
    "tech_analyst": [
        {
            "name": "时序预测",
            "description": "基于LSTM的股票时序预测模型，捕捉长期依赖关系",
            "model_type": "lstm",
            "features": ["close", "volume", "sma", "ema", "rsi"],
            "feature_config": {"sma_period": 20, "ema_period": 12, "rsi_period": 14},
            "target": "next_day_return",
            "stock_codes": ["000001", "600036", "000858"],
            "train_date_range": {"start": "2020-01-01", "end": "2024-12-31"},
        },
        {
            "name": "多因子选股",
            "description": "基于LightGBM的多因子选股模型",
            "model_type": "lightgbm",
            "features": ["rsi", "macd", "bollinger", "volume_ratio", "turnover_rate"],
            "feature_config": {"rsi_period": 14, "bollinger_period": 20},
            "target": "next_day_direction",
            "stock_codes": ["600519", "000858", "601318", "000001"],
            "train_date_range": {"start": "2020-01-01", "end": "2024-12-31"},
        },
    ],
    "dl_master": [
        {
            "name": "深度时序",
            "description": "基于LSTM的深度时序预测模型，多层网络结构",
            "model_type": "lstm",
            "features": ["close", "volume", "sma", "ema", "rsi", "macd"],
            "feature_config": {"sma_period": 20, "ema_period": 12, "rsi_period": 14},
            "target": "next_day_return",
            "stock_codes": ["000001", "600036", "000858"],
            "train_date_range": {"start": "2020-01-01", "end": "2024-12-31"},
        },
        {
            "name": "快速预测",
            "description": "基于GRU的快速预测模型，训练速度快",
            "model_type": "gru",
            "features": ["close", "volume", "sma", "rsi"],
            "feature_config": {"sma_period": 15, "rsi_period": 14},
            "target": "next_day_direction",
            "stock_codes": ["600519", "000858", "601318"],
            "train_date_range": {"start": "2020-01-01", "end": "2024-12-31"},
        },
        {
            "name": "特征组合",
            "description": "基于MLP的特征组合预测模型",
            "model_type": "mlp",
            "features": ["sma", "ema", "rsi", "macd", "bollinger", "volume_ratio"],
            "feature_config": {"sma_period": 20, "ema_period": 12, "bollinger_period": 20},
            "target": "next_day_return",
            "stock_codes": ["000001", "600036", "601318"],
            "train_date_range": {"start": "2020-01-01", "end": "2024-12-31"},
        },
    ],
    "steady_investor": [
        {
            "name": "稳健策略",
            "description": "基于随机森林的稳健投资策略模型",
            "model_type": "randomforest",
            "features": ["sma", "ema", "bollinger", "volume_ratio"],
            "feature_config": {"sma_period": 30, "ema_period": 20, "bollinger_period": 20},
            "target": "next_day_direction",
            "stock_codes": ["600519", "601318", "000858"],
            "train_date_range": {"start": "2020-01-01", "end": "2024-12-31"},
        },
        {
            "name": "低风险",
            "description": "基于XGBoost的低风险选股模型",
            "model_type": "xgboost",
            "features": ["sma", "rsi", "bollinger", "turnover_rate"],
            "feature_config": {"sma_period": 30, "rsi_period": 14, "bollinger_period": 20},
            "target": "next_day_return",
            "stock_codes": ["000001", "600036", "601318"],
            "train_date_range": {"start": "2020-01-01", "end": "2024-12-31"},
        },
    ],
    "strategy_researcher": [
        {
            "name": "量化策略",
            "description": "基于LightGBM的量化策略模型",
            "model_type": "lightgbm",
            "features": ["sma", "ema", "rsi", "macd", "volume_ratio", "turnover_rate"],
            "feature_config": {"sma_period": 20, "ema_period": 12, "rsi_period": 14},
            "target": "next_day_direction",
            "stock_codes": ["000001", "600519", "000858", "601318"],
            "train_date_range": {"start": "2020-01-01", "end": "2024-12-31"},
        },
        {
            "name": "短线策略",
            "description": "基于GRU的短线交易策略模型",
            "model_type": "gru",
            "features": ["close", "volume", "rsi", "macd"],
            "feature_config": {"rsi_period": 14},
            "target": "next_day_return",
            "stock_codes": ["000001", "600036", "000858"],
            "train_date_range": {"start": "2020-01-01", "end": "2024-12-31"},
        },
    ],
}

# ---------------------------------------------------------------------------
# 社区模型描述模板（按模型类型）
# ---------------------------------------------------------------------------
COMMUNITY_DESCRIPTIONS = {
    "xgboost": "基于XGBoost的A股{target}模型，使用{features}等特征",
    "randomforest": "基于随机森林的A股{target}模型，使用{features}等特征",
    "lstm": "基于LSTM深度学习的A股{target}模型，使用{features}等特征",
    "gru": "基于GRU深度学习的A股{target}模型，使用{features}等特征",
    "lightgbm": "基于LightGBM的A股{target}模型，使用{features}等特征",
    "mlp": "基于MLP神经网络的A股{target}模型，使用{features}等特征",
}

# ---------------------------------------------------------------------------
# 积分交易记录模板
# ---------------------------------------------------------------------------
POINT_TRANSACTIONS_TEMPLATE = [
    {"action": "register", "points": 10, "description": "注册奖励"},
    {"action": "create_model", "points": 5, "description": "创建模型奖励"},
    {"action": "train_model", "points": 10, "description": "训练模型奖励"},
    {"action": "publish_model", "points": 15, "description": "发布模型到社区"},
    {"action": "daily_login", "points": 2, "description": "每日登录"},
    {"action": "community_like_received", "points": 3, "description": "获得点赞"},
]


def get_test_usernames():
    """获取所有测试用户名列表"""
    return [u["username"] for u in TEST_USERS]


def clean_test_data(db: SessionLocal):
    """清除所有测试用户及其关联数据"""
    usernames = get_test_usernames()
    print("🧹 正在清除测试数据...")

    # 查找所有测试用户
    users = db.query(User).filter(User.username.in_(usernames)).all()
    if not users:
        print("  未找到测试用户，无需清除")
        return

    user_ids = [u.id for u in users]

    # 按依赖关系逆序删除：先删子表，再删主表
    # 1. CommunityLike（依赖 community_models / community_signals）
    like_count = db.query(CommunityLike).filter(CommunityLike.user_id.in_(user_ids)).delete(synchronize_session=False)
    print(f"  删除 CommunityLike: {like_count} 条")

    # 2. CommunitySignal（依赖 community_models）
    signal_count = db.query(CommunitySignal).filter(CommunitySignal.user_id.in_(user_ids)).delete(synchronize_session=False)
    print(f"  删除 CommunitySignal: {signal_count} 条")

    # 3. CommunityModel
    cm_count = db.query(CommunityModel).filter(CommunityModel.user_id.in_(user_ids)).delete(synchronize_session=False)
    print(f"  删除 CommunityModel: {cm_count} 条")

    # 4. PointTransaction
    pt_count = db.query(PointTransaction).filter(PointTransaction.user_id.in_(user_ids)).delete(synchronize_session=False)
    print(f"  删除 PointTransaction: {pt_count} 条")

    # 5. UserPoints
    up_count = db.query(UserPoints).filter(UserPoints.user_id.in_(user_ids)).delete(synchronize_session=False)
    print(f"  删除 UserPoints: {up_count} 条")

    # 6. UserModel（含级联 TrainingTask）
    um_count = db.query(UserModel).filter(UserModel.user_id.in_(user_ids)).delete(synchronize_session=False)
    print(f"  删除 UserModel: {um_count} 条")

    # 7. User
    for user in users:
        db.delete(user)
    print(f"  删除 User: {len(users)} 条")

    db.commit()
    print("✅ 测试数据清除完成\n")


def create_users(db: SessionLocal):
    """创建测试用户，返回 {username: User} 映射"""
    print("👤 正在创建测试用户...")
    user_map = {}

    for user_def in TEST_USERS:
        existing = db.query(User).filter(User.username == user_def["username"]).first()
        if existing:
            print(f"  用户 {user_def['username']}({user_def['display_name']}) 已存在，跳过")
            user_map[user_def["username"]] = existing
            continue

        user = User(
            username=user_def["username"],
            email=user_def["email"],
            hashed_password=get_password_hash(user_def["password"]),
            is_active=True,
            is_admin=False,
        )
        db.add(user)
        db.flush()  # 获取 id
        user_map[user_def["username"]] = user
        print(f"  创建用户: {user_def['username']}({user_def['display_name']})")

    db.commit()
    print(f"✅ 用户创建完成，共 {len(user_map)} 个\n")
    return user_map


def create_models(db: SessionLocal, user_map: dict):
    """为每个用户创建模型，返回 {username: [UserModel]} 映射"""
    print("📐 正在创建用户模型...")
    model_map = {}

    for username, model_defs in TEST_MODELS.items():
        user = user_map.get(username)
        if not user:
            print(f"  ⚠️ 用户 {username} 不存在，跳过模型创建")
            continue

        created_models = []
        for mdef in model_defs:
            # 检查是否已存在同名模型
            existing = (
                db.query(UserModel)
                .filter(UserModel.user_id == user.id, UserModel.name == mdef["name"])
                .first()
            )
            if existing:
                print(f"  模型 {mdef['name']}({username}) 已存在，跳过")
                created_models.append(existing)
                continue

            # 从 ModelService 获取默认配置并合并
            default_config = ModelService.MODEL_TYPES[mdef["model_type"]]["default_config"]
            model_config = dict(default_config)

            model = UserModel(
                user_id=user.id,
                name=mdef["name"],
                description=mdef["description"],
                model_type=mdef["model_type"],
                model_config=model_config,
                features=mdef["features"],
                feature_config=mdef.get("feature_config", {}),
                target=mdef["target"],
                target_config={},
                stock_codes=mdef["stock_codes"],
                train_date_range=mdef["train_date_range"],
                status="trained",
            )
            db.add(model)
            created_models.append(model)
            print(f"  创建模型: {mdef['name']} ({mdef['model_type']}) -> {username}")

        db.flush()
        model_map[username] = created_models

    db.commit()
    total = sum(len(v) for v in model_map.values())
    print(f"✅ 模型创建完成，共 {total} 个\n")
    return model_map


def _build_community_description(model: UserModel) -> str:
    """根据模型类型和配置生成社区模型描述"""
    template = COMMUNITY_DESCRIPTIONS.get(model.model_type, "基于{model_type}的A股预测模型")
    target_label = "涨跌预测" if model.target == "next_day_direction" else "收益预测"
    features_label = "、".join(model.features[:3])
    return template.format(target=target_label, features=features_label)


def _build_realistic_metrics(model_type: str) -> dict:
    """根据模型类型生成合理的评估指标"""
    # 深度学习模型通常指标略高，集成学习稍低但更稳定
    if model_type in ("lstm", "gru", "mlp"):
        return {"mse": 0.0008, "rmse": 0.028, "mae": 0.019, "r2": 0.72}
    elif model_type == "xgboost":
        return {"mse": 0.001, "rmse": 0.032, "mae": 0.022, "r2": 0.65}
    elif model_type == "lightgbm":
        return {"mse": 0.0009, "rmse": 0.030, "mae": 0.020, "r2": 0.68}
    else:  # randomforest
        return {"mse": 0.0011, "rmse": 0.033, "mae": 0.023, "r2": 0.62}


def create_community_models(db: SessionLocal, user_map: dict, model_map: dict):
    """将每个用户的第一个模型发布到社区，返回 {username: CommunityModel} 映射"""
    print("🌐 正在发布模型到社区...")
    community_model_map = {}

    for username, models in model_map.items():
        if not models:
            continue

        user = user_map[username]
        first_model = models[0]

        # 检查是否已发布
        existing = db.query(CommunityModel).filter(
            CommunityModel.source_model_id == first_model.id,
            CommunityModel.user_id == user.id,
        ).first()
        if existing:
            print(f"  {first_model.name} 已发布到社区，跳过")
            community_model_map[username] = existing
            continue

        import random
        cm = CommunityModel(
            user_id=user.id,
            source_model_id=first_model.id,
            name=first_model.name,
            description=_build_community_description(first_model),
            model_type=first_model.model_type,
            model_config=first_model.model_config,
            features=first_model.features,
            feature_config=first_model.feature_config,
            target=first_model.target,
            target_config=first_model.target_config,
            stock_codes=first_model.stock_codes,
            train_date_range=first_model.train_date_range,
            metrics=_build_realistic_metrics(first_model.model_type),
            is_active=True,
            likes_count=random.randint(0, 20),
            clones_count=random.randint(0, 20),
        )
        db.add(cm)
        db.flush()
        community_model_map[username] = cm
        print(f"  发布: {first_model.name} ({first_model.model_type}) by {username}")

    db.commit()
    print(f"✅ 社区模型发布完成，共 {len(community_model_map)} 个\n")
    return community_model_map


def create_community_signals(db: SessionLocal, user_map: dict, community_model_map: dict):
    """为每个社区模型创建预测信号"""
    print("📊 正在创建社区信号...")

    # 信号配置：不同股票、方向、置信度
    signal_templates = [
        {"stock_code": "000001", "direction": "up", "confidence": 0.78, "prediction_value": 0.0235},
        {"stock_code": "600036", "direction": "down", "confidence": 0.65, "prediction_value": -0.0152},
        {"stock_code": "000858", "direction": "flat", "confidence": 0.55, "prediction_value": 0.0031},
        {"stock_code": "600519", "direction": "up", "confidence": 0.82, "prediction_value": 0.0310},
        {"stock_code": "601318", "direction": "down", "confidence": 0.71, "prediction_value": -0.0208},
    ]

    today = datetime.now()
    signal_count = 0

    for username, cm in community_model_map.items():
        user = user_map[username]

        for i, tmpl in enumerate(signal_templates):
            # 信号日期：最近几天
            pred_date = (today - timedelta(days=i)).strftime("%Y-%m-%d")

            # 检查是否已存在
            existing = db.query(CommunitySignal).filter(
                CommunitySignal.community_model_id == cm.id,
                CommunitySignal.stock_code == tmpl["stock_code"],
                CommunitySignal.prediction_date == pred_date,
            ).first()
            if existing:
                continue

            signal = CommunitySignal(
                user_id=user.id,
                community_model_id=cm.id,
                stock_code=tmpl["stock_code"],
                direction=tmpl["direction"],
                prediction_value=Decimal(str(tmpl["prediction_value"])),
                confidence=Decimal(str(tmpl["confidence"])),
                prediction_date=pred_date,
                likes_count=0,
            )
            db.add(signal)
            signal_count += 1

    db.commit()
    print(f"✅ 社区信号创建完成，共 {signal_count} 条\n")


def create_user_points(db: SessionLocal, user_map: dict):
    """为每个用户创建积分记录"""
    print("⭐ 正在创建用户积分...")
    count = 0

    for user_def in TEST_USERS:
        user = user_map.get(user_def["username"])
        if not user:
            continue

        existing = db.query(UserPoints).filter(UserPoints.user_id == user.id).first()
        if existing:
            print(f"  {user_def['username']} 积分记录已存在，跳过")
            continue

        points = UserPoints(
            user_id=user.id,
            total_points=user_def["points"],
            level=user_def["level"],
        )
        db.add(points)
        count += 1
        print(f"  {user_def['username']}: {user_def['points']} 积分, 等级 {user_def['level']}")

    db.commit()
    print(f"✅ 积分记录创建完成，共 {count} 条\n")


def create_point_transactions(db: SessionLocal, user_map: dict):
    """为每个用户创建积分交易记录"""
    print("💰 正在创建积分交易记录...")
    count = 0
    base_time = datetime.now() - timedelta(days=30)

    for user_def in TEST_USERS:
        user = user_map.get(user_def["username"])
        if not user:
            continue

        # 检查是否已有交易记录
        existing_count = db.query(PointTransaction).filter(
            PointTransaction.user_id == user.id
        ).count()
        if existing_count > 0:
            print(f"  {user_def['username']} 已有交易记录，跳过")
            continue

        # 根据用户积分水平决定交易记录数量
        num_transactions = min(user_def["points"] // 10, len(POINT_TRANSACTIONS_TEMPLATE))
        accumulated = 0

        for i in range(num_transactions):
            tmpl = POINT_TRANSACTIONS_TEMPLATE[i]
            tx_time = base_time + timedelta(days=i * 3, hours=i * 2)

            tx = PointTransaction(
                user_id=user.id,
                action=tmpl["action"],
                points=tmpl["points"],
                target_type="model" if "model" in tmpl["action"] else None,
                target_id=None,
                description=tmpl["description"],
            )
            # 手动设置 created_at（ORM 默认值在 Python 侧生成，需覆盖）
            tx.created_at = tx_time

            db.add(tx)
            accumulated += tmpl["points"]
            count += 1

        print(f"  {user_def['username']}: {num_transactions} 条交易记录，累计 {accumulated} 积分")

    db.commit()
    print(f"✅ 积分交易记录创建完成，共 {count} 条\n")


def create_community_likes(db: SessionLocal, user_map: dict, community_model_map: dict):
    """创建社区点赞记录（用户互相点赞模型）"""
    print("❤️ 正在创建社区点赞记录...")
    count = 0

    usernames = list(community_model_map.keys())

    for i, liker_username in enumerate(usernames):
        liker = user_map[liker_username]

        # 每个用户点赞其他 2-3 个用户的社区模型
        for j, target_username in enumerate(usernames):
            if i == j:
                continue  # 不点赞自己的模型

            cm = community_model_map[target_username]

            # 检查是否已点赞
            existing = db.query(CommunityLike).filter(
                CommunityLike.user_id == liker.id,
                CommunityLike.community_model_id == cm.id,
            ).first()
            if existing:
                continue

            like = CommunityLike(
                user_id=liker.id,
                community_model_id=cm.id,
                community_signal_id=None,
            )
            db.add(like)
            count += 1

            # 只让前几个用户互相点赞，避免全部互赞
            if count >= len(usernames) * 2:
                break
        if count >= len(usernames) * 2:
            break

    db.commit()
    print(f"✅ 社区点赞记录创建完成，共 {count} 条\n")


def seed():
    """执行完整的种子数据创建流程"""
    print("=" * 60)
    print("  A股预测平台 - 测试数据种子脚本")
    print("=" * 60)
    print()

    # 确保数据库表已创建
    print("📦 初始化数据库表...")
    init_db()
    print()

    db = SessionLocal()

    try:
        # 1. 创建用户
        user_map = create_users(db)

        # 2. 创建模型
        model_map = create_models(db, user_map)

        # 3. 发布社区模型
        community_model_map = create_community_models(db, user_map, model_map)

        # 4. 创建社区信号
        create_community_signals(db, user_map, community_model_map)

        # 5. 创建积分
        create_user_points(db, user_map)

        # 6. 创建积分交易记录
        create_point_transactions(db, user_map)

        # 7. 创建社区点赞
        create_community_likes(db, user_map, community_model_map)

        print("=" * 60)
        print("  ✅ 测试数据创建完成！")
        print("=" * 60)
        print()
        print("测试账号信息：")
        print("-" * 50)
        for user_def in TEST_USERS:
            print(f"  {user_def['display_name']}: {user_def['username']} / {user_def['password']}")
        print("-" * 50)

    except Exception as e:
        db.rollback()
        print(f"\n❌ 种子数据创建失败: {e}")
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="A股预测平台测试数据种子脚本")
    parser.add_argument("--clean", action="store_true", help="清除旧测试数据后重新创建")
    args = parser.parse_args()

    if args.clean:
        # 确保数据库表存在后再清除
        init_db()
        db = SessionLocal()
        try:
            clean_test_data(db)
        except Exception as e:
            db.rollback()
            print(f"❌ 清除数据失败: {e}")
            raise
        finally:
            db.close()

    seed()


if __name__ == "__main__":
    main()
