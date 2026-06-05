import React, { useState } from 'react'
import { Card, Button, Tag, Progress, Space, DatePicker, message } from 'antd'
import {
  PlusOutlined,
  RobotOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
  BarChartOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { trainingApi, predictionApi, backtestApi } from '@/services/api'
import { UserModel, TrainingTask } from '@/types'
import FunPredictionResult, { FunPredictionResultProps } from '@/components/FunPredictionResult'
import StockCodeInput from '@/components/StockCodeInput'
import { MyModelsCardProps, ProgressData, ModelPredictResult, ModelBacktestResult } from './types'

/* ================================================================
 *  辅助函数：训练阶段映射
 * ================================================================ */

const stageMap: Record<string, string> = {
  data_preparation: '数据准备中',
  training: '模型训练中',
  validation: '验证中',
  completed: '训练完成',
}

const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${Math.floor(seconds)}秒`
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  if (minutes < 60) return `${minutes}分${secs}秒`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}时${mins}分`
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    draft: 'default', trained: 'success', deployed: 'processing',
    pending: 'default', running: 'processing', completed: 'success',
    failed: 'error', cancelled: 'warning',
  }
  return colors[status] || 'default'
}

const getStatusText = (status: string) => {
  const texts: Record<string, string> = {
    draft: '草稿', trained: '已训练', deployed: '已部署',
    pending: '待执行', running: '运行中', completed: '已完成',
    failed: '失败', cancelled: '已取消',
  }
  return texts[status] || status
}

const getElapsedTime = (task: TrainingTask) => {
  if (!task.start_time) return 0
  const start = new Date(task.start_time).getTime()
  const end = task.end_time ? new Date(task.end_time).getTime() : Date.now()
  return (end - start) / 1000
}

const getEstimatedRemaining = (progress: number, elapsedSeconds: number) => {
  if (progress <= 0 || progress >= 100) return null
  const estimatedTotal = elapsedSeconds / (progress / 100)
  const remaining = estimatedTotal - elapsedSeconds
  return Math.max(0, remaining)
}

/**
 * 我的模型卡片
 * 展示用户的模型列表，含训练进度、预测展开、回测展开等交互。
 */
