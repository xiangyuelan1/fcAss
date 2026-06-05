"""
社区模型每日自动预测服务

负责：
1. 回溯前一天预测与实际涨跌对比，更新统计
2. 对每个社区模型取前3只股票执行当日预测
3. 更新连胜、准确率、称号
"""
import asyncio
import logging
from datetime import datetime, timedelta

from app.core.database import SessionLocal
from app.models.community import CommunityModel, CommunitySignal
from app.models.training import TrainingTask

logger = logging.getLogger(__name__)


def _compute_badges(total: int, correct: int, current_streak: int, best_streak: int) -> list[str]:
    """根据预测战绩计算称号列表"""
    badges: list[str] = []
    accuracy = correct / total if total > 0 else 0.0

    if current_streak >= 7:
        badges.append("七日连胜 🏆")
    elif current_streak >= 5:
        badges.append("五连绝世 ⚡")
    elif current_streak >= 3:
        badges.append("连中三元 🔥")

    if total >= 10:
        if accuracy >= 0.8:
            badges.append("预言大师 👑")
        elif accuracy >= 0.7:
            badges.append("精准猎手 🎯")
        if accuracy < 0.3:
            badges.append("反向指标 🔄")

    if total >= 100:
        badges.append("百战老兵 💎")
    elif total >= 30:
        badges.append("资深预测 📊")

    return badges


def _retrospect_yesterday_predictions(db, cm, daily_records, data_service) -> bool:
    """回溯前一天的预测与实际涨跌对比，更新正确/错误统计

    返回是否有记录被更新。
    """
    yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    updated = False

    for dr in daily_records:
        if dr.get("date") == yesterday_str and dr.get("actual") is None:
            try:
                prices = data_service.get_stock_prices(dr["stock_code"], limit=2)
                if prices and len(prices) >= 2:
                    change_pct = float(prices[-1].change_pct) if prices[-1].change_pct else 0.0
                    actual = "up" if change_pct > 0 else ("down" if change_pct < 0 else "flat")
                    dr["actual"] = actual
                    dr["correct"] = (dr["direction"] == actual)
                    updated = True
            except Exception:
                pass

    return updated


def _update_prediction_stats(record, daily_records):
    """根据已验证记录更新连胜、准确率、称号"""
    verified = [dr for dr in daily_records if dr.get("actual") is not None]
    total_p = len(verified)
    correct_p = sum(1 for dr in verified if dr.get("correct") is True)
    accuracy = round(correct_p / total_p, 3) if total_p > 0 else 0.0

    # 计算连胜
    current_streak = 0
    best_streak = 0
    streak = 0
    for dr in reversed(verified):
        if dr.get("correct") is True:
            streak += 1
            best_streak = max(best_streak, streak)
        else:
            if current_streak == 0:
                current_streak = streak
            streak = 0
    if current_streak == 0 and streak > 0:
        current_streak = streak

    record["total_predictions"] = total_p
    record["correct_predictions"] = correct_p
    record["accuracy"] = accuracy
    record["current_streak"] = current_streak
    record["best_streak"] = best_streak
    record["badges"] = _compute_badges(total_p, correct_p, current_streak, best_streak)


def _execute_daily_predictions(db, cm, daily_records, record, data_service, feature_service,
                               model, input_size, feature_window):
    """对社区模型关联股票的前3只执行当日预测"""
    from app.api.prediction import _do_predict, _prediction_to_label

    today_str = datetime.now().strftime("%Y-%m-%d")
    stock_codes = cm.stock_codes or []
    predict_codes = stock_codes[:3]

    for code in predict_codes:
        # 跳过今日已预测的股票
        existing_today = any(
            dr.get("date") == today_str and dr.get("stock_code") == code
            for dr in daily_records
        )
        if existing_today:
            continue

        try:
            stock_info = data_service.get_stock_by_code(code)
            if not stock_info:
                data_service.fetch_stock_data(code)

            df = feature_service.calculate_features(
                stock_code=code,
                indicators=cm.features,
                indicator_params=cm.feature_config or {},
                limit=5000,
            )
            if df is None or df.empty:
                continue

            exclude_cols = {'id', 'stock_code', 'open', 'high', 'low', 'close', 'volume', 'amount',
                            'change_pct', 'change_amount', 'adj_close'}
            feature_cols = [col for col in df.columns if col not in exclude_cols]
            if not feature_cols:
                continue

            if feature_window > 1:
                if len(feature_cols) * feature_window != input_size:
                    continue
            else:
                if len(feature_cols) != input_size:
                    continue

            df_features = df[feature_cols].copy()
            df_features = (df_features - df_features.mean()) / df_features.std()

            prediction = _do_predict(model, cm.model_type, cm.model_config, df_features, input_size, feature_window)
            direction = _prediction_to_label(prediction, cm.target)

            # 写入 CommunitySignal
            signal = CommunitySignal(
                user_id=cm.user_id,
                community_model_id=cm.id,
                stock_code=code,
                direction=direction,
                prediction_value=round(float(prediction), 4),
                prediction_date=today_str,
            )
            db.add(signal)

            # 写入 daily_records
            daily_records.insert(0, {
                "date": today_str,
                "stock_code": code,
                "direction": direction,
                "actual": None,
                "correct": None,
            })

        except Exception as e:
            logger.warning(f"[自动预测] 模型{cm.id} 股票{code} 预测失败: {e}")
            continue


