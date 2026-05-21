import React, { useEffect, useState } from 'react'
import { Row, Col, Card, Statistic, List, Tag, Button, Steps, Alert, message, Divider, Collapse, Switch, Skeleton } from 'antd'
import {
  DatabaseOutlined,
  RobotOutlined,
  PlayCircleOutlined,
  LineChartOutlined,
  ArrowRightOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  WarningOutlined,
  RiseOutlined,
  FallOutlined,
  MinusOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { dataApi, modelApi, trainingApi, backtestApi, predictionApi, authApi, signalsApi } from '@/services/api'
import { UserModel, TrainingTask, PredictionShareItem } from '@/types'
import { useAuthStore } from '@/store'
import OnboardingGuide, { isOnboardingCompleted } from '@/components/OnboardingGuide'
import MascotBull from '@/components/MascotBull'
import { marketWs } from '@/services/websocket'

interface StaleModel {
  model_id: number
  model_name: string
  model_type: string
  task_id: number
  trained_at: string
  stale_stocks: { code: string; latest_data_date: string; trained_at: string }[]
  new_data_count: number
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  const [stats, setStats] = useState({
    stockCount: 0,
    modelCount: 0,
    taskCount: 0,
    backtestCount: 0,
    completedTaskCount: 0,
  })
  const [recentModels, setRecentModels] = useState<UserModel[]>([])
  const [recentTasks, setRecentTasks] = useState<TrainingTask[]>([])
  const [staleModels, setStaleModels] = useState<StaleModel[]>([])
  const [syncing, setSyncing] = useState(false)
  const [onboardingVisible, setOnboardingVisible] = useState(false)
  const [myPredictions, setMyPredictions] = useState<PredictionShareItem[]>([])
  const [loading, setLoading] = useState(true)
  const [liveQuotes, setLiveQuotes] = useState<any[]>([])
  const [signals, setSignals] = useState<any[]>([])

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await Promise.all([fetchDashboardData(), fetchMyPredictions(), fetchSignals()])
      setLoading(false)
    }
    init()
  }, [])

  // WebSocket实时行情连接
  useEffect(() => {
    marketWs.connect()
    const unsub = marketWs.onMarketData((data) => setLiveQuotes(data))
    return () => { unsub(); marketWs.disconnect() }
  }, [])

  useEffect(() => {
    if (!isOnboardingCompleted() && stats.modelCount === 0 && stats.stockCount >= 0) {
      const timer = setTimeout(() => setOnboardingVisible(true), 800)
      return () => clearTimeout(timer)
    }
  }, [stats.modelCount, stats.stockCount])

  const fetchMyPredictions = async () => {
    try {
      const res: any = await predictionApi.getMyPredictions()
      const items = res?.items || (Array.isArray(res) ? res : [])
      setMyPredictions(Array.isArray(items) ? items : [])
    } catch {}
  }

  const fetchSignals = async () => {
    try {
      const res: any = await signalsApi.getSignals()
      setSignals(res?.signals || [])
    } catch {}
  }

  const fetchDashboardData = async () => {
    const results = await Promise.allSettled([
      dataApi.getStocks(),
      modelApi.getModels(),
      trainingApi.getTasks(),
      backtestApi.getResults(),
    ])

    const [stocksRes, modelsRes, tasksRes, backtestsRes] = results.map((r) =>
      r.status === 'fulfilled' ? r.value : null
    )

    const stocksData = (stocksRes as any)?.items || (Array.isArray(stocksRes) ? stocksRes : [])
    const modelsData = (modelsRes as any)?.items || (Array.isArray(modelsRes) ? modelsRes : [])
    const tasksData = (tasksRes as any)?.items || (Array.isArray(tasksRes) ? tasksRes : [])
    const backtestsData = (backtestsRes as any)?.items || (Array.isArray(backtestsRes) ? backtestsRes : [])

    setStats({
      stockCount: stocksData.length || 0,
      modelCount: modelsData.length || 0,
      taskCount: tasksData.length || 0,
      backtestCount: backtestsData.length || 0,
      completedTaskCount: (tasksData || []).filter((t: TrainingTask) => t.status === 'completed').length,
    })

    setRecentModels(modelsData.slice(0, 5))
    setRecentTasks(tasksData.slice(0, 5))

    try {
      const staleRes: any = await dataApi.checkStaleData()
      setStaleModels(staleRes.stale_models || [])
    } catch {}
  }

  const handleBatchSync = async () => {
    setSyncing(true)
    try {
      const res: any = await dataApi.batchSync()
      message.success(`同步完成: ${res.synced_count} 只成功, ${res.failed_count} 只失败`)
      setStaleModels([])
      fetchDashboardData()
    } catch {
      message.error('批量同步失败')
    } finally {
      setSyncing(false)
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'default',
      trained: 'success',
      deployed: 'processing',
      pending: 'default',
      running: 'processing',
      completed: 'success',
      failed: 'error',
      cancelled: 'warning',
    }
    return colors[status] || 'default'
  }

  const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
      draft: '草稿',
      trained: '已训练',
      deployed: '已部署',
      pending: '待执行',
      running: '运行中',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消',
    }
    return texts[status] || status
  }

  // 预测方向信息映射，用于"我的预测结果"展示
  const getDirectionInfo = (direction: string) => {
    if (direction === 'up' || direction === '看涨') return { label: '看涨', color: 'red', icon: <RiseOutlined /> }
    if (direction === 'down' || direction === '看跌') return { label: '看跌', color: 'green', icon: <FallOutlined /> }
    return { label: '震荡', color: 'default', icon: <MinusOutlined /> }
  }

  const currentStep = (() => {
    if (stats.stockCount === 0) return 0
    if (stats.modelCount === 0) return 1
    if (stats.completedTaskCount === 0) return 2
    if (stats.backtestCount === 0) return 3
    return 4
  })()

  const stepActions: Record<number, { path: string; text: string }> = {
    0: { path: '/data', text: '获取股票数据' },
    1: { path: '/models/build', text: '创建模型' },
    2: { path: '/train-predict', text: '训练模型' },
    3: { path: '/train-predict', text: '执行回测' },
    4: { path: '/train-predict', text: '开始预测' },
  }

  if (loading) {
    return (
      <div>
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          {[1, 2, 3, 4].map((i) => (
            <Col xs={24} sm={12} lg={6} key={i}>
              <Card size="small"><Skeleton active paragraph={{ rows: 1 }} /></Card>
            </Col>
          ))}
        </Row>
        <Card style={{ marginBottom: 20 }} size="small">
          <Skeleton active paragraph={{ rows: 2 }} />
        </Card>
        <Card style={{ marginBottom: 20 }} size="small">
          <Skeleton active paragraph={{ rows: 4 }} />
        </Card>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card size="small"><Skeleton active paragraph={{ rows: 3 }} /></Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card size="small"><Skeleton active paragraph={{ rows: 3 }} /></Card>
          </Col>
        </Row>
      </div>
    )
  }

  return (
    <div>
      {/* 标题区 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <MascotBull mood="chill" size="small" />
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            我的工作台
          </h1>
        </div>
        <Button type="link" icon={<QuestionCircleOutlined />} onClick={() => setOnboardingVisible(true)}>
          新手引导
        </Button>
      </div>
      <p className="page-description" style={{ marginBottom: 20 }}>
        管理你的模型、查看预测结果、追踪训练进度
      </p>

      {/* 数据过期警告 */}
      {staleModels.length > 0 && (
        <Alert
          style={{ marginBottom: 20 }}
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message={`有 ${staleModels.length} 个模型的数据已过期，建议更新后重新训练`}
          description={
            <div>
              {staleModels.map((m) => (
                <div key={m.model_id} style={{ marginBottom: 4 }}>
                  <Tag color="orange">{m.model_name}</Tag>
                  <Tag>{m.model_type.toUpperCase()}</Tag>
                  <span style={{ color: '#999', fontSize: 12 }}>
                    {m.new_data_count} 只股票有新数据
                  </span>
                </div>
              ))}
              <Button
                type="primary"
                size="small"
                icon={<SyncOutlined spin={syncing} />}
                loading={syncing}
                onClick={handleBatchSync}
                style={{ marginTop: 8 }}
              >
                一键更新所有数据
              </Button>
            </div>
          }
        />
      )}

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/data')} size="small">
            <Statistic
              title="股票数据"
              value={stats.stockCount}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#1890ff', fontSize: 22 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/models')} size="small">
            <Statistic
              title="我的模型"
              value={stats.modelCount}
              prefix={<RobotOutlined />}
              valueStyle={{ color: '#52c41a', fontSize: 22 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/train-predict')} size="small">
            <Statistic
              title="训练任务"
              value={stats.taskCount}
              prefix={<PlayCircleOutlined />}
              valueStyle={{ color: '#faad14', fontSize: 22 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/train-predict')} size="small">
            <Statistic
              title="可预测模型"
              value={stats.completedTaskCount}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: '#722ed1', fontSize: 22 }}
            />
          </Card>
        </Col>
      </Row>

      {/* 实时行情 */}
      {liveQuotes.length > 0 && (
        <Card title="📊 实时行情" size="small" style={{ marginTop: 16, marginBottom: 16 }}>
          <Row gutter={[8, 8]}>
            {liveQuotes.map((q: any) => (
              <Col xs={12} sm={8} md={4} key={q.code}>
                <div style={{ padding: '8px 12px', background: '#fafafa', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#999' }}>{q.code}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: q.change_pct > 0 ? '#f5222d' : q.change_pct < 0 ? '#52c41a' : '#333' }}>
                    {q.close?.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 11, color: q.change_pct > 0 ? '#f5222d' : q.change_pct < 0 ? '#52c41a' : '#999' }}>
                    {q.change_pct > 0 ? '+' : ''}{q.change_pct?.toFixed(2)}%
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* 交易信号 */}
      {signals.length > 0 && (
        <Card title="🔔 交易信号" size="small" style={{ marginTop: 16, marginBottom: 16 }}>
          <Row gutter={[8, 8]}>
            {signals.slice(0, 6).map((s: any, i: number) => (
              <Col xs={24} sm={12} md={8} key={i}>
                <div style={{
                  padding: 12,
                  background: s.signal_type.includes('buy') ? '#fff1f0' : s.signal_type.includes('sell') ? '#f6ffed' : '#fafafa',
                  borderRadius: 8,
                  borderLeft: `3px solid ${s.signal_type.includes('buy') ? '#f5222d' : s.signal_type.includes('sell') ? '#52c41a' : '#faad14'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>{s.stock_code}</span>
                    <Tag color={s.signal_type.includes('buy') ? 'red' : s.signal_type.includes('sell') ? 'green' : 'default'}>
                      {s.signal_type === 'strong_buy' ? '强烈买入' : s.signal_type === 'buy' ? '买入' : s.signal_type === 'strong_sell' ? '强烈卖出' : s.signal_type === 'sell' ? '卖出' : '观望'}
                    </Tag>
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                    {s.model_name} · 置信度 {Math.round(s.confidence * 100)}%
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* 我的预测结果 */}
      <Divider orientation="left" style={{ fontSize: 15, color: '#666' }}>
        我的预测结果
      </Divider>

      <Alert
        message="预测结果会自动展示在工作台，同一只股票的预测结果会归在一起"
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
      />

      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#666' }}>每日自动清空预测结果</span>
        <Switch
          checked={user?.auto_clear_predictions_daily !== false}
          onChange={async (checked) => {
            try {
              await authApi.updateSettings({ auto_clear_predictions_daily: checked })
              setUser({ ...user!, auto_clear_predictions_daily: checked })
              message.success(checked ? '已开启每日自动清空' : '已关闭每日自动清空')
            } catch {
              message.error('更新设置失败')
            }
          }}
        />
      </div>

      {myPredictions.length > 0 ? (
        <Collapse
          size="small"
          style={{ marginBottom: 20 }}
          items={Object.entries(
            myPredictions.reduce((acc, pred) => {
              const key = pred.stock_code
              if (!acc[key]) acc[key] = []
              acc[key].push(pred)
              return acc
            }, {} as Record<string, PredictionShareItem[]>)
          ).map(([code, preds]) => {
            const latest = preds[0]
            const dirInfo = getDirectionInfo(latest.direction || 'flat')
            return {
              key: code,
              label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag color="blue">{code}</Tag>
                  <span>{latest.stock_name || code}</span>
                  <Tag color={dirInfo.color}>{dirInfo.icon} {dirInfo.label}</Tag>
                  <span style={{ fontSize: 12, color: '#999' }}>
                    置信度 {Math.round((latest.confidence || 0) * 100)}%
                  </span>
                  <span style={{ fontSize: 12, color: '#999' }}>
                    {latest.created_at?.slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
              ),
              children: (
                <List
                  size="small"
                  dataSource={preds}
                  renderItem={(pred) => {
                    const predDirInfo = getDirectionInfo(pred.direction || 'flat')
                    return (
                      <List.Item>
                        <List.Item.Meta
                          title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Tag color={predDirInfo.color}>{predDirInfo.icon} {predDirInfo.label}</Tag>
                              <span style={{ fontSize: 12 }}>
                                置信度 {Math.round((pred.confidence || 0) * 100)}%
                              </span>
                              {pred.prediction_value != null && (
                                <span style={{ fontSize: 12, color: '#666' }}>
                                  预测值: {pred.prediction_value.toFixed(2)}
                                </span>
                              )}
                            </div>
                          }
                          description={
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 12, color: '#999' }}>
                                {pred.model_name || '未知模型'}
                              </span>
                              <span style={{ fontSize: 12, color: '#999' }}>
                                {pred.created_at?.slice(0, 16).replace('T', ' ')}
                              </span>
                            </div>
                          }
                        />
                      </List.Item>
                    )
                  }}
                />
              ),
            }
          })}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#999', marginBottom: 20 }}>
          <ThunderboltOutlined style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
          暂无预测结果，完成训练后即可进行预测
        </div>
      )}

      {/* 引导式流程进度 */}
      <Card style={{ marginBottom: 20 }} size="small">
        <Steps
          current={currentStep}
          size="small"
          items={[
            { title: '获取数据', icon: stats.stockCount > 0 ? <CheckCircleOutlined /> : <DatabaseOutlined /> },
            { title: '构建模型', icon: stats.modelCount > 0 ? <CheckCircleOutlined /> : <RobotOutlined /> },
            { title: '训练模型', icon: stats.completedTaskCount > 0 ? <CheckCircleOutlined /> : <PlayCircleOutlined /> },
            { title: '回测验证', icon: stats.backtestCount > 0 ? <CheckCircleOutlined /> : <LineChartOutlined /> },
            { title: '智能预测', icon: <ThunderboltOutlined /> },
          ]}
        />
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Button
            type="primary"
            icon={<ArrowRightOutlined />}
            onClick={() => navigate(stepActions[currentStep].path)}
          >
            {stepActions[currentStep].text}
          </Button>
        </div>
      </Card>

      {/* 最近模型 + 最近任务 */}
      <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
        <Col xs={24} lg={12}>
          <Card
            title="最近模型"
            size="small"
            extra={<Button type="link" size="small" onClick={() => navigate('/models')}>查看全部</Button>}
          >
            <List
              dataSource={recentModels}
              size="small"
              renderItem={(model) => (
                <List.Item
                  actions={[
                    model.status === 'trained' ? (
                      <Button type="link" size="small" onClick={() => navigate('/train-predict')}>预测</Button>
                    ) : model.status === 'draft' ? (
                      <Button type="link" size="small" onClick={() => navigate('/train-predict')}>训练</Button>
                    ) : null,
                    <Button type="link" size="small" onClick={() => navigate(`/models/build/${model.id}`)}>编辑</Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={model.name}
                    description={
                      <div>
                        <Tag>{model.model_type?.toUpperCase()}</Tag>
                        <Tag color={getStatusColor(model.status)}>{getStatusText(model.status)}</Tag>
                      </div>
                    }
                  />
                </List.Item>
              )}
              locale={{ emptyText: '暂无模型，点击"创建模型"开始' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="最近任务"
            size="small"
            extra={<Button type="link" size="small" onClick={() => navigate('/train-predict')}>查看全部</Button>}
          >
            <List
              dataSource={recentTasks}
              size="small"
              renderItem={(task) => (
                <List.Item
                  actions={[
                    task.status === 'completed' ? (
                      <Button type="link" size="small" onClick={() => navigate('/train-predict')}>预测</Button>
                    ) : null,
                    <Button type="link" size="small" onClick={() => navigate('/train-predict')}>详情</Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={`任务 #${task.id}`}
                    description={
                      <div>
                        <Tag color={getStatusColor(task.status)}>{getStatusText(task.status)}</Tag>
                        {task.start_time && (
                          <span style={{ marginLeft: 8, color: '#999', fontSize: 12 }}>
                            {new Date(task.start_time).toLocaleString()}
                          </span>
                        )}
                      </div>
                    }
                  />
                </List.Item>
              )}
              locale={{ emptyText: '暂无训练任务' }}
            />
          </Card>
        </Col>
      </Row>

      <OnboardingGuide
        open={onboardingVisible}
        onClose={() => setOnboardingVisible(false)}
      />
    </div>
  )
}

export default Dashboard
