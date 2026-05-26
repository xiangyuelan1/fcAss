import React, { useEffect, useState, useRef } from 'react'
import {
  Row, Col, Card, Statistic, Tag, Button, Steps, Alert, message,
  Switch, Skeleton, Progress, Spin, Drawer, Modal, Select, Input, Form, Space,
} from 'antd'
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
  PlusOutlined,
  LoadingOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  dataApi, modelApi, trainingApi, backtestApi, predictionApi, authApi,
  signalsApi, watchlistApi, communityApi,
} from '@/services/api'
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

const TARGET_OPTIONS = [
  { label: '次日涨跌方向', value: 'next_day_direction' },
  { label: '次日收益率', value: 'next_day_return' },
  { label: '次日OHLC', value: 'next_day_ohlc' },
  { label: '5日价格变化', value: 'price_change_5d' },
  { label: '30日趋势', value: 'trend_30d' },
]

const MODEL_TYPE_OPTIONS = [
  { label: 'MLP', value: 'mlp' },
  { label: 'XGBoost', value: 'xgboost' },
  { label: 'LSTM', value: 'lstm' },
  { label: 'GRU', value: 'gru' },
  { label: 'LightGBM', value: 'lightgbm' },
  { label: 'RandomForest', value: 'randomforest' },
]

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
  const [watchlistQuotes, setWatchlistQuotes] = useState<any[]>([])
  const [quotesLoading, setQuotesLoading] = useState(false)

  const [progressMap, setProgressMap] = useState<Record<number, any>>({})
  const sseRefs = useRef<Record<number, EventSource>>({})

  // 快速预测（社区模型）
  const [communityModels, setCommunityModels] = useState<any[]>([])
  const [quickModelId, setQuickModelId] = useState<number | undefined>()
  const [quickStockCode, setQuickStockCode] = useState('')
  const [quickPredicting, setQuickPredicting] = useState(false)
  const [quickResult, setQuickResult] = useState<any>(null)

  // "用我的模型预测"弹窗
  const [predictModalVisible, setPredictModalVisible] = useState(false)
  const [predictTaskId, setPredictTaskId] = useState<number | undefined>()
  const [predictStockCode, setPredictStockCode] = useState('')
  const [predicting, setPredicting] = useState(false)
  const [completedTasks, setCompletedTasks] = useState<TrainingTask[]>([])

  // 自选股：添加自选
  const [addWatchlistVisible, setAddWatchlistVisible] = useState(false)
  const [addWatchlistCode, setAddWatchlistCode] = useState('')
  const [addWatchlistName, setAddWatchlistName] = useState('')
  const [addWatchlistLoading, setAddWatchlistLoading] = useState(false)
  const [watchlistId, setWatchlistId] = useState<number | null>(null)

  // 创建模型抽屉
  const [createDrawerVisible, setCreateDrawerVisible] = useState(false)
  const [createForm] = Form.useForm()
  const [creating, setCreating] = useState(false)

  // 回测结果
  const [backtestResults, setBacktestResults] = useState<any[]>([])

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await Promise.all([
        fetchDashboardData(),
        fetchMyPredictions(),
        fetchSignals(),
        fetchWatchlistQuotes(),
        fetchCommunityModels(),
        fetchBacktestResults(),
      ])
      setLoading(false)
    }
    init()
  }, [])

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

  // SSE：为运行中的训练任务建立实时连接
  useEffect(() => {
    const runningTasks = recentTasks.filter(t => t.status === 'running')
    runningTasks.forEach(task => {
      if (!sseRefs.current[task.id]) connectSSE(task.id)
    })
    return () => {
      Object.values(sseRefs.current).forEach(es => es.close())
    }
  }, [recentTasks])

  const connectSSE = (taskId: number) => {
    if (sseRefs.current[taskId]) return
    const token = localStorage.getItem('token')
    const baseUrl = (window as any).__API_BASE_URL__ || ''
    const url = `${baseUrl}/api/training/tasks/${taskId}/progress-stream?token=${token || ''}`
    const es = new EventSource(url)
    sseRefs.current[taskId] = es
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        setProgressMap(prev => ({ ...prev, [taskId]: data }))
        if (data.status === 'completed' || data.status === 'failed') {
          es.close()
          delete sseRefs.current[taskId]
          fetchDashboardData()
        }
      } catch {}
    }
    es.onerror = () => { es.close(); delete sseRefs.current[taskId] }
  }

  const fetchCommunityModels = async () => {
    try {
      const res: any = await communityApi.getModels({ page_size: 20 })
      const items = res?.items || (Array.isArray(res) ? res : [])
      setCommunityModels(Array.isArray(items) ? items : [])
    } catch {}
  }

  const fetchBacktestResults = async () => {
    try {
      const res: any = await backtestApi.getResults({ page_size: 5 })
      const items = res?.items || (Array.isArray(res) ? res : [])
      setBacktestResults(Array.isArray(items) ? items : [])
    } catch {}
  }

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

  const fetchWatchlistQuotes = async () => {
    setQuotesLoading(true)
    try {
      const data: any = await watchlistApi.getWatchlists()
      const lists = data?.items || (Array.isArray(data) ? data : [])
      if (lists.length === 0) { setWatchlistQuotes([]); return }
      // 记录第一个自选列表的 ID，用于后续添加股票
      setWatchlistId(lists[0].id || null)
      const items = lists[0].items || lists[0].stocks || []
      if (items.length === 0) { setWatchlistQuotes([]); return }
      const quotes: any[] = []
      for (const item of items.slice(0, 10)) {
        try {
          const quote: any = await dataApi.getRealtimeQuote(item.stock_code)
          quotes.push({
            code: item.stock_code,
            name: item.stock_name || item.stock_code,
            price: quote?.price || quote?.close,
            change_pct: quote?.change_pct,
            open: quote?.open,
            high: quote?.high,
            low: quote?.low,
          })
        } catch {
          quotes.push({
            code: item.stock_code,
            name: item.stock_name || item.stock_code,
            price: null,
            change_pct: null,
          })
        }
      }
      setWatchlistQuotes(quotes)
    } catch {
      setWatchlistQuotes([])
    } finally {
      setQuotesLoading(false)
    }
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

    setRecentModels(modelsData.slice(0, 6))
    setRecentTasks(tasksData.slice(0, 6))
    setCompletedTasks(tasksData.filter((t: TrainingTask) => t.status === 'completed'))

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

  // 快速预测（社区模型）
  const handleQuickPredict = async () => {
    if (!quickModelId) { message.warning('请选择社区模型'); return }
    if (!quickStockCode.trim()) { message.warning('请输入股票代码'); return }
    setQuickPredicting(true)
    setQuickResult(null)
    try {
      const res: any = await communityApi.predictWithModel(quickModelId, {
        stock_code: quickStockCode.trim(),
      })
      setQuickResult(res)
      message.success('预测完成')
      fetchMyPredictions()
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message
      message.error(detail || '预测失败')
    } finally {
      setQuickPredicting(false)
    }
  }

  // 用我的模型预测
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
      fetchMyPredictions()
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message
      message.error(detail || '预测失败')
    } finally {
      setPredicting(false)
    }
  }

  // 添加自选股
  const handleAddWatchlist = async () => {
    if (!addWatchlistCode.trim()) { message.warning('请输入股票代码'); return }
    if (!watchlistId) { message.warning('未找到自选列表'); return }
    setAddWatchlistLoading(true)
    try {
      await watchlistApi.addStock(watchlistId, {
        stock_code: addWatchlistCode.trim(),
        stock_name: addWatchlistName.trim() || addWatchlistCode.trim(),
      })
      message.success('添加成功')
      setAddWatchlistVisible(false)
      setAddWatchlistCode('')
      setAddWatchlistName('')
      fetchWatchlistQuotes()
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message
      message.error(detail || '添加失败')
    } finally {
      setAddWatchlistLoading(false)
    }
  }

  // 创建模型
  const handleCreateModel = async () => {
    try {
      const values = await createForm.validateFields()
      setCreating(true)
      const stockCodes = values.stock_codes
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
      const modelData: any = await modelApi.createModel({
        name: values.name,
        config: {
          model_type: values.model_type,
          features: ['close', 'volume', 'ma_5', 'ma_10', 'ma_20', 'rsi_14', 'macd'],
          target: values.target,
          stock_codes: stockCodes,
        },
      })
      message.success('模型创建成功，正在启动训练...')
      setCreateDrawerVisible(false)
      createForm.resetFields()
      // 自动创建训练任务
      try {
        await trainingApi.createTask({ model_id: modelData.id })
        message.success('训练任务已创建')
      } catch {
        message.warning('训练任务创建失败，请手动启动训练')
      }
      fetchDashboardData()
    } catch (err: any) {
      if (err?.errorFields) return
      const detail = err?.response?.data?.detail || err?.message
      message.error(detail || '创建模型失败')
    } finally {
      setCreating(false)
    }
  }

  // 训练任务：启动训练
  const handleTrainModel = async (modelId: number) => {
    try {
      await trainingApi.createTask({ model_id: modelId })
      message.success('训练任务已创建')
      fetchDashboardData()
    } catch {
      message.error('创建训练任务失败')
    }
  }

  // 训练任务：重试失败任务
  const handleRetryTask = async (task: TrainingTask) => {
    try {
      await trainingApi.createTask({ model_id: task.model_id })
      message.success('已重新创建训练任务')
      fetchDashboardData()
    } catch {
      message.error('重试失败')
    }
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

  const getDirectionInfo = (direction: string) => {
    if (direction === 'up' || direction === '看涨') return { label: '看涨', color: 'red', icon: <RiseOutlined /> }
    if (direction === 'down' || direction === '看跌') return { label: '看跌', color: 'green', icon: <FallOutlined /> }
    return { label: '震荡', color: 'default', icon: <MinusOutlined /> }
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

  const currentStep = (() => {
    if (stats.stockCount === 0) return 0
    if (stats.modelCount === 0) return 1
    if (stats.completedTaskCount === 0) return 2
    if (stats.backtestCount === 0) return 3
    return 4
  })()

  const stepActions: Record<number, { path: string; text: string }> = {
    0: { path: '/community', text: '用社区模型快速预测' },
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
      {/* 1. 标题区 */}
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

      {/* 2. 数据过期警告 */}
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

      {/* 3. 统计卡片 */}
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

      {/* 4. 快速预测区域（社区模型） */}
      <Card
        title="🔮 快速预测"
        size="small"
        style={{ marginBottom: 20 }}
        extra={<Button type="link" size="small" onClick={() => navigate('/community')}>浏览更多模型</Button>}
      >
        <Alert
          message="无需自己训练模型，选择社区模型即可快速预测"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={8} md={8}>
            <Select
              placeholder="选择社区模型"
              value={quickModelId}
              onChange={setQuickModelId}
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              options={communityModels.map((m: any) => ({
                value: m.id,
                label: `${m.name} (${m.model_type?.toUpperCase() || '未知'})`,
              }))}
            />
          </Col>
          <Col xs={24} sm={8} md={8}>
            <Input
              placeholder="输入股票代码，如 000001"
              value={quickStockCode}
              onChange={e => setQuickStockCode(e.target.value)}
              onPressEnter={handleQuickPredict}
            />
          </Col>
          <Col xs={24} sm={8} md={8}>
            <Button
              type="primary"
              size="large"
              icon={<ThunderboltOutlined />}
              loading={quickPredicting}
              onClick={handleQuickPredict}
              block
            >
              立即预测
            </Button>
          </Col>
        </Row>
        {quickResult && (
          <Card
            size="small"
            style={{ marginTop: 16, borderLeft: '3px solid #722ed1' }}
          >
            <Row gutter={[16, 8]}>
              <Col xs={12} sm={6}>
                <Statistic title="股票" value={quickResult.stock_code || quickStockCode} valueStyle={{ fontSize: 16 }} />
              </Col>
              {quickResult.direction && (
                <Col xs={12} sm={6}>
                  <Statistic
                    title="预测方向"
                    value={getDirectionInfo(quickResult.direction).label}
                    valueStyle={{
                      fontSize: 16,
                      color: quickResult.direction === 'up' || quickResult.direction === '看涨' ? '#f5222d'
                        : quickResult.direction === 'down' || quickResult.direction === '看跌' ? '#52c41a' : '#999',
                    }}
                  />
                </Col>
              )}
              {quickResult.prediction_value != null && (
                <Col xs={12} sm={6}>
                  <Statistic title="预测值" value={quickResult.prediction_value.toFixed(2)} valueStyle={{ fontSize: 16 }} />
                </Col>
              )}
              {quickResult.confidence != null && (
                <Col xs={12} sm={6}>
                  <Statistic title="置信度" value={`${Math.round(quickResult.confidence * 100)}%`} valueStyle={{ fontSize: 16 }} />
                </Col>
              )}
            </Row>
          </Card>
        )}
      </Card>

      {/* 5. 最新预测结果（增强） */}
      <Card
        title="🎯 最新预测结果"
        size="small"
        style={{ marginBottom: 20 }}
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
            {myPredictions.length > 6 && (
              <Button type="link" size="small" onClick={() => navigate('/train-predict')}>查看全部</Button>
            )}
          </Space>
        }
      >
        {/* 自动清空开关 */}
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
          <Row gutter={[16, 16]}>
            {myPredictions.slice(0, 6).map((pred) => {
              const dirInfo = getDirectionInfo(pred.direction || 'flat')
              const isUp = pred.direction === 'up' || pred.direction === '看涨'
              const isDown = pred.direction === 'down' || pred.direction === '看跌'
              const borderColor = isUp ? '#f5222d' : isDown ? '#52c41a' : '#faad14'
              return (
                <Col xs={24} sm={12} md={8} key={pred.id}>
                  <Card size="small" hoverable style={{ borderLeft: `3px solid ${borderColor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{pred.stock_name || pred.stock_code}</div>
                        <div style={{ color: '#999', fontSize: 12 }}>{pred.stock_code}</div>
                      </div>
                      <Tag color={dirInfo.color} style={{ fontSize: 13 }}>
                        {dirInfo.icon} {dirInfo.label}
                      </Tag>
                    </div>
                    {pred.prediction_value != null && (
                      <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700, color: borderColor }}>
                        ¥{pred.prediction_value.toFixed(2)}
                      </div>
                    )}
                    {pred.predicted_change_pct != null && (
                      <div style={{ fontSize: 12, color: isUp ? '#f5222d' : isDown ? '#52c41a' : '#999' }}>
                        预测涨跌: {pred.predicted_change_pct > 0 ? '+' : ''}{pred.predicted_change_pct.toFixed(2)}%
                      </div>
                    )}
                    {pred.confidence != null && (
                      <Progress
                        percent={Math.round(pred.confidence * 100)}
                        size="small"
                        strokeColor={pred.confidence > 0.6 ? '#52c41a' : '#faad14'}
                        format={(pct) => `置信度 ${pct}%`}
                        style={{ marginTop: 8 }}
                      />
                    )}
                    <div style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>
                      {pred.model_name || '未知模型'} · {pred.created_at?.slice(0, 16).replace('T', ' ')}
                    </div>
                  </Card>
                </Col>
              )
            })}
          </Row>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#999' }}>
            <ThunderboltOutlined style={{ fontSize: 28, marginBottom: 8, display: 'block' }} />
            暂无预测结果，使用上方快速预测或训练模型后即可预测
          </div>
        )}
      </Card>

      {/* 6. 自选股行情（增强） */}
      <Card
        title="📋 自选股行情"
        size="small"
        style={{ marginBottom: 20 }}
        extra={
          <Space>
            <Button type="link" size="small" onClick={() => navigate('/watchlist')}>管理自选</Button>
          </Space>
        }
      >
        {quotesLoading ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Spin tip="加载行情中..." />
          </div>
        ) : watchlistQuotes.length > 0 ? (
          <>
            <Row gutter={[12, 12]}>
              {watchlistQuotes.map((q) => {
                const isUp = q.change_pct != null && q.change_pct > 0
                const isDown = q.change_pct != null && q.change_pct < 0
                const priceColor = isUp ? '#f5222d' : isDown ? '#52c41a' : '#333'
                return (
                  <Col xs={12} sm={8} md={6} lg={4} key={q.code}>
                    <div style={{
                      padding: '10px 12px',
                      background: isUp ? '#fff1f0' : isDown ? '#f6ffed' : '#fafafa',
                      borderRadius: 8,
                      borderLeft: `3px solid ${isUp ? '#f5222d' : isDown ? '#52c41a' : '#d9d9d9'}`,
                      position: 'relative',
                    }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{q.name}</div>
                      <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{q.code}</div>
                      {q.price != null ? (
                        <>
                          <div style={{ fontSize: 18, fontWeight: 700, color: priceColor }}>
                            ¥{typeof q.price === 'number' ? q.price.toFixed(2) : q.price}
                          </div>
                          {q.change_pct != null && (
                            <div style={{ fontSize: 12, color: priceColor }}>
                              {isUp ? '+' : ''}{q.change_pct.toFixed(2)}%
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ fontSize: 12, color: '#999' }}>行情暂不可用</div>
                      )}
                      {/* 预测快捷按钮 */}
                      <Button
                        type="link"
                        size="small"
                        icon={<ThunderboltOutlined />}
                        style={{ position: 'absolute', top: 4, right: 4, padding: '0 4px', fontSize: 12 }}
                        onClick={() => {
                          setQuickStockCode(q.code)
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                      >
                        预测
                      </Button>
                    </div>
                  </Col>
                )
              })}
            </Row>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => setAddWatchlistVisible(true)}
              >
                添加自选股
              </Button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#999' }}>
            <LineChartOutlined style={{ fontSize: 28, marginBottom: 8, display: 'block' }} />
            暂无自选股
            <div style={{ marginTop: 8 }}>
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => setAddWatchlistVisible(true)}>
                添加自选股
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 7. 我的模型（增强卡片展示） */}
      <Card
        title="🤖 我的模型"
        size="small"
        style={{ marginBottom: 20 }}
        extra={
          <Space>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setCreateDrawerVisible(true)}>
              创建新模型
            </Button>
            <Button type="link" size="small" onClick={() => navigate('/models')}>查看全部</Button>
          </Space>
        }
      >
        {recentModels.length > 0 ? (
          <Row gutter={[16, 16]}>
            {recentModels.map((model) => (
              <Col xs={24} sm={12} md={8} key={model.id}>
                <Card
                  size="small"
                  hoverable
                  style={{
                    borderLeft: `3px solid ${model.status === 'trained' ? '#52c41a' : model.status === 'draft' ? '#d9d9d9' : '#1890ff'}`,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{model.name}</div>
                  <div style={{ marginBottom: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <Tag color="blue">{model.model_type?.toUpperCase()}</Tag>
                    <Tag color={getStatusColor(model.status)}>{getStatusText(model.status)}</Tag>
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
                    训练股票: {model.stock_codes?.length || 0} 只
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
                    特征数: {model.features?.length || 0} 个
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {model.status === 'draft' && (
                      <>
                        <Button size="small" type="primary" onClick={() => handleTrainModel(model.id)}>训练</Button>
                        <Button size="small" onClick={() => navigate(`/models/build/${model.id}`)}>编辑</Button>
                      </>
                    )}
                    {model.status === 'trained' && (
                      <>
                        <Button size="small" type="primary" onClick={() => navigate('/train-predict')}>预测</Button>
                        <Button size="small" onClick={() => navigate('/train-predict?tab=backtest')}>回测</Button>
                        <Button size="small" onClick={() => handleTrainModel(model.id)}>重新训练</Button>
                      </>
                    )}
                    {model.status === 'deployed' && (
                      <>
                        <Button size="small" type="primary" onClick={() => navigate('/train-predict')}>预测</Button>
                        <Button size="small" onClick={() => navigate(`/models/build/${model.id}`)}>编辑</Button>
                      </>
                    )}
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#999' }}>
            <RobotOutlined style={{ fontSize: 28, marginBottom: 8, display: 'block' }} />
            暂无模型，点击"创建新模型"开始
          </div>
        )}
      </Card>

      {/* 8. 训练任务（增强卡片展示 + SSE 实时进度） */}
      <Card
        title="🏋️ 训练任务"
        size="small"
        style={{ marginBottom: 20 }}
        extra={<Button type="link" size="small" onClick={() => navigate('/train-predict')}>查看全部</Button>}
      >
        {recentTasks.length > 0 ? (
          <Row gutter={[16, 16]}>
            {recentTasks.map((task) => {
              const progress = progressMap[task.id]
              const model = recentModels.find(m => m.id === task.model_id)
              const isRunning = task.status === 'running'

              return (
                <Col xs={24} sm={12} md={8} key={task.id}>
                  <Card
                    size="small"
                    style={{
                      borderLeft: `3px solid ${task.status === 'completed' ? '#52c41a' : task.status === 'running' ? '#1890ff' : task.status === 'failed' ? '#f5222d' : '#d9d9d9'}`,
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                      {model?.name || `模型 #${task.model_id}`}
                    </div>
                    <Tag color={getStatusColor(task.status)} style={{ marginBottom: 8 }}>
                      {isRunning && <LoadingOutlined spin style={{ marginRight: 4 }} />}
                      {getStatusText(task.status)}
                    </Tag>

                    {/* 运行中：显示实时进度 */}
                    {isRunning && progress && (
                      <div style={{ marginTop: 8, padding: '8px 12px', background: '#f6f8fa', borderRadius: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: '#1890ff' }}>
                            {stageMap[progress.stage] || '处理中'}
                          </span>
                          <span style={{ fontSize: 12, color: '#666' }}>
                            ⏱ 已用 {formatDuration(progress.elapsed_seconds || getElapsedTime(task))}
                            {(() => {
                              const remaining = getEstimatedRemaining(
                                progress.progress || 0,
                                progress.elapsed_seconds || getElapsedTime(task),
                              )
                              return remaining !== null && remaining > 0 ? (
                                <> · 预计剩余 <span style={{ color: '#f5222d', fontWeight: 500 }}>{formatDuration(remaining)}</span></>
                              ) : null
                            })()}
                          </span>
                        </div>
                        <Progress
                          percent={Math.round(progress.progress || 0)}
                          size="small"
                          status="active"
                        />
                        {progress.epoch != null && (
                          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                            Epoch: {progress.epoch}
                            {progress.train_loss != null && ` · 训练损失: ${progress.train_loss.toFixed(4)}`}
                            {progress.val_loss != null && ` · 验证损失: ${progress.val_loss.toFixed(4)}`}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 运行中但尚无 SSE 数据 */}
                    {isRunning && !progress && (
                      <div style={{ marginTop: 8, padding: '8px 12px', background: '#f6f8fa', borderRadius: 6 }}>
                        <Progress percent={0} size="small" status="active" />
                        <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>等待训练进度...</div>
                      </div>
                    )}

                    {/* 已完成：显示训练指标 */}
                    {task.status === 'completed' && task.metrics && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {Object.entries(task.metrics).slice(0, 3).map(([key, value]: [string, any]) => {
                          if (typeof value !== 'number') return null
                          return (
                            <Tag key={key} style={{ fontSize: 11 }}>
                              {key.toUpperCase()}: {value.toFixed(4)}
                            </Tag>
                          )
                        })}
                      </div>
                    )}

                    {/* 失败：显示错误信息 */}
                    {task.status === 'failed' && task.error_message && (
                      <div style={{ marginTop: 8, padding: '6px 10px', background: '#fff1f0', borderRadius: 4, fontSize: 12, color: '#f5222d' }}>
                        {task.error_message.length > 80 ? task.error_message.slice(0, 80) + '...' : task.error_message}
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: '#bbb', marginTop: 8 }}>
                      {task.start_time && new Date(task.start_time).toLocaleString()}
                      {task.duration != null && ` · ${formatDuration(task.duration)}`}
                    </div>

                    {/* 操作按钮 */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                      {task.status === 'completed' && (
                        <>
                          <Button size="small" type="primary" onClick={() => navigate('/train-predict')}>预测</Button>
                          <Button size="small" onClick={() => navigate('/train-predict?tab=backtest')}>回测</Button>
                        </>
                      )}
                      {task.status === 'failed' && (
                        <Button size="small" type="primary" danger onClick={() => handleRetryTask(task)}>重试</Button>
                      )}
                      <Button size="small" onClick={() => navigate('/train-predict')}>详情</Button>
                    </div>
                  </Card>
                </Col>
              )
            })}
          </Row>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#999' }}>
            <PlayCircleOutlined style={{ fontSize: 28, marginBottom: 8, display: 'block' }} />
            暂无训练任务
          </div>
        )}
      </Card>

      {/* 9. 回测结果（新增） */}
      {backtestResults.length > 0 && (
        <Card
          title="📈 回测结果"
          size="small"
          style={{ marginBottom: 20 }}
          extra={
            <Button type="link" size="small" onClick={() => navigate('/train-predict?tab=backtest')}>
              查看详情
            </Button>
          }
        >
          <Row gutter={[16, 16]}>
            {backtestResults.slice(0, 4).map((bt: any) => (
              <Col xs={24} sm={12} md={6} key={bt.id}>
                <Card size="small" hoverable style={{ borderLeft: '3px solid #722ed1' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                    回测 #{bt.id}
                  </div>
                  <Row gutter={[8, 8]}>
                    <Col span={8}>
                      <Statistic
                        title="总收益率"
                        value={bt.total_return != null ? (bt.total_return * 100).toFixed(2) : '-'}
                        suffix="%"
                        valueStyle={{
                          fontSize: 14,
                          color: bt.total_return >= 0 ? '#f5222d' : '#52c41a',
                        }}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="夏普比率"
                        value={bt.sharpe_ratio != null ? bt.sharpe_ratio.toFixed(2) : '-'}
                        valueStyle={{ fontSize: 14 }}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="最大回撤"
                        value={bt.max_drawdown != null ? (bt.max_drawdown * 100).toFixed(1) : '-'}
                        suffix="%"
                        valueStyle={{ fontSize: 14, color: '#f5222d' }}
                      />
                    </Col>
                  </Row>
                  <div style={{ fontSize: 11, color: '#bbb', marginTop: 8 }}>
                    {bt.start_date} ~ {bt.end_date}
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* 实时行情（保留） */}
      {liveQuotes.length > 0 && (
        <Card title="📊 实时行情" size="small" style={{ marginBottom: 16 }}>
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

      {/* 交易信号（保留） */}
      {signals.length > 0 && (
        <Card title="🔔 交易信号" size="small" style={{ marginBottom: 16 }}>
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

      {/* 10. 引导式流程进度（移到底部） */}
      <Card style={{ marginBottom: 20 }} size="small">
        <Steps
          current={currentStep}
          size="small"
          items={[
            { title: '快速预测', icon: stats.stockCount > 0 ? <CheckCircleOutlined /> : <ThunderboltOutlined /> },
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

      {/* 弹窗：用我的模型预测 */}
      <Modal
        title="用我的模型预测"
        open={predictModalVisible}
        onCancel={() => { setPredictModalVisible(false); setPredictTaskId(undefined); setPredictStockCode('') }}
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
              const m = recentModels.find(m => m.id === t.model_id)
              return {
                value: t.id,
                label: `任务#${t.id} - ${m ? `${m.name} (${m.model_type.toUpperCase()})` : `模型#${t.model_id}`}`,
              }
            })}
          />
        </div>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>输入股票代码</div>
          <Input
            placeholder="如 000001"
            value={predictStockCode}
            onChange={e => setPredictStockCode(e.target.value)}
          />
        </div>
      </Modal>

      {/* 弹窗：添加自选股 */}
      <Modal
        title="添加自选股"
        open={addWatchlistVisible}
        onCancel={() => { setAddWatchlistVisible(false); setAddWatchlistCode(''); setAddWatchlistName('') }}
        onOk={handleAddWatchlist}
        okText="添加"
        confirmLoading={addWatchlistLoading}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>股票代码</div>
          <Input
            placeholder="如 000001"
            value={addWatchlistCode}
            onChange={e => setAddWatchlistCode(e.target.value)}
          />
        </div>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>股票名称（可选）</div>
          <Input
            placeholder="如 平安银行"
            value={addWatchlistName}
            onChange={e => setAddWatchlistName(e.target.value)}
          />
        </div>
      </Modal>

      {/* 抽屉：创建新模型（简化版表单） */}
      <Drawer
        title="创建新模型"
        open={createDrawerVisible}
        onClose={() => { setCreateDrawerVisible(false); createForm.resetFields() }}
        width={420}
        extra={
          <Space>
            <Button onClick={() => { setCreateDrawerVisible(false); createForm.resetFields() }}>取消</Button>
            <Button type="primary" loading={creating} onClick={handleCreateModel}>创建并训练</Button>
          </Space>
        }
      >
        <Form
          form={createForm}
          layout="vertical"
          initialValues={{ model_type: 'xgboost', target: 'next_day_direction' }}
        >
          <Form.Item
            name="name"
            label="模型名称"
            rules={[{ required: true, message: '请输入模型名称' }]}
          >
            <Input placeholder="如：我的第一个预测模型" />
          </Form.Item>
          <Form.Item
            name="model_type"
            label="算法类型"
            rules={[{ required: true, message: '请选择算法类型' }]}
          >
            <Select options={MODEL_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="stock_codes"
            label="训练股票（逗号分隔）"
            rules={[{ required: true, message: '请输入至少一个股票代码' }]}
          >
            <Input placeholder="如：000001,600519,000858" />
          </Form.Item>
          <Form.Item
            name="target"
            label="预测目标"
            rules={[{ required: true, message: '请选择预测目标' }]}
          >
            <Select options={TARGET_OPTIONS} />
          </Form.Item>
        </Form>
        <Alert
          message="这是简化版创建表单，仅配置核心参数。如需完整配置（特征选择、参数调优等），请前往模型构建页面。"
          type="info"
          showIcon
          style={{ marginTop: 8 }}
        />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button type="link" onClick={() => { setCreateDrawerVisible(false); createForm.resetFields(); navigate('/models/build') }}>
            前往完整配置 →
          </Button>
        </div>
      </Drawer>

      <OnboardingGuide
        open={onboardingVisible}
        onClose={() => setOnboardingVisible(false)}
      />
    </div>
  )
}

export default Dashboard