async def auto_predict_community_models():
    """社区模型每日自动预测定时任务

    首次启动延迟5分钟执行，之后每24小时执行一次。
    对每个开启自动预测的活跃社区模型，取其关联股票的前3只进行预测，
    同时回溯前一天预测与实际涨跌对比，更新正确/错误统计和称号。
    """
    await asyncio.sleep(300)

    while True:
        try:
            db = SessionLocal()
            try:
                logger.info("[自动预测] 开始执行每日自动预测...")
                _run_daily_predictions(db)
                logger.info("[自动预测] 每日自动预测完成")
            except Exception as e:
                logger.error(f"[自动预测] 执行失败: {e}")
                db.rollback()
            finally:
                db.close()
        except Exception as e:
            logger.error(f"[自动预测] 会话创建失败: {e}")

        # 每24小时执行一次
        await asyncio.sleep(86400)


def verify_yesterday_predictions():
    """验证昨日所有用户的预测结果

    对比每条预测的方向与实际涨跌方向，更新 PredictionShare 的 prediction_data 字段：
    - verified: True
    - correct: True/False
    - actual_direction: 实际涨跌方向
    - actual_change_pct: 实际涨跌幅

    同时更新用户的预测统计信息。
    """
    from app.models.prediction_share import PredictionShare
    from app.services.data_service import DataService

    db = SessionLocal()
    try:
        # 查询昨日创建的所有预测
        yesterday = datetime.now() - timedelta(days=1)
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

        predictions = db.query(PredictionShare).filter(
            PredictionShare.created_at >= yesterday,
            PredictionShare.created_at < today_start,
        ).all()

        if not predictions:
            logger.info("[验证] 无昨日预测需要验证")
            return

        data_service = DataService(db)
        verified_count = 0
        correct_count = 0

        for pred in predictions:
            try:
                # 跳过已验证的记录
                if pred.prediction_data and pred.prediction_data.get('verified'):
                    continue

                # 获取预测股票的最新价格
                prices = data_service.get_stock_prices(pred.stock_code, limit=2)
                if not prices or len(prices) < 2:
                    continue

                # 计算实际涨跌方向
                latest_close = float(prices[-1].close) if prices[-1].close else None
                prev_close = float(prices[-2].close) if prices[-2].close else None

                if latest_close is None or prev_close is None or prev_close == 0:
                    continue

                actual_change = (latest_close - prev_close) / prev_close
                if actual_change > 0.001:
                    actual_direction = 'up'
                elif actual_change < -0.001:
                    actual_direction = 'down'
                else:
                    actual_direction = 'flat'

                correct = (pred.direction == actual_direction)

                # 更新预测记录（JSON 字段需整体赋值以触发 SQLAlchemy 变更检测）
                data = pred.prediction_data or {}
                data['verified'] = True
                data['correct'] = correct
                data['actual_direction'] = actual_direction
                data['actual_change_pct'] = round(actual_change * 100, 2)
                pred.prediction_data = data

                verified_count += 1
                if correct:
                    correct_count += 1

            except Exception as e:
                logger.warning(f"[验证] 预测记录{pred.id}验证失败: {e}")
                continue

        db.commit()
        if verified_count > 0:
            logger.info(f"[验证] 昨日预测验证完成: {verified_count}条已验证, {correct_count}条正确, 准确率{correct_count/verified_count:.1%}")
        else:
            logger.info("[验证] 无可验证预测")
    except Exception as e:
        db.rollback()
        logger.warning(f"[验证] 预测验证失败: {e}")
    finally:
        db.close()


def _run_daily_predictions(db):
    """执行一轮完整的每日预测流程（同步）"""
    from app.services.training_service import ModelCheckpoint
    from app.services.feature_service import FeatureService
    from app.services.data_service import DataService

    # 先验证昨日预测
    try:
        verify_yesterday_predictions()
    except Exception as e:
        logger.warning(f"[验证] 昨日预测验证失败: {e}")

    models = db.query(CommunityModel).filter(
        CommunityModel.auto_predict == True,
        CommunityModel.is_active == True,
    ).all()

    feature_service = FeatureService(db)
    data_service = DataService(db)

    for cm in models:
        try:
            # 加载训练好的模型权重
            latest_task = db.query(TrainingTask).filter(
                TrainingTask.model_id == cm.source_model_id,
                TrainingTask.status == 'completed',
            ).order_by(TrainingTask.created_at.desc()).first()

            if not latest_task:
                continue

            try:
                model, metrics, input_size, feature_window = ModelCheckpoint.load_checkpoint(latest_task.id)
            except (FileNotFoundError, ValueError):
                continue

            record = cm.prediction_record or {}
            daily_records = record.get("daily_records", [])

            # 步骤1：回溯昨日预测
            updated = _retrospect_yesterday_predictions(db, cm, daily_records, data_service)
            if updated:
                _update_prediction_stats(record, daily_records)

            # 步骤2：执行今日预测
            _execute_daily_predictions(
                db, cm, daily_records, record,
                data_service, feature_service,
                model, input_size, feature_window,
            )

            # 更新 total_predictions（包含未验证的）
            record["daily_records"] = daily_records
            record["total_predictions"] = len(daily_records)
            cm.prediction_record = record

        except Exception as e:
            logger.warning(f"[自动预测] 模型{cm.id} 处理失败: {e}")
            continue

    db.commit()
    logger.info(f"[自动预测] 完成，处理了 {len(models)} 个社区模型")
