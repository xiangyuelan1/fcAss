import React, { useState } from 'react'
import { Card, Button, Switch, Space, Modal, Select, message } from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { predictionApi, authApi } from '@/services/api'
import { useAuthStore } from '@/store'
import FunPredictionResult, { FunPredictionResultProps } from '@/components/FunPredictionResult'
import StockCodeInput from '@/components/StockCodeInput'
import { PredictionResultsCardProps } from './types'

/**
 * 最新预测结果卡片
 * 展示最近 3 条预测，支持"用我的模型预测"弹窗和每日自动清空开关。
 */
const PredictionResultsCard: React.FC<PredictionResultsCardProps> = ({
  predictions,
  completedTasks,
  recentModels,
  onRefreshPredictions,
}) => {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()

  /* "用我的模型预测"弹窗状态 */
  const [predictModalVisible, setPredictModalVisible] = useState(false)
  const [predictTaskId, setPredictTaskId] = useState<number | undefined>()
  const [predictStockCode, setPredictStockCode] = useState('')
  const [predicting, setPredicting] = useState(false)

  const handlePredictWithMyModel = async () => {
    if (!predictTaskId) { message.warning('请选择训练任务'); return }
    if (!predictStockCode.trim()) { message.warning('请输入股票代码'); return }
    setPredicting(true)
    try {
      await predictionApi.predict({
        task_id: predictTaskId,
        stock_code: predictStockCode.trim(),
      })
      message.success('预测完成')
      setPredictModalVisible(false)
      setPredictTaskId(undefined)
      setPredictStockCode('')
      onRefreshPredictions()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } }; message?: string })
        ?.response?.data?.detail
        || (err as Error)?.message
      message.error(detail || '预测失败')
    } finally {
      setPredicting(false)
    }
  }

  const handleAutoClearChange = async (checked: boolean) => {
    try {
      await authApi.updateSettings({ auto_clear_predictions_daily: checked })
      setUser({ ...user!, auto_clear_predictions_daily: checked })
      message.success(checked ? '已开启每日自动清空' : '已关闭每日自动清空')
    } catch {
      message.error('更新设置失败')
    }
  }

  return (
    <>
      <Card
        title="🎯 最新预测结果"
        size="small"
        style={{ marginBottom: 16 }}
        extra={
          <Space>
            <Button
              type="primary"
              size="small"
              icon={<ThunderboltOutlined />}
              onClick={() => setPredictModalVisible(true)}
            >
              用我的模型预测
            </Button>
            {predictions.length > 3 && (
              <Button type="link" size="small" onClick={() => navigate('/train-predict')}>
                查看全部
              </Button>
            )}
          </Space>
        }
      >
        <div style={{
          marginBottom: 8,
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 12, color: '#666' }}>每日自动清空</span>
          <Switch
            checked={user?.auto_clear_predictions_daily !== false}
            onChange={handleAutoClearChange}
          />
        </div>
        {predictions.length > 0 ? (
          predictions.slice(0, 3).map(pred => (
            <div key={pred.id} style={{ marginBottom: 6 }}>
              <FunPredictionResult
                direction={(pred.direction || 'flat') as FunPredictionResultProps['direction']}
                confidence={pred.confidence}
                stockCode={pred.stock_code}
                predictedPrice={pred.prediction_value}
                predictedChangePct={pred.predicted_change_pct}
                compact={true}
              />
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#999', fontSize: 13 }}>
            <ThunderboltOutlined style={{ fontSize: 24, marginBottom: 4, display: 'block' }} />
            暂无预测结果
          </div>
        )}
      </Card>

      {/* 弹窗：用我的模型预测 */}
      <Modal
        title="用我的模型预测"
        open={predictModalVisible}
        onCancel={() => {
          setPredictModalVisible(false)
          setPredictTaskId(undefined)
          setPredictStockCode('')
        }}
        onOk={handlePredictWithMyModel}
        okText="开始预测"
        confirmLoading={predicting}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>选择已完成的训练任务</div>
          <Select
            placeholder="请选择训练任务"
            value={predictTaskId}
            onChange={setPredictTaskId}
            style={{ width: '100%' }}
            options={completedTasks.map(t => {
              const m = recentModels.find(model => model.id === t.model_id)
              return {
                value: t.id,
                label: `任务#${t.id} - ${m ? `${m.name} (${m.model_type.toUpperCase()})` : `模型#${t.model_id}`}`,
              }
            })}
          />
        </div>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>输入股票代码</div>
          <StockCodeInput
            value={predictStockCode}
            onChange={setPredictStockCode}
            placeholder="如 000001"
          />
        </div>
      </Modal>
    </>
  )
}

export default PredictionResultsCard
