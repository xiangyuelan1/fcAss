import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  Row, Col, Card, Statistic, Tag, Button, Alert, message,
  Switch, Skeleton, Progress, Spin, Drawer, Modal, Select, Input, Form, Space, Table, DatePicker,
} from 'antd'
import {
  DatabaseOutlined,
  RobotOutlined,
  PlayCircleOutlined,
  LineChartOutlined,
  ThunderboltOutlined,
  SyncOutlined,
  WarningOutlined,
  QuestionCircleOutlined,
  PlusOutlined,
  LoadingOutlined,
  BarChartOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  dataApi, modelApi, trainingApi, backtestApi, predictionApi, authApi,
  watchlistApi, communityApi,
} from '@/services/api'
import { UserModel, TrainingTask, PredictionShareItem } from '@/types'
import { useAuthStore } from '@/store'
import useMarketWs from '@/hooks/useMarketWs'
import OnboardingGuide, { isOnboardingCompleted } from '@/components/OnboardingGuide'
import MascotBull from '@/components/MascotBull'
import FunPredictionResult, { FunPredictionResultProps } from '@/components/FunPredictionResult'
import StockCodeInput from '@/components/StockCodeInput'

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

  // WebSocket 实时行情：收到推送后按 code 合并更新自选股列表
  const handleMarketQuotes = useCallback((quotes: any[]) => {
    setWatchlistQuotes(prev => {
      const quoteMap: Record<string, any> = {}
      for (const q of quotes) {
        quoteMap[q.code] = q
      }
      return prev.map(item => {
        const q = quoteMap[item.code]
        if (q) {
          return {
            ...item,
            price: q.close || q.price || item.price,
            change_pct: q.change_pct ?? q.change_percent ?? item.change_pct,
            volume: q.volume ?? item.volume,
          }
        }
        return item
      })
    })
  }, [])

  useMarketWs(handleMarketQuotes)

  // 创建模型抽屉
  const [createDrawerVisible, setCreateDrawerVisible] = useState(false)
  const [createForm] = Form.useForm()
  const [creating, setCreating] = useState(false)

  // 回测结果
  const [backtestResults, setBacktestResults] = useState<any[]>([])

  // 模型卡片内展开预测/回测
  const [expandedPredictModelId, setExpandedPredictModelId] = useState<number | null>(null)
  const [modelPredictStockCode, setModelPredictStockCode] = useState('600519')
  const [predictingTaskId, setPredictingTaskId] = useState<number | null>(null)
  const [predictResult, setPredictResult] = useState<Record<number, any>>({})

  const [expandedBacktestModelId, setExpandedBacktestModelId] = useState<number | null>(null)
  const [backtestStockCode, setBacktestStockCode] = useState('600519')
  const [backtestStartDate, setBacktestStartDate] = useState<string>('')
  const [backtestEndDate, setBacktestEndDate] = useState<string>('')
  const [backtestResult, setBacktestResult] = useState<Record<number, any>>({})
  const [backtesting, setBacktesting] = useState(false)

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await Promise.all([
        fetchDashboardData(),
        fetchMyPredictions(),
        fetchWatchlistQuotes(),
        fetchCommunityModels(),
        fetchBacktestResults(),
      ])
      setLoading(false)
    }
    init()
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
      /* 兼容多种返回格式：{ items: [...] } / { data: [...] } / 直接数组 */
      let items: any[] = []
      if (Array.isArray(res)) {
        items = res
      } else if (res?.items && Array.isArray(res.items)) {
        items = res.items
      } else if (res?.data && Array.isArray(res.data)) {
        items = res.data
      }
      setMyPredictions(items)
    } catch {
      setMyPredictions([])
    }
  }

  const fetchWatchlistQuotes = async () => {
    setQuotesLoading(true)
    try {
      const data: any = await watchlistApi.getWatchlists()
      const lists = data?.items || (Array.isArray(data) ? data : [])
      if (lists.length === 0) { setWatchlistQuotes([]); return }
      setWatchlistId(lists[0].id || null)

      /* 从所有自选列表中收集股票 */
      const allItems: any[] = []
      for (const list of lists) {
        const items = list.items || list.stocks || []
        allItems.push(...items)
      }
      if (allItems.length === 0) { setWatchlistQuotes([]); return }

      /* 优先使用批量接口获取行情 */
      const codes = allItems.slice(0, 50).map((item: any) => item.stock_code)
      try {
        const quoteData: any = await dataApi.getRealtimeQuotes(codes)
        const quotesMap: Record<string, any> = {}
        for (const q of (quoteData?.quotes || [])) {
          quotesMap[q.code || q.stock_code] = q
        }
        const results = allItems.slice(0, 50).map((item: any) => {
          const q = quotesMap[item.stock_code]
          return {
            code: item.stock_code,
            name: item.stock_name || item.stock_code,
            price: q?.price || q?.close || null,
            change_pct: q?.change_pct || q?.change_percent || null,
            open: q?.open,
            high: q?.high,
            low: q?.low,
          }
        })
        setWatchlistQuotes(results)
      } catch {
        /* 批量接口失败，回退到逐个获取 */
        const results: any[] = []
        for (const item of allItems.slice(0, 10)) {
          try {
            const q: any = await dataApi.getRealtimeQuote(item.stock_code)
            results.push({
              code: item.stock_code,
              name: item.stock_name || item.stock_code,
              price: q?.price || q?.close || null,
              change_pct: q?.change_pct || q?.change_percent || null,
            })
          } catch {
            results.push({
              code: item.stock_code,
              name: item.stock_name || item.stock_code,
              price: null,
              change_pct: null,
            })
          }
        }
        setWatchlistQuotes(results)
      }
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

  const handleModelPredict = async (model: any) => {
    const completedTask = recentTasks.find(t => t.model_id === model.id && t.status === 'completed')
    if (!completedTask) {
      message.warning('该模型没有已完成的训练任务，请先训练')
      return
    }
    setPredictingTaskId(completedTask.id)
    try {
      const data = await predictionApi.predict({
        task_id: completedTask.id,
        stock_code: modelPredictStockCode,
        days: 1,
      })
      setPredictResult(prev => ({ ...prev, [model.id]: data }))
      fetchMyPredictions()
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      message.error(typeof detail === 'string' ? detail : '预测失败')
    } finally {
      setPredictingTaskId(null)
    }
  }

  const handleModelBacktest = async (model: any) => {
    const completedTask = recentTasks.find(t => t.model_id === model.id && t.status === 'completed')
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
      const data = await backtestApi.runBacktest({
        task_id: completedTask.id,
        start_date: backtestStartDate,
        end_date: backtestEndDate,
      })
      setBacktestResult(prev => ({ ...prev, [model.id]: data }))
      fetchBacktestResults()
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      message.error(typeof detail === 'string' ? detail : '回测失败')
    } finally {
      setBacktesting(false)
    }
  }

  const handleExpandPredict = (modelId: number) => {
    setExpandedPredictModelId(expandedPredictModelId === modelId ? null : modelId)
    setExpandedBacktestModelId(null)
  }

  const handleExpandBacktest = (modelId: number) => {
    setExpandedBacktestModelId(expandedBacktestModelId === modelId ? null : modelId)
    setExpandedPredictModelId(null)
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
          <h1 className="page-title" style={{ marginBottom: 0 }}>我的工作台</h1>
        </div>
        <Button type="link" icon={<QuestionCircleOutlined />} onClick={() => setOnboardingVisible(true)}>
          新手引导
        </Button>
      </div>
      <p className="page-description" style={{ marginBottom: 16 }}>
        管理你的模型、查看预测结果、追踪训练进度
      </p>

      {/* 数据过期警告 */}
      {staleModels.length > 0 && (
        <Alert
          style={{ marginBottom: 12 }}
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
                  <span style={{ color: '#999', fontSize: 12 }}>{m.new_data_count} 只股票有新数据</span>
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

      {/* 统计卡片（紧凑样式） */}
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small" bodyStyle={{ padding: '8px 12px' }} hoverable onClick={() => navigate('/data')}>
            <Statistic title="股票数据" value={stats.stockCount} prefix={<DatabaseOutlined />} valueStyle={{ color: '#1890ff', fontSize: 20 }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bodyStyle={{ padding: '8px 12px' }} hoverable onClick={() => navigate('/models')}>
            <Statistic title="我的模型" value={stats.modelCount} prefix={<RobotOutlined />} valueStyle={{ color: '#52c41a', fontSize: 20 }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bodyStyle={{ padding: '8px 12px' }} hoverable onClick={() => navigate('/train-predict')}>
            <Statistic title="训练任务" value={stats.taskCount} prefix={<PlayCircleOutlined />} valueStyle={{ color: '#faad14', fontSize: 20 }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bodyStyle={{ padding: '8px 12px' }} hoverable onClick={() => navigate('/train-predict')}>
            <Statistic title="可预测模型" value={stats.completedTaskCount} prefix={<ThunderboltOutlined />} valueStyle={{ color: '#722ed1', fontSize: 20 }} />
          </Card>
        </Col>
      </Row>

      {/* 左右分栏主体 */}
      <Row gutter={[16, 16]}>
        {/* 左栏 60% */}
        <Col xs={24} lg={14}>
          {/* 快速预测 */}
          <Card
            title="🔮 快速预测"
            size="small"
            style={{ marginBottom: 16 }}
            extra={<Button type="link" size="small" onClick={() => navigate('/community')}>浏览更多模型</Button>}
          >
            <Row gutter={[8, 8]} align="middle">
              <Col xs={24} sm={10}>
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
              <Col xs={24} sm={8}>
                <StockCodeInput
                  value={quickStockCode}
                  onChange={setQuickStockCode}
                  placeholder="股票代码，如 000001"
                />
              </Col>
              <Col xs={24} sm={6}>
                <Button
                  type="primary"
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
              <div style={{ marginTop: 12 }}>
                <FunPredictionResult
                  direction={quickResult.prediction_label || quickResult.direction || 'flat'}
                  confidence={quickResult.confidence}
                  stockCode={quickStockCode}
                  predictedPrice={quickResult.predicted_close || quickResult.predicted_price}
                  predictedChangePct={quickResult.predicted_change_pct}
                  compact={true}
                />
              </div>
            )}
          </Card>

          {/* 最新预测结果（紧凑卡片，只展示最近3条） */}
          <Card
            title="🎯 最新预测结果"
            size="small"
            style={{ marginBottom: 16 }}
            extra={
              <Space>
                <Button type="primary" size="small" icon={<ThunderboltOutlined />} onClick={() => setPredictModalVisible(true)}>
                  用我的模型预测
                </Button>
                {myPredictions.length > 3 && (
                  <Button type="link" size="small" onClick={() => navigate('/train-predict')}>查看全部</Button>
                )}
              </Space>
            }
          >
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#666' }}>每日自动清空</span>
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
              myPredictions.slice(0, 3).map((pred) => (
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

          {/* 自选股行情（紧凑列表） */}
          <Card
            title={<span>📋 自选股行情 <Tag color="green" style={{ fontSize: 10, marginLeft: 4 }}>实时</Tag></span>}
            size="small"
            style={{ marginBottom: 16 }}
            extra={<Button type="link" size="small" onClick={() => navigate('/watchlist')}>管理自选</Button>}
          >
            {quotesLoading ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}><Spin tip="加载行情中..." /></div>
            ) : watchlistQuotes.length > 0 ? (
              <>
                <Table
                  dataSource={watchlistQuotes}
                  rowKey="code"
                  size="small"
                  pagination={false}
                  showHeader={true}
                  columns={[
                    {
                      title: '股票',
                      dataIndex: 'name',
                      key: 'name',
                      width: 120,
                      render: (name: string, record: any) => (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
                          <div style={{ color: '#999', fontSize: 11 }}>{record.code}</div>
                        </div>
                      ),
                    },
                    {
                      title: '最新价',
                      dataIndex: 'price',
                      key: 'price',
                      width: 90,
                      align: 'right',
                      render: (price: number, record: any) => {
                        if (price == null) return <span style={{ color: '#999', fontSize: 12 }}>--</span>
                        const color = record.change_pct > 0 ? '#f5222d' : record.change_pct < 0 ? '#52c41a' : '#333'
                        return <span style={{ fontWeight: 700, color, fontSize: 14 }}>¥{price.toFixed(2)}</span>
                      },
                    },
                    {
                      title: '涨跌幅',
                      dataIndex: 'change_pct',
                      key: 'change_pct',
                      width: 80,
                      align: 'right',
                      render: (pct: number) => {
                        if (pct == null) return <span style={{ color: '#999', fontSize: 12 }}>--</span>
                        const color = pct > 0 ? '#f5222d' : pct < 0 ? '#52c41a' : '#999'
                        return <span style={{ color, fontSize: 13 }}>{pct > 0 ? '+' : ''}{pct.toFixed(2)}%</span>
                      },
                    },
                    {
                      title: '',
                      key: 'action',
                      width: 50,
                      align: 'center',
                      render: (_: any, record: any) => (
                        <Button
                          type="link"
                          size="small"
                          icon={<ThunderboltOutlined />}
                          style={{ padding: '0 4px', fontSize: 12 }}
                          onClick={() => {
                            setQuickStockCode(record.code)
                            window.scrollTo({ top: 0, behavior: 'smooth' })
                          }}
                        >
                          预测
                        </Button>
                      ),
                    },
                  ]}
                />
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <Button type="dashed" icon={<PlusOutlined />} size="small" onClick={() => setAddWatchlistVisible(true)}>
                    添加自选股
                  </Button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#999', fontSize: 13 }}>
                <LineChartOutlined style={{ fontSize: 24, marginBottom: 4, display: 'block' }} />
                暂无自选股
                <div style={{ marginTop: 8 }}>
                  <Button type="dashed" icon={<PlusOutlined />} size="small" onClick={() => setAddWatchlistVisible(true)}>
                    添加自选股
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </Col>

        {/* 右栏 40% */}
        <Col xs={24} lg={10}>
          {/* 我的模型（合并训练进度+回测结果） */}
          <Card
            title="🤖 我的模型"
            size="small"
            style={{ marginBottom: 16 }}
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
              recentModels.map((model) => {
                /* 按 model_id 关联训练任务和回测结果 */
                const modelTasks = recentTasks.filter(t => t.model_id === model.id)
                const runningTask = modelTasks.find(t => t.status === 'running')
                const completedTask = modelTasks.find(t => t.status === 'completed')
                const modelBacktest = backtestResults.find((bt: any) => bt.model_id === model.id)
                const progress = runningTask ? progressMap[runningTask.id] : null

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
                            <Button size="small" type="primary" onClick={() => handleTrainModel(model.id)}>训练</Button>
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
                                {stageMap[progress.stage] || '处理中'}
                              </span>
                              <span>
                                ⏱ {formatDuration(progress.elapsed_seconds || getElapsedTime(runningTask))}
                                {(() => {
                                  const remaining = getEstimatedRemaining(progress.progress || 0, progress.elapsed_seconds || getElapsedTime(runningTask))
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
                        {Object.entries(completedTask.metrics).slice(0, 2).map(([key, value]: [string, any]) => {
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
                          收益率 <strong style={{ color: modelBacktest.total_return >= 0 ? '#f5222d' : '#52c41a' }}>
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
                            loading={predictingTaskId !== null && recentTasks.find(t => t.model_id === model.id && t.status === 'completed')?.id === predictingTaskId}
                            onClick={() => handleModelPredict(model)}
                          >
                            预测
                          </Button>
                        </div>
                        {predictResult[model.id] && (
                          <div style={{ marginTop: 8 }}>
                            <FunPredictionResult
                              direction={predictResult[model.id].prediction_label || predictResult[model.id].direction || 'flat'}
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
                                {backtestResult[model.id].total_return != null ? `${(backtestResult[model.id].total_return * 100).toFixed(2)}%` : '-'}
                              </strong>
                            </span>
                            <span>
                              夏普比率 <strong>{backtestResult[model.id].sharpe_ratio != null ? backtestResult[model.id].sharpe_ratio.toFixed(2) : '-'}</strong>
                            </span>
                            <span>
                              最大回撤 <strong style={{ color: '#f5222d' }}>
                                {backtestResult[model.id].max_drawdown != null ? `${(backtestResult[model.id].max_drawdown * 100).toFixed(2)}%` : '-'}
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
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setCreateDrawerVisible(true)}>
                    创建新模型
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

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
          <StockCodeInput
            value={predictStockCode}
            onChange={setPredictStockCode}
            placeholder="如 000001"
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
          <Input placeholder="如 000001" value={addWatchlistCode} onChange={e => setAddWatchlistCode(e.target.value)} />
        </div>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>股票名称（可选）</div>
          <Input placeholder="如 平安银行" value={addWatchlistName} onChange={e => setAddWatchlistName(e.target.value)} />
        </div>
      </Modal>

      {/* 抽屉：创建新模型 */}
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
          <Form.Item name="name" label="模型名称" rules={[{ required: true, message: '请输入模型名称' }]}>
            <Input placeholder="如：我的第一个预测模型" />
          </Form.Item>
          <Form.Item name="model_type" label="算法类型" rules={[{ required: true, message: '请选择算法类型' }]}>
            <Select options={MODEL_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="stock_codes" label="训练股票（逗号分隔）" rules={[{ required: true, message: '请输入至少一个股票代码' }]}>
            <Input placeholder="如：000001,600519,000858" />
          </Form.Item>
          <Form.Item name="target" label="预测目标" rules={[{ required: true, message: '请选择预测目标' }]}>
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