const MyModelsCard: React.FC<MyModelsCardProps> = ({
  models,
  tasks,
  progressMap,
  backtestResults,
  onTrain,
  onCreateModel,
  onRefresh,
}) => {
  const navigate = useNavigate()

  /* 展开的预测/回测区域 */
  const [expandedPredictModelId, setExpandedPredictModelId] = useState<number | null>(null)
  const [modelPredictStockCode, setModelPredictStockCode] = useState('600519')
  const [predictingTaskId, setPredictingTaskId] = useState<number | null>(null)
  const [predictResult, setPredictResult] = useState<Record<number, ModelPredictResult>>({})

  const [expandedBacktestModelId, setExpandedBacktestModelId] = useState<number | null>(null)
  const [backtestStockCode, setBacktestStockCode] = useState('600519')
  const [backtestStartDate, setBacktestStartDate] = useState('')
  const [backtestEndDate, setBacktestEndDate] = useState('')
  const [backtestResult, setBacktestResult] = useState<Record<number, ModelBacktestResult>>({})
  const [backtesting, setBacktesting] = useState(false)

  const handleExpandPredict = (modelId: number) => {
    setExpandedPredictModelId(expandedPredictModelId === modelId ? null : modelId)
    setExpandedBacktestModelId(null)
  }

  const handleExpandBacktest = (modelId: number) => {
    setExpandedBacktestModelId(expandedBacktestModelId === modelId ? null : modelId)
    setExpandedPredictModelId(null)
  }

  const handleModelPredict = async (model: UserModel) => {
    const completedTask = tasks.find(t => t.model_id === model.id && t.status === 'completed')
    if (!completedTask) {
      message.warning('该模型没有已完成的训练任务，请先训练')
      return
    }
    setPredictingTaskId(completedTask.id)
    try {
      const data = (await predictionApi.predict({
        task_id: completedTask.id,
        stock_code: modelPredictStockCode,
        days: 1,
      })) as ModelPredictResult
      setPredictResult(prev => ({ ...prev, [model.id]: data }))
      onRefresh()
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(typeof detail === 'string' ? detail : '预测失败')
    } finally {
      setPredictingTaskId(null)
    }
  }

  const handleModelBacktest = async (model: UserModel) => {
    const completedTask = tasks.find(t => t.model_id === model.id && t.status === 'completed')
    if (!completedTask) {
      message.warning('该模型没有已完成的训练任务，请先训练')
      return
    }
    if (!backtestStartDate || !backtestEndDate) {
      message.warning('请选择回测日期范围')
      return
    }
    setBacktesting(true)
    try {
      const data = (await backtestApi.runBacktest({
        task_id: completedTask.id,
        start_date: backtestStartDate,
        end_date: backtestEndDate,
      })) as ModelBacktestResult
      setBacktestResult(prev => ({ ...prev, [model.id]: data }))
      onRefresh()
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(typeof detail === 'string' ? detail : '回测失败')
    } finally {
      setBacktesting(false)
    }
  }

  const handleRetryTask = async (task: TrainingTask) => {
    try {
      await trainingApi.createTask({ model_id: task.model_id })
      message.success('已重新创建训练任务')
      onRefresh()
    } catch {
      message.error('重试失败')
    }
  }

  return (
    <Card
      title="🤖 我的模型"
      size="small"
      style={{ marginBottom: 16 }}
      extra={
        <Space>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={onCreateModel}>
            创建新模型
          </Button>
          <Button type="link" size="small" onClick={() => navigate('/models')}>
            查看全部
          </Button>
        </Space>
      }
    >
      {models.length > 0 ? (
        models.map(model => {
          const modelTasks = tasks.filter(t => t.model_id === model.id)
          const runningTask = modelTasks.find(t => t.status === 'running')
          const completedTask = modelTasks.find(t => t.status === 'completed')
          const modelBacktest = backtestResults.find((bt: any) => bt.model_id === model.id)
          const progress: ProgressData | null = runningTask ? progressMap[runningTask.id] : null

          return (
            <div
              key={model.id}
              style={{
                padding: '8px 12px',
                marginBottom: 6,
                background: '#fafafa',
                borderRadius: 6,
                borderLeft: `3px solid ${model.status === 'trained' ? '#52c41a' : model.status === 'draft' ? '#d9d9d9' : '#1890ff'}`,
              }}
            >
              {/* 第一行：模型名称 + 算法Tag + 状态Tag + 操作按钮 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {model.name}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                    <Tag color="blue" style={{ fontSize: 11, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                      {model.model_type?.toUpperCase()}
                    </Tag>
                    <Tag color={getStatusColor(model.status)} style={{ fontSize: 11, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                      {getStatusText(model.status)}
                    </Tag>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                  {model.status === 'draft' && (
                    <>
                      <Button size="small" type="primary" onClick={() => onTrain(model.id)}>训练</Button>
                      <Button size="small" onClick={() => navigate(`/models/build/${model.id}`)}>编辑</Button>
                    </>
                  )}
                  {model.status === 'trained' && (
                    <>
                      <Button size="small" type="primary" onClick={() => handleExpandPredict(model.id)}>
                        {expandedPredictModelId === model.id ? '收起' : '预测'}
                      </Button>
                      <Button size="small" onClick={() => handleExpandBacktest(model.id)}>
                        {expandedBacktestModelId === model.id ? '收起' : '回测'}
                      </Button>
                    </>
                  )}
                  {model.status === 'deployed' && (
                    <>
                      <Button size="small" type="primary" onClick={() => handleExpandPredict(model.id)}>
                        {expandedPredictModelId === model.id ? '收起' : '预测'}
                      </Button>
                      <Button size="small" onClick={() => navigate(`/models/build/${model.id}`)}>编辑</Button>
                    </>
                  )}
                </div>
              </div>

              {/* 运行中的训练任务：进度条+阶段+剩余时间 */}
              {runningTask && (
                <div style={{ marginTop: 6 }}>
                  {progress ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666', marginBottom: 2 }}>
                        <span style={{ color: '#1890ff' }}>
                          <LoadingOutlined spin style={{ marginRight: 4 }} />
                          {stageMap[progress.stage || ''] || '处理中'}
                        </span>
                        <span>
                          ⏱ {formatDuration(progress.elapsed_seconds || getElapsedTime(runningTask))}
                          {(() => {
                            const remaining = getEstimatedRemaining(
                              progress.progress || 0,
                              progress.elapsed_seconds || getElapsedTime(runningTask),
                            )
                            return remaining !== null && remaining > 0 ? (
                              <> · 剩余 <span style={{ color: '#f5222d' }}>{formatDuration(remaining)}</span></>
                            ) : null
                          })()}
                        </span>
                      </div>
                      <Progress percent={Math.round(progress.progress || 0)} size="small" status="active" />
                    </>
                  ) : (
                    <>
                      <Progress percent={0} size="small" status="active" />
                      <div style={{ fontSize: 11, color: '#999' }}>等待训练进度...</div>
                    </>
                  )}
                </div>
              )}

              {/* 已完成的训练任务：训练指标 */}
              {completedTask && completedTask.metrics && (
                <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {Object.entries(completedTask.metrics).slice(0, 2).map(([key, value]: [string, unknown]) => {
                    if (typeof value !== 'number') return null
                    return (
                      <Tag key={key} style={{ fontSize: 10, lineHeight: '14px', padding: '0 3px', margin: 0 }}>
                        {key.toUpperCase()}: {value.toFixed(4)}
                      </Tag>
                    )
                  })}
                  {!runningTask && (
                    <>
                      <Button size="small" type="primary" style={{ fontSize: 10, lineHeight: '14px', padding: '0 4px', height: 18 }} onClick={() => handleExpandPredict(model.id)}>预测</Button>
                      <Button size="small" style={{ fontSize: 10, lineHeight: '14px', padding: '0 4px', height: 18 }} onClick={() => handleExpandBacktest(model.id)}>回测</Button>
                    </>
                  )}
                </div>
              )}

              {/* 回测结果：收益率+夏普比率 */}
              {modelBacktest && (
                <div style={{ marginTop: 4, display: 'flex', gap: 12, fontSize: 12 }}>
                  <span>
                    收益率 <strong style={{ color: (modelBacktest.total_return ?? 0) >= 0 ? '#f5222d' : '#52c41a' }}>
                      {modelBacktest.total_return != null ? `${(modelBacktest.total_return * 100).toFixed(2)}%` : '-'}
                    </strong>
                  </span>
                  <span>
                    夏普 <strong>{modelBacktest.sharpe_ratio != null ? modelBacktest.sharpe_ratio.toFixed(2) : '-'}</strong>
                  </span>
                </div>
              )}

              {/* 失败的训练任务 */}
              {modelTasks.some(t => t.status === 'failed') && (
                <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#f5222d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                    训练失败
                  </span>
                  <Button
                    size="small"
                    type="primary"
                    danger
                    style={{ fontSize: 10, lineHeight: '14px', padding: '0 4px', height: 18 }}
                    onClick={() => handleRetryTask(modelTasks.find(t => t.status === 'failed')!)}
                  >
                    重试
                  </Button>
                </div>
              )}

              {/* 展开的预测区域 */}
              {expandedPredictModelId === model.id && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: '#fff', borderRadius: 4, border: '1px solid #e6f7ff' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#1890ff' }}>
                    <ThunderboltOutlined style={{ marginRight: 4 }} />快速预测
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <StockCodeInput
                      value={modelPredictStockCode}
                      onChange={setModelPredictStockCode}
                      placeholder="股票代码，如 600519"
                      size="small"
                      style={{ flex: 1 }}
                    />
                    <Button
                      type="primary"
                      size="small"
                      icon={<ThunderboltOutlined />}
                      loading={predictingTaskId !== null && tasks.find(t => t.model_id === model.id && t.status === 'completed')?.id === predictingTaskId}
                      onClick={() => handleModelPredict(model)}
                    >
                      预测
                    </Button>
                  </div>
                  {predictResult[model.id] && (
                    <div style={{ marginTop: 8 }}>
                      <FunPredictionResult
                        direction={(predictResult[model.id].prediction_label || predictResult[model.id].direction || 'flat') as FunPredictionResultProps['direction']}
                        confidence={predictResult[model.id].confidence}
                        stockCode={modelPredictStockCode}
                        predictedPrice={predictResult[model.id].predicted_close || predictResult[model.id].predicted_price}
                        predictedChangePct={predictResult[model.id].predicted_change_pct}
                        compact={true}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 展开的回测区域 */}
              {expandedBacktestModelId === model.id && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: '#fff', borderRadius: 4, border: '1px solid #f0f0f0' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#722ed1' }}>
                    <BarChartOutlined style={{ marginRight: 4 }} />快速回测
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <StockCodeInput
                      value={backtestStockCode}
                      onChange={setBacktestStockCode}
                      placeholder="股票代码"
                      size="small"
                      style={{ width: 120 }}
                    />
                    <DatePicker
                      size="small"
                      placeholder="开始日期"
                      onChange={(_, dateString) => setBacktestStartDate(dateString as string)}
                      style={{ width: 130 }}
                    />
                    <DatePicker
                      size="small"
                      placeholder="结束日期"
                      onChange={(_, dateString) => setBacktestEndDate(dateString as string)}
                      style={{ width: 130 }}
                    />
                    <Button
                      type="primary"
                      size="small"
                      icon={<BarChartOutlined />}
                      loading={backtesting}
                      onClick={() => handleModelBacktest(model)}
                    >
                      回测
                    </Button>
                  </div>
                  {backtestResult[model.id] && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 12 }}>
                      <span>
                        收益率 <strong style={{ color: (backtestResult[model.id].total_return ?? 0) >= 0 ? '#f5222d' : '#52c41a' }}>
                          {backtestResult[model.id].total_return != null ? `${(backtestResult[model.id].total_return! * 100).toFixed(2)}%` : '-'}
                        </strong>
                      </span>
                      <span>
                        夏普比率 <strong>{backtestResult[model.id].sharpe_ratio != null ? backtestResult[model.id].sharpe_ratio!.toFixed(2) : '-'}</strong>
                      </span>
                      <span>
                        最大回撤 <strong style={{ color: '#f5222d' }}>
                          {backtestResult[model.id].max_drawdown != null ? `${(backtestResult[model.id].max_drawdown! * 100).toFixed(2)}%` : '-'}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      ) : (
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#999', fontSize: 13 }}>
          <RobotOutlined style={{ fontSize: 24, marginBottom: 4, display: 'block' }} />
          暂无模型
          <div style={{ marginTop: 8 }}>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={onCreateModel}>
              创建新模型
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

export default MyModelsCard
