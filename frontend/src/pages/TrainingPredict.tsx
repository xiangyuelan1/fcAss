import React, { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Progress,
  message,
  Modal,
  Descriptions,
  Statistic,
  Row,
  Col,
  Form,
  DatePicker,
  Input,
  InputNumber,
  Tabs,
  Select,
  AutoComplete,
  Alert,
  Spin,
  Collapse,
  Tooltip,
  List,
  Empty,
} from 'antd'
import {
  PauseCircleOutlined,
  EyeOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  LineChartOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  RobotOutlined,
  StockOutlined,
  DollarOutlined,
  InfoCircleOutlined,
  QuestionCircleOutlined,
  ShareAltOutlined,
  PlusOutlined,
  FundOutlined,
} from '@ant-design/icons'
import { Line } from '@ant-design/charts'
import { trainingApi, modelApi, backtestApi, predictionApi, dataApi, watchlistApi, ensembleApi, featureImportanceApi } from '@/services/api'
import { TrainingTask, UserModel, BacktestResult, EquityPoint } from '@/types'
import { PredictionResult, PredictionAnimation, ConfidenceBar, deriveConfidence, labelToDirection } from '@/components/PredictionFun'
import { TrainingCompleteEffect } from '@/components/TrainingCompleteEffect'
import MascotBull from '@/components/MascotBull'
import { usePredictionStore } from '@/store'
import dayjs from 'dayjs'

interface PredictionRecord {
  task_id: number
  stock_code: string
  stock_name?: string
  predict_date: string
  prediction: number
  prediction_label: string
  confidence?: number | null
  predicted_price?: number | null
  predicted_change_pct?: number | null
  price_range_low?: number | null
  price_range_high?: number | null
  latest_data?: { date: string; close: number; volume?: number }
  model_name: string
  model_type: string
  timestamp: number
  predicted_volatility?: number | null
  predicted_volume_change?: number | null
  target_type?: string
  probability_up?: number | null
  probability_down?: number | null
  daily_avg_change_pct?: number | null
  predicted_trend_days?: number | null
  predicted_trend_pct?: number | null
  trend_direction?: string | null
  predicted_weeks?: number | null
  gain_target_pct?: number | null
  predicted_open?: number | null
  predicted_high?: number | null
  predicted_low?: number | null
  predicted_close?: number | null
}

interface RealtimeQuote {
  code: string
  name: string
  price: number
  open: number
  high: number
  low: number
  pre_close: number
  change_pct: number
  volume: number
  amount: number
  time: string
}

const TAB_KEYS = { training: 'training', predict: 'predict', backtest: 'backtest' } as const
type TabKey = typeof TAB_KEYS[keyof typeof TAB_KEYS]

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

const getLabelStyle = (label: string) => {
  if (label === '看涨') return { color: '#f5222d', icon: <ArrowUpOutlined />, bg: '#fff1f0' }
  if (label === '看跌') return { color: '#52c41a', icon: <ArrowDownOutlined />, bg: '#f6ffed' }
  return { color: '#faad14', icon: <MinusOutlined />, bg: '#fffbe6' }
}

class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
          图表渲染失败，请刷新页面重试
          <br />
          <Button
            type="link"
            size="small"
            onClick={() => this.setState({ hasError: false })}
          >
            重试
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

const EquityCharts: React.FC<{ equityCurve: EquityPoint[]; initialCapital: number }> = ({
  equityCurve,
  initialCapital,
}) => {
  const equityData = useMemo(() => {
    type EquityItem = { date: string; value: number; type: string }
    const result: EquityItem[] = []
    equityCurve.forEach((p) => {
      result.push({ date: p.date, value: p.value, type: '总权益' })
      result.push({ date: p.date, value: p.cash, type: '现金' })
      result.push({ date: p.date, value: p.position_value, type: '持仓市值' })
    })
    return result
  }, [equityCurve])

  const drawdownData = useMemo(() => {
    const result: { date: string; value: number }[] = []
    let peak = initialCapital
    for (const p of equityCurve) {
      if (p.value > peak) peak = p.value
      const dd = p.value < peak ? ((p.value - peak) / peak) * 100 : 0
      result.push({ date: p.date, value: dd })
    }
    return result
  }, [equityCurve, initialCapital])

  const dailyReturnData = useMemo(() => {
    const result: { date: string; value: number }[] = []
    for (let i = 1; i < equityCurve.length; i++) {
      const prev = equityCurve[i - 1].value
      const curr = equityCurve[i].value
      result.push({ date: equityCurve[i].date, value: prev > 0 ? ((curr - prev) / prev) * 100 : 0 })
    }
    return result
  }, [equityCurve])

  if (!equityCurve || equityCurve.length === 0) {
    return <Empty description="暂无权益曲线数据" />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card size="small" title="权益曲线" style={{ marginBottom: 0 }}>
        <ChartErrorBoundary>
          <Line
            data={equityData}
            xField="date"
            yField="value"
            colorField="type"
            smooth
            height={300}
            color={['#1890ff', '#52c41a', '#faad14']}
            yAxis={{
              label: {
                formatter: (v: string) => `¥${Number(v).toLocaleString()}`,
              },
            }}
            xAxis={{
              label: {
                autoRotate: true,
              },
            }}
            legend={{
              position: 'top' as const,
            }}
            tooltip={{
              shared: true,
            }}
          />
        </ChartErrorBoundary>
      </Card>

      <Card size="small" title="回撤 (%)" style={{ marginBottom: 0 }}>
        <ChartErrorBoundary>
          <Line
            data={drawdownData}
            xField="date"
            yField="value"
            height={300}
            color="#f5222d"
            smooth
            yAxis={{
              label: {
                formatter: (v: string) => `${Number(v).toFixed(1)}%`,
              },
            }}
            xAxis={{
              label: {
                autoRotate: true,
              },
            }}
            tooltip={{
              shared: true,
            }}
          />
        </ChartErrorBoundary>
      </Card>

      <Card size="small" title="每日收益 (%)" style={{ marginBottom: 0 }}>
        <ChartErrorBoundary>
          <Line
            data={dailyReturnData}
            xField="date"
            yField="value"
            height={300}
            color="#722ed1"
            smooth
            yAxis={{
              label: {
                formatter: (v: string) => `${Number(v).toFixed(2)}%`,
              },
            }}
            xAxis={{
              label: {
                autoRotate: true,
              },
            }}
            tooltip={{
              shared: true,
            }}
          />
        </ChartErrorBoundary>
      </Card>
    </div>
  )
}

const BacktestGuide: React.FC = () => (
  <Collapse
    style={{ marginBottom: 24 }}
    items={[
      {
        key: 'guide',
        label: (
          <Space>
            <QuestionCircleOutlined />
            <span>什么是回测？如何理解回测结果？</span>
          </Space>
        ),
        children: (
          <div>
            <Alert
              message="回测说明"
              description="回测是用历史数据模拟模型预测的交易策略，验证策略在过去的表现。回测结果仅供参考，不构成投资建议。过去的表现不代表未来收益。"
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <h4>核心指标解读</h4>
            <Row gutter={[16, 12]}>
              <Col span={12}>
                <Card size="small" title="总收益率">
                  策略在回测期间的总盈亏比例。例如+20%表示资金从10万增长到12万。
                  <br /><Tag color="red">正值=盈利</Tag><Tag color="green">负值=亏损</Tag>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" title="年化收益率">
                  将总收益率折算为年化水平，便于与其他投资对比。
                  <br />例如2年总收益44%，年化约20%。
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" title="最大回撤">
                  从最高点到最低点的最大跌幅，衡量策略的风险程度。
                  <br /><Tag color="red">越小越好</Tag> 超过20%说明风险较大
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" title="夏普比率">
                  每承担1单位风险获得的超额收益。
                  <br />
                  <Tag color="green">&gt;1 优秀</Tag>
                  <Tag>0.5~1 良好</Tag>
                  <Tag color="red">&lt;0.5 较差</Tag>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" title="胜率">
                  盈利交易占总交易的比例。高胜率不一定代表高收益，需结合盈亏比看。
                  <br />通常 &gt;50% 即可接受
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" title="盈亏比">
                  平均盈利金额 / 平均亏损金额。盈亏比&gt;1说明赚的比亏的多。
                  <br />高盈亏比+低胜率也能盈利
                </Card>
              </Col>
            </Row>

            <h4 style={{ marginTop: 16 }}>如何执行回测？</h4>
            <ol>
              <li>在<strong>训练任务</strong>Tab，找到已完成的训练任务</li>
              <li>点击<strong>"回测"</strong>按钮，选择回测日期范围和初始资金</li>
              <li>等待回测执行完成，在<strong>回测结果</strong>Tab查看结果</li>
            </ol>

            <h4>注意事项</h4>
            <ul>
              <li>回测基于历史数据，存在过拟合风险</li>
              <li>未考虑滑点、涨跌停无法成交等实际交易限制</li>
              <li>手续费为简化估算，实际交易成本可能更高</li>
            </ul>
          </div>
        ),
      },
    ]}
  />
)

const TrainingPredict: React.FC = () => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabFromUrl = searchParams.get('tab')
  const taskIdFromUrl = searchParams.get('task_id')
  const initialTab: TabKey =
    tabFromUrl === 'predict' ? TAB_KEYS.predict :
    tabFromUrl === 'backtest' ? TAB_KEYS.backtest :
    TAB_KEYS.training

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)

  const [tasks, setTasks] = useState<TrainingTask[]>([])
  const [models, setModels] = useState<Record<number, UserModel>>({})
  const [trainingLoading, setTrainingLoading] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TrainingTask | null>(null)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [progressMap, setProgressMap] = useState<Record<number, any>>({})
  const sseRefs = useRef<Record<number, EventSource>>({})

  const [logs, setLogs] = useState<string[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const [backtestModalVisible, setBacktestModalVisible] = useState(false)
  const [backtestTask, setBacktestTask] = useState<TrainingTask | null>(null)
  const [backtestLoading, setBacktestLoading] = useState(false)
  const [backtestProgress, setBacktestProgress] = useState(0)
  const [backtestMessage, setBacktestMessage] = useState('')
  const [backtestForm] = Form.useForm()
  const [backtestResultsMap, setBacktestResultsMap] = useState<Record<number, any>>({})

  const [trainingEffect, setTrainingEffect] = useState<'completed' | 'failed' | null>(null)

  const [completedTasks, setCompletedTasks] = useState<TrainingTask[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<number | undefined>(
    taskIdFromUrl ? Number(taskIdFromUrl) : undefined
  )
  const [predictableStocks, setPredictableStocks] = useState<{ code: string; name: string }[]>([])
  const [selectedStock, setSelectedStock] = useState<string | undefined>()
  const [predicting, setPredicting] = useState(false)
  const [batchResults, setBatchResults] = useState<any[]>([])
  const [batchPredicting, setBatchPredicting] = useState(false)
  const { historyRecords, addRecord: addRecordToStore, loadFromBackend } = usePredictionStore()
  const [realtimeQuote, setRealtimeQuote] = useState<RealtimeQuote | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [sharingPrediction, setSharingPrediction] = useState(false)
  const [watchlistStocks, setWatchlistStocks] = useState<{ code: string; name: string }[]>([])
  const [autoPredicting, setAutoPredicting] = useState(false)
  const [expandedStock, setExpandedStock] = useState<string | null>(null)

  const [backtestResults, setBacktestResults] = useState<BacktestResult[]>([])
  const [backtestListLoading, setBacktestListLoading] = useState(false)
  const [selectedBacktestResult, setSelectedBacktestResult] = useState<BacktestResult | null>(null)
  const [backtestDetailModalVisible, setBacktestDetailModalVisible] = useState(false)
  const [backtestDetailLoading, setBacktestDetailLoading] = useState(false)

  const [ensembleModels, setEnsembleModels] = useState<any[]>([])
  const [ensembleWeights, setEnsembleWeights] = useState<number[]>([])
  const [ensembleResult, setEnsembleResult] = useState<any>(null)
  const [ensembleLoading, setEnsembleLoading] = useState(false)
  const [ensembleStock, setEnsembleStock] = useState<string | undefined>()

  const [featureImportance, setFeatureImportance] = useState<[string, number][] | null>(null)
  const [featureImportanceLoading, setFeatureImportanceLoading] = useState(false)

  useEffect(() => {
    fetchTasks()
    fetchModels()
    fetchCompletedTasks()
    fetchBacktestResults()
    return () => {
      Object.values(sseRefs.current).forEach(es => es.close())
    }
  }, [])

  useEffect(() => {
    const runningTasks = tasks.filter(t => t.status === 'running')
    runningTasks.forEach(task => {
      if (!sseRefs.current[task.id]) {
        connectSSE(task.id)
      }
    })
    Object.keys(sseRefs.current).forEach(id => {
      const taskId = Number(id)
      if (!runningTasks.find(t => t.id === taskId)) {
        sseRefs.current[taskId]?.close()
        delete sseRefs.current[taskId]
      }
    })
  }, [tasks])

  useEffect(() => {
    if (selectedTaskId) {
      fetchPredictableStocks(selectedTaskId)
      fetchWatchlistStocks()
      loadFromBackend(String(selectedTaskId))
    }
  }, [selectedTaskId])

  useEffect(() => {
    if (taskIdFromUrl) {
      setSelectedTaskId(Number(taskIdFromUrl))
      setActiveTab(TAB_KEYS.predict)
    }
  }, [taskIdFromUrl])

  const handleTabChange = (key: string) => {
    const tabKey = key as TabKey
    setActiveTab(tabKey)
    const params = new URLSearchParams(searchParams)
    params.set('tab', tabKey)
    if (tabKey === TAB_KEYS.predict && selectedTaskId) {
      params.set('task_id', String(selectedTaskId))
    } else {
      params.delete('task_id')
    }
    setSearchParams(params, { replace: true })
  }

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
        setProgressMap(prev => ({
          ...prev,
          [taskId]: data
        }))
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          es.close()
          delete sseRefs.current[taskId]
          if (data.status === 'completed' || data.status === 'failed') {
            setTrainingEffect(data.status)
          }
          fetchTasks()
          fetchCompletedTasks()
        }
      } catch {}
    }

    es.onerror = () => {
      es.close()
      delete sseRefs.current[taskId]
    }
  }

  const fetchTasks = async () => {
    setTrainingLoading(true)
    try {
      const data: any = await trainingApi.getTasks()
      const items = data?.items || (Array.isArray(data) ? data : [])
      setTasks(items)
      const completedTaskIds = items
        .filter((t: TrainingTask) => t.status === 'completed')
        .map((t: TrainingTask) => t.id)
      if (completedTaskIds.length > 0) {
        fetchBacktestResultsMap(completedTaskIds)
      }
    } catch (error) {
      message.error('哎呀，模型训练翻车了，牛牛建议换个参数试试？')
    } finally {
      setTrainingLoading(false)
    }
  }

  const fetchBacktestResultsMap = async (taskIds: number[]) => {
    try {
      const results: Record<number, any> = {}
      for (const taskId of taskIds) {
        try {
          const res: any = await backtestApi.getResults({ task_id: taskId })
          const items = res?.items || (Array.isArray(res) ? res : [])
          if (items.length > 0) {
            results[taskId] = items[0]
          }
        } catch {}
      }
      setBacktestResultsMap(results)
    } catch {}
  }

  const fetchModels = async () => {
    try {
      const data: any = await modelApi.getModels()
      const modelList = data?.items || (Array.isArray(data) ? data : [])
      const modelMap: Record<number, UserModel> = {}
      modelList.forEach((model: UserModel) => {
        modelMap[model.id] = model
      })
      setModels(modelMap)
    } catch (error) {
      console.error('获取模型列表失败:', error)
    }
  }

  const fetchCompletedTasks = async () => {
    try {
      const data: any = await trainingApi.getTasks({ status: 'completed' })
      setCompletedTasks(data?.items || (Array.isArray(data) ? data : []))
    } catch (error) {
      message.error('获取训练任务失败')
    }
  }

  const fetchPredictableStocks = async (taskId: number) => {
    try {
      const data: any = await predictionApi.getPredictableStocks(taskId)
      const stocks = data.stocks || []
      setPredictableStocks(stocks)
      if (stocks.length > 0 && !selectedStock) {
        setSelectedStock(stocks[0].code)
      }
      if (stocks.length > 0) {
        handleAutoPredict(taskId, stocks)
      }
    } catch (error) {
      message.error('获取可预测股票失败')
    }
  }

  const fetchWatchlistStocks = async () => {
    try {
      const data: any = await watchlistApi.getWatchlists()
      const lists = data?.items || (Array.isArray(data) ? data : [])
      if (lists.length > 0) {
        const firstList = lists[0]
        const items = firstList.items || []
        setWatchlistStocks(items.map((item: any) => ({
          code: item.stock_code,
          name: item.stock_name || item.stock_code,
        })))
      }
    } catch {}
  }

  const fetchLogs = async (taskId: number) => {
    setLogsLoading(true)
    try {
      const data: any = await trainingApi.getTaskLogs(taskId)
      setLogs(data.logs || [])
      setTimeout(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    } catch (error) {
      setLogs([])
    } finally {
      setLogsLoading(false)
    }
  }

  const fetchRealtimeQuote = async (code: string) => {
    setLoadingQuote(true)
    try {
      const data: any = await dataApi.getRealtimeQuote(code)
      setRealtimeQuote(data)
    } catch {
      setRealtimeQuote(null)
    } finally {
      setLoadingQuote(false)
    }
  }

  const fetchBacktestResults = async () => {
    setBacktestListLoading(true)
    try {
      const data: any = await backtestApi.getResults()
      setBacktestResults(Array.isArray(data) ? data : (data?.items || []))
    } catch (error) {
      message.error('获取回测结果失败')
    } finally {
      setBacktestListLoading(false)
    }
  }

  const handleCancel = async (task: TrainingTask) => {
    try {
      const result: any = await trainingApi.cancelTask(task.id)
      if (result.success) {
        message.success('任务已取消')
        fetchTasks()
      } else {
        message.error(result.message)
      }
    } catch (error) {
      message.error('取消失败')
    }
  }

  const handleDelete = async (task: TrainingTask) => {
    try {
      await trainingApi.deleteTask(task.id)
      message.success('删除成功')
      fetchTasks()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleViewDetail = async (task: TrainingTask) => {
    setSelectedTask(task)
    setDetailModalVisible(true)
    setFeatureImportance(null)
    fetchLogs(task.id)
    if (task.status === 'completed') {
      handleFetchFeatureImportance(task.model_id)
    }
  }

  const handleOpenBacktest = (task: TrainingTask) => {
    setBacktestTask(task)
    const model = models[task.model_id]
    const dateRange = model?.train_date_range
    backtestForm.setFieldsValue({
      start_date: dateRange?.start ? [dayjs(dateRange.start), dayjs(dateRange.end || undefined)] : undefined,
      initial_capital: 100000,
      commission_rate: 0.0003,
    })
    setBacktestModalVisible(true)
  }

  const handleRunBacktest = async () => {
    if (!backtestTask) return
    try {
      const values = await backtestForm.validateFields()
      setBacktestLoading(true)
      setBacktestProgress(0)
      setBacktestMessage('正在创建回测任务...')

      const token = localStorage.getItem('token')
      const baseUrl = (window as any).__API_BASE_URL__ || ''
      const dateRange = values.start_date

      const sseUrl = `${baseUrl}/api/backtest/run-stream?token=${token || ''}`

      const response = await fetch(`${sseUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          task_id: backtestTask.id,
          start_date: dateRange[0].format('YYYY-MM-DD'),
          end_date: dateRange[1].format('YYYY-MM-DD'),
          initial_capital: values.initial_capital || 100000,
          commission_rate: values.commission_rate || 0.0003,
        }),
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                setBacktestProgress(data.progress || 0)
                setBacktestMessage(data.message || '')
                if (data.stage === 'completed') {
                  message.success('回测完成')
                  setBacktestModalVisible(false)
                  setActiveTab(TAB_KEYS.backtest)
                  fetchBacktestResults()
                } else if (data.stage === 'error') {
                  message.error(data.message || '回测失败')
                }
              } catch {}
            }
          }
        }
      }

      setBacktestLoading(false)
    } catch (error: any) {
      setBacktestLoading(false)
      const detail = error?.response?.data?.detail
      if (typeof detail === 'string') {
        message.error(detail)
      } else {
        message.error('创建回测失败')
      }
    }
  }

  const handleGoPredict = (task: TrainingTask) => {
    setSelectedTaskId(task.id)
    setActiveTab(TAB_KEYS.predict)
    const params = new URLSearchParams(searchParams)
    params.set('tab', 'predict')
    params.set('task_id', String(task.id))
    setSearchParams(params, { replace: true })
  }

  const addRecord = (result: any, taskId: number) => {
    const task = completedTasks.find((t) => t.id === taskId)
    const model = task ? models[task.model_id] : null
    const record: PredictionRecord = {
      task_id: taskId,
      stock_code: result.stock_code,
      stock_name: result.stock_name || predictableStocks.find(s => s.code === result.stock_code)?.name,
      predict_date: result.predict_date,
      prediction: result.prediction,
      prediction_label: result.prediction_label,
      confidence: result.confidence ?? null,
      predicted_price: result.predicted_price ?? null,
      predicted_change_pct: result.predicted_change_pct ?? null,
      price_range_low: result.price_range_low ?? null,
      price_range_high: result.price_range_high ?? null,
      latest_data: result.latest_data,
      model_name: model ? model.name : `模型#${task?.model_id}`,
      model_type: model?.model_type || '',
      timestamp: Date.now(),
      predicted_volatility: result.predicted_volatility ?? null,
      predicted_volume_change: result.predicted_volume_change ?? null,
      target_type: result.target_type ?? null,
      probability_up: result.probability_up ?? null,
      probability_down: result.probability_down ?? null,
      daily_avg_change_pct: result.daily_avg_change_pct ?? null,
      predicted_trend_days: result.predicted_trend_days ?? null,
      predicted_trend_pct: result.predicted_trend_pct ?? null,
      trend_direction: result.trend_direction ?? null,
      predicted_weeks: result.predicted_weeks ?? null,
      gain_target_pct: result.gain_target_pct ?? null,
      predicted_open: result.predicted_open ?? null,
      predicted_high: result.predicted_high ?? null,
      predicted_low: result.predicted_low ?? null,
      predicted_close: result.predicted_close ?? null,
    }
    addRecordToStore({ ...record, task_id: taskId })
  }

  const handlePredict = async () => {
    if (!selectedTaskId || !selectedStock) {
      message.warning('请选择训练任务和股票')
      return
    }
    setPredicting(true)
    try {
      const data: any = await predictionApi.predict({
        task_id: selectedTaskId,
        stock_code: selectedStock,
      })
      addRecord(data, selectedTaskId)
      fetchRealtimeQuote(selectedStock)
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      if (typeof detail === 'string') {
        message.error(detail)
      } else {
        message.error('牛牛也懵了，这次预测没能完成')
      }
    } finally {
      setPredicting(false)
    }
  }

  const handleBatchPredict = async () => {
    if (!selectedTaskId) {
      message.warning('请选择训练任务')
      return
    }
    setBatchPredicting(true)
    setBatchResults([])
    try {
      const codes = predictableStocks.map((s) => s.code)
      const data: any = await predictionApi.batchPredict({
        task_id: selectedTaskId,
        stock_codes: codes,
      })
      const predictions = data.predictions || []
      setBatchResults(predictions)
      predictions.forEach((p: any) => {
        if (!p.error) {
          addRecord({ ...p, predict_date: new Date().toISOString().slice(0, 10) }, selectedTaskId)
        }
      })
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      if (typeof detail === 'string') {
        message.error(detail)
      } else {
        message.error('批量预测失败')
      }
    } finally {
      setBatchPredicting(false)
    }
  }

  const handleWatchlistBatchPredict = async () => {
    if (!selectedTaskId || watchlistStocks.length === 0) return
    setBatchPredicting(true)
    setBatchResults([])
    try {
      const codes = watchlistStocks.map(s => s.code)
      const data: any = await predictionApi.batchPredict({
        task_id: selectedTaskId,
        stock_codes: codes,
      })
      const predictions = data.predictions || []
      setBatchResults(predictions)
      predictions.forEach((p: any) => {
        if (!p.error) {
          addRecord({ ...p, predict_date: new Date().toISOString().slice(0, 10) }, selectedTaskId)
        }
      })
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      if (typeof detail === 'string') {
        message.error(detail)
      } else {
        message.error('批量预测失败')
      }
    } finally {
      setBatchPredicting(false)
    }
  }

  const handleAutoPredict = async (taskId: number, stocks: { code: string; name: string }[]) => {
    if (!taskId || stocks.length === 0) return
    setAutoPredicting(true)
    setBatchResults([])
    setExpandedStock(null)
    try {
      const codes = stocks.map(s => s.code)
      const data: any = await predictionApi.batchPredict({
        task_id: taskId,
        stock_codes: codes,
      })
      const predictions = data.predictions || []
      setBatchResults(predictions)
      predictions.forEach((p: any) => {
        if (!p.error) {
          addRecord({ ...p, predict_date: new Date().toISOString().slice(0, 10) }, taskId)
        }
      })
    } catch {
      // 自动预测静默失败，不阻断用户操作
    } finally {
      setAutoPredicting(false)
    }
  }

  const handleSharePrediction = async (record: PredictionRecord) => {
    setSharingPrediction(true)
    try {
      await predictionApi.sharePrediction({
        task_id: record.task_id,
        stock_code: record.stock_code,
        prediction_data: {
          prediction: record.prediction,
          prediction_label: record.prediction_label,
          confidence: record.confidence,
          predicted_price: record.predicted_price,
          predicted_change_pct: record.predicted_change_pct,
          price_range_low: record.price_range_low,
          price_range_high: record.price_range_high,
          predicted_volatility: record.predicted_volatility,
          predicted_volume_change: record.predicted_volume_change,
          target_type: record.target_type,
        },
      })
      message.success('预测已发布到社区')
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      if (typeof detail === 'string') {
        message.error(detail)
      } else {
        message.error('发布失败')
      }
    } finally {
      setSharingPrediction(false)
    }
  }

  const handleEnsemblePredict = async () => {
    if (ensembleModels.length < 2) {
      message.warning('请至少选择2个模型')
      return
    }
    if (!ensembleStock) {
      message.warning('请选择预测股票')
      return
    }
    setEnsembleLoading(true)
    setEnsembleResult(null)
    try {
      const data: any = await ensembleApi.ensemblePredict({
        task_ids: ensembleModels.map(m => m.id),
        weights: ensembleWeights.length === ensembleModels.length ? ensembleWeights : undefined,
        stock_code: ensembleStock,
      })
      setEnsembleResult(data)
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      if (typeof detail === 'string') {
        message.error(detail)
      } else {
        message.error('组合预测失败')
      }
    } finally {
      setEnsembleLoading(false)
    }
  }

  const handleFetchFeatureImportance = async (modelId: number) => {
    setFeatureImportanceLoading(true)
    setFeatureImportance(null)
    try {
      const data: any = await featureImportanceApi.getFeatureImportance(modelId)
      setFeatureImportance(data.importance || [])
    } catch {
      setFeatureImportance(null)
    } finally {
      setFeatureImportanceLoading(false)
    }
  }

  const handleDeleteBacktest = async (result: BacktestResult) => {
    try {
      await backtestApi.deleteResult(result.id)
      message.success('删除成功')
      fetchBacktestResults()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleViewBacktestDetail = async (result: BacktestResult) => {
    setSelectedBacktestResult(result)
    setBacktestDetailModalVisible(true)
    setBacktestDetailLoading(true)
    try {
      const [detail, equityRes, tradesRes] = await Promise.all([
        backtestApi.getResult(result.id).catch(() => null),
        backtestApi.getEquityCurve(result.id).catch(() => null),
        backtestApi.getTrades(result.id).catch(() => null),
      ])
      const detailData = detail as any
      const equityData = equityRes as any
      const tradesData = tradesRes as any
      setSelectedBacktestResult({
        ...result,
        ...(detailData || {}),
        equity_curve: equityData?.equity_curve || equityData || null,
        trades: tradesData?.trades || (Array.isArray(tradesData) ? tradesData : []),
      })
    } catch (error) {
      message.error('获取详情数据失败')
    } finally {
      setBacktestDetailLoading(false)
    }
  }

  const getStatusTag = (status: string) => {
    const config: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
      pending: { color: 'default', icon: <ClockCircleOutlined />, text: '待执行' },
      running: { color: 'processing', icon: <LoadingOutlined />, text: '运行中' },
      completed: { color: 'success', icon: <CheckCircleOutlined />, text: '已完成' },
      failed: { color: 'error', icon: <CloseCircleOutlined />, text: '失败' },
      cancelled: { color: 'warning', icon: <PauseCircleOutlined />, text: '已取消' },
    }
    const c = config[status] || config.pending
    return (
      <Tag icon={c.icon} color={c.color}>
        {c.text}
      </Tag>
    )
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

  const runningCount = tasks.filter((t) => t.status === 'running').length
  const completedCount = tasks.filter((t) => t.status === 'completed').length
  const failedCount = tasks.filter((t) => t.status === 'failed').length

  const selectedPredictTask = completedTasks.find((t) => t.id === selectedTaskId)
  const selectedPredictModel = selectedPredictTask ? models[selectedPredictTask.model_id] : null

  const groupedRecords = historyRecords.reduce<Record<string, PredictionRecord[]>>((acc, rec) => {
    const key = rec.stock_code
    if (!acc[key]) acc[key] = []
    acc[key].push(rec)
    return acc
  }, {})

  const latestResult = historyRecords.length > 0 ? historyRecords[0] : null

  const trainingColumns = [
    {
      title: '任务ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '模型',
      dataIndex: 'model_id',
      key: 'model_id',
      render: (modelId: number) => {
        const model = models[modelId]
        return model ? (
          <div>
            <div>{model.name}</div>
            <Tag>{model.model_type.toUpperCase()}</Tag>
          </div>
        ) : (
          `模型 #${modelId}`
        )
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: TrainingTask) => (
        <div>
          {getStatusTag(status)}
          {status === 'running' && progressMap[record.id] && (() => {
            const progress = progressMap[record.id]
            const percent = progress.progress || 0
            const elapsed = progress.elapsed_seconds || getElapsedTime(record)
            const remaining = getEstimatedRemaining(percent, elapsed)
            const stageText = stageMap[progress.stage] || (progress.stage ? progress.stage : '处理中')
            const model = models[record.model_id]
            const isDeepLearning = model && ['lstm', 'gru'].includes(model.model_type.toLowerCase())
            const isDataPrep = progress.stage === 'data_preparation'
            const dataPrepProgress = progress.data_preparation_progress

            return (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#f6f8fa', borderRadius: 6, border: '1px solid #e8e8e8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#1890ff' }}>
                    {isDataPrep ? `📥 ${stageText}` : `🧠 ${stageText}`}
                  </span>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    ⏱ 已用 {formatDuration(elapsed)}
                    {remaining !== null && remaining > 0 && (
                      <> · 预计剩余 <span style={{ color: '#f5222d', fontWeight: 500 }}>{formatDuration(remaining)}</span></>
                    )}
                  </span>
                </div>
                <Progress
                  percent={isDataPrep ? (dataPrepProgress || 0) : percent}
                  size="small"
                  strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
                  status="active"
                />
                {isDeepLearning && progress.epoch && (
                  <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                    Epoch {progress.epoch}{progress.total_epochs ? ` / ${progress.total_epochs}` : ''}
                    {progress.train_loss != null && ` | Loss: ${progress.train_loss.toFixed(4)}`}
                    {progress.val_loss != null && ` | Val: ${progress.val_loss.toFixed(4)}`}
                  </div>
                )}
              </div>
            )
          })()}
          {status === 'running' && !progressMap[record.id] && (
            <div style={{ marginTop: 4, fontSize: 11, color: '#999' }}>
              等待进度数据...
            </div>
          )}
          {record.status === 'completed' && backtestResultsMap[record.id] && (
            <div style={{ marginTop: 4, fontSize: 11, color: '#666' }}>
              <span style={{ color: (backtestResultsMap[record.id].total_return || 0) >= 0 ? '#f5222d' : '#52c41a' }}>
                收益: {((backtestResultsMap[record.id].total_return || 0) * 100).toFixed(1)}%
              </span>
              {' | '}
              <span>夏普: {(backtestResultsMap[record.id].sharpe_ratio || 0).toFixed(2)}</span>
              {' | '}
              <span style={{ color: '#f5222d' }}>回撤: {((backtestResultsMap[record.id].max_drawdown || 0) * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>
      ),
    },
    {
      title: '开始时间',
      dataIndex: 'start_time',
      key: 'start_time',
      render: (time: string) => (time ? new Date(time).toLocaleString() : '-'),
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      render: (duration: number) => {
        if (!duration) return '-'
        const minutes = Math.floor(duration / 60)
        const seconds = Math.floor(duration % 60)
        return `${minutes}分${seconds}秒`
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: TrainingTask) => (
        <Space wrap>
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
          {record.status === 'running' && (
            <Button
              type="text"
              danger
              icon={<PauseCircleOutlined />}
              onClick={() => handleCancel(record)}
            >
              取消
            </Button>
          )}
          {record.status === 'completed' && (
            <>
              <Button
                type="text"
                icon={<LineChartOutlined />}
                style={{ color: '#722ed1' }}
                onClick={() => handleOpenBacktest(record)}
              >
                回测
              </Button>
              {backtestResultsMap[record.id] && (
                <Button
                  type="text"
                  icon={<EyeOutlined />}
                  style={{ color: '#1890ff' }}
                  onClick={() => {
                    setActiveTab(TAB_KEYS.backtest)
                    const params = new URLSearchParams(searchParams)
                    params.set('tab', 'backtest')
                    setSearchParams(params, { replace: true })
                  }}
                >
                  回测详情
                </Button>
              )}
              <Button
                type="text"
                icon={<ThunderboltOutlined />}
                style={{ color: '#faad14' }}
                onClick={() => handleGoPredict(record)}
              >
                预测
              </Button>
            </>
          )}
          {(record.status === 'completed' || record.status === 'failed' || record.status === 'cancelled') && (
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record)}
            >
              删除
            </Button>
          )}
        </Space>
      ),
    },
  ]

  const backtestColumns = [
    {
      title: '回测ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '任务ID',
      dataIndex: 'task_id',
      key: 'task_id',
      render: (taskId: number) => `任务 #${taskId}`,
    },
    {
      title: '回测区间',
      key: 'date_range',
      render: (_: any, record: BacktestResult) => (
        <span>{record.start_date} ~ {record.end_date}</span>
      ),
    },
    {
      title: (
        <Space>
          总收益
          <Tooltip title="策略在回测期间的总盈亏比例"><InfoCircleOutlined /></Tooltip>
        </Space>
      ),
      dataIndex: 'total_return',
      key: 'total_return',
      render: (val: number) => (
        <span style={{ color: val >= 0 ? '#f5222d' : '#52c41a' }}>
          {val ? `${(val * 100).toFixed(2)}%` : '-'}
        </span>
      ),
    },
    {
      title: (
        <Space>
          年化收益
          <Tooltip title="折算为年化的收益率"><InfoCircleOutlined /></Tooltip>
        </Space>
      ),
      dataIndex: 'annual_return',
      key: 'annual_return',
      render: (val: number) => (
        <span style={{ color: val >= 0 ? '#f5222d' : '#52c41a' }}>
          {val ? `${(val * 100).toFixed(2)}%` : '-'}
        </span>
      ),
    },
    {
      title: (
        <Space>
          最大回撤
          <Tooltip title="从最高点到最低点的最大跌幅，越小越好"><InfoCircleOutlined /></Tooltip>
        </Space>
      ),
      dataIndex: 'max_drawdown',
      key: 'max_drawdown',
      render: (val: number) => (
        <span style={{ color: '#f5222d' }}>
          {val ? `${(val * 100).toFixed(2)}%` : '-'}
        </span>
      ),
    },
    {
      title: (
        <Space>
          夏普比率
          <Tooltip title="每单位风险的超额收益，>1为优秀"><InfoCircleOutlined /></Tooltip>
        </Space>
      ),
      dataIndex: 'sharpe_ratio',
      key: 'sharpe_ratio',
      render: (val: number) => (val ? val.toFixed(2) : '-'),
    },
    {
      title: '交易次数',
      dataIndex: 'trades_count',
      key: 'trades_count',
    },
    {
      title: '胜率',
      dataIndex: 'win_rate',
      key: 'win_rate',
      render: (val: number) => (val ? `${(val * 100).toFixed(1)}%` : '-'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: BacktestResult) => (
        <Space>
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => handleViewBacktestDetail(record)}
          >
            详情
          </Button>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteBacktest(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const renderTrainingTab = () => (
    <>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={() => navigate('/models/build')}
        >
          创建新模型
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="运行中"
              value={runningCount}
              prefix={<LoadingOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="已完成"
              value={completedCount}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="失败"
              value={failedCount}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: '#f5222d' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="任务列表"
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchTasks}>
            刷新
          </Button>
        }
      >
        <Table
          columns={trainingColumns}
          dataSource={tasks}
          rowKey="id"
          loading={trainingLoading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 900 }}
          locale={{
            emptyText: (
              <div style={{ padding: '24px 0' }}>
                <MascotBull mood="chill" size="medium" message="还没有训练任务？去创建模型开始训练吧" />
              </div>
            ),
          }}
        />
      </Card>
    </>
  )

  const renderPredictTab = () => {
    const renderExpandedStockDetail = (stockCode: string) => {
      const record = historyRecords.find(
        (r) => r.stock_code === stockCode && r.task_id === selectedTaskId
      )
      if (!record) return null
      const targetType = record.target_type || selectedPredictModel?.target || 'next_day_return'

      return (
        <Card size="small" style={{ marginTop: 8, background: '#fafafa' }}>
          <Row gutter={[8, 8]}>
            <Col span={8}>
              <Statistic title="预测值" value={record.prediction} precision={6} valueStyle={{ fontSize: 14 }} />
            </Col>
            <Col span={8}>
              <Statistic
                title="置信度"
                value={(record.confidence ?? 0) * 100}
                suffix="%"
                precision={1}
                valueStyle={{ fontSize: 14 }}
              />
            </Col>
            {record.predicted_price != null && (
              <Col span={8}>
                <Statistic title="预测价格" value={record.predicted_price} prefix="¥" precision={2} valueStyle={{ fontSize: 14 }} />
              </Col>
            )}
            {targetType === 'next_day_direction' && (
              <>
                <Col span={12}>
                  <Statistic title="上涨概率" value={(record.probability_up ?? 0) * 100} suffix="%" precision={1} valueStyle={{ fontSize: 14, color: '#f5222d' }} />
                </Col>
                <Col span={12}>
                  <Statistic title="下跌概率" value={(record.probability_down ?? 0) * 100} suffix="%" precision={1} valueStyle={{ fontSize: 14, color: '#52c41a' }} />
                </Col>
              </>
            )}
            {targetType === 'next_day_ohlc' && (
              <>
                <Col span={6}><Statistic title="开盘" value={record.predicted_open ?? 0} prefix="¥" precision={2} valueStyle={{ fontSize: 13 }} /></Col>
                <Col span={6}><Statistic title="最高" value={record.predicted_high ?? 0} prefix="¥" precision={2} valueStyle={{ fontSize: 13, color: '#f5222d' }} /></Col>
                <Col span={6}><Statistic title="最低" value={record.predicted_low ?? 0} prefix="¥" precision={2} valueStyle={{ fontSize: 13, color: '#52c41a' }} /></Col>
                <Col span={6}><Statistic title="收盘" value={record.predicted_close ?? 0} prefix="¥" precision={2} valueStyle={{ fontSize: 13 }} /></Col>
              </>
            )}
            {(targetType === 'trend_30d' || targetType === 'trend_60d' || targetType === 'trend_90d') && (
              <>
                <Col span={8}>
                  <Statistic title="趋势方向" value={record.trend_direction ?? '震荡'} valueStyle={{ fontSize: 14 }} />
                </Col>
                <Col span={8}>
                  <Statistic title="预测幅度" value={record.predicted_trend_pct ?? 0} suffix="%" precision={2} valueStyle={{ fontSize: 14 }} />
                </Col>
                <Col span={8}>
                  <Statistic title="预测周期" value={record.predicted_trend_days ?? 0} suffix="天" valueStyle={{ fontSize: 14 }} />
                </Col>
              </>
            )}
            {record.predicted_volatility != null && (
              <Col span={8}>
                <Statistic title="波动率" value={record.predicted_volatility} precision={6} valueStyle={{ fontSize: 14 }} />
              </Col>
            )}
            {record.predicted_volume_change != null && (
              <Col span={8}>
                <Statistic title="量变率" value={record.predicted_volume_change} precision={6} valueStyle={{ fontSize: 14 }} />
              </Col>
            )}
            {record.price_range_low != null && record.price_range_high != null && (
              <Col span={8}>
                <div style={{ fontSize: 12, color: '#888', padding: '4px 0' }}>
                  区间: ¥{record.price_range_low.toFixed(2)} ~ ¥{record.price_range_high.toFixed(2)}
                </div>
              </Col>
            )}
            {record.latest_data && (
              <Col span={24}>
                <div style={{ fontSize: 12, color: '#999' }}>
                  最新收盘: ¥{record.latest_data.close?.toFixed(2)} ({record.latest_data.date})
                </div>
              </Col>
            )}
          </Row>
        </Card>
      )
    }

    const successCount = batchResults.filter((p: any) => !p.error).length

    return (
      <>
        {completedTasks.length === 0 && (
          <Alert
            message="暂无可用的训练任务"
            description={
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
                <MascotBull mood="thinking" size="small" message="" />
                <span>请先完成模型训练后再进行预测。训练完成后，在此页面即可使用对应模型进行预测。</span>
              </div>
            }
            type="info"
            showIcon
            action={
              <Button type="primary" onClick={() => navigate('/models/build')}>
                去创建模型
              </Button>
            }
            style={{ marginBottom: 24 }}
          />
        )}

        <Card style={{ marginBottom: 24 }}>
          <Row gutter={[16, 16]} align="middle">
            <Col flex="auto">
              <div style={{ marginBottom: 8, fontWeight: 500 }}>选择训练任务</div>
              <Select
                placeholder="选择已完成的训练任务，自动预测所有训练股票"
                value={selectedTaskId}
                onChange={setSelectedTaskId}
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="children"
              >
                {completedTasks.map((task) => {
                  const model = models[task.model_id]
                  return (
                    <Select.Option key={task.id} value={task.id}>
                      任务#{task.id} - {model ? `${model.name} (${model.model_type.toUpperCase()})` : `模型#${task.model_id}`}
                    </Select.Option>
                  )
                })}
              </Select>
            </Col>
          </Row>
          {selectedPredictModel && (
            <Descriptions size="small" bordered column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 16 }}>
              <Descriptions.Item label="模型类型">{selectedPredictModel.model_type.toUpperCase()}</Descriptions.Item>
              <Descriptions.Item label="预测目标">
                {selectedPredictModel.target === 'next_day_return' ? '次日收益率' :
                 selectedPredictModel.target === 'next_day_direction' ? '次日涨跌方向' :
                 selectedPredictModel.target === 'next_day_ohlc' ? '次日OHLC' :
                 selectedPredictModel.target === 'price_change_5d' ? '5日价格变化' :
                 selectedPredictModel.target === 'trend_30d' ? '30日趋势' :
                 selectedPredictModel.target === 'trend_60d' ? '60日趋势' :
                 selectedPredictModel.target === 'trend_90d' ? '90日趋势' :
                 selectedPredictModel.target === 'time_to_gain_pct' ? '涨幅时间预测' :
                 selectedPredictModel.target === 'multi_feature_next_day' ? '多维预测（收益率+波动率+量变率）' : selectedPredictModel.target}
              </Descriptions.Item>
              <Descriptions.Item label="特征数量">{selectedPredictModel.features?.length || 0}个指标</Descriptions.Item>
            </Descriptions>
          )}
        </Card>

        {autoPredicting && (
          <Card style={{ textAlign: 'center', padding: '32px 0', marginBottom: 24 }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
            <div style={{ marginTop: 12, color: '#666', fontSize: 15 }}>正在自动预测所有训练股票...</div>
          </Card>
        )}

        {!autoPredicting && batchResults.length > 0 && (
          <Card
            title={`预测结果（${successCount}/${batchResults.length} 只股票）`}
            style={{ marginBottom: 24 }}
          >
            <Row gutter={[16, 16]}>
              {batchResults.map((p: any) => {
                if (p.error) return null
                const stockName = p.stock_name || predictableStocks.find((s: any) => s.code === p.stock_code)?.name || p.stock_code
                const changePct = p.predicted_change_pct
                const isUp = changePct != null && changePct > 0
                const isDown = changePct != null && changePct < 0
                const confidence = p.confidence
                const label = p.prediction_label || (isUp ? '看涨' : isDown ? '看跌' : '震荡')
                const isExpanded = expandedStock === p.stock_code

                return (
                  <Col xs={24} sm={12} md={8} key={p.stock_code}>
                    <Card
                      size="small"
                      hoverable
                      style={{ borderLeft: `3px solid ${isUp ? '#f5222d' : isDown ? '#52c41a' : '#faad14'}` }}
                      onClick={() => setExpandedStock(isExpanded ? null : p.stock_code)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{stockName}</div>
                          <div style={{ color: '#999', fontSize: 12 }}>{p.stock_code}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: isUp ? '#f5222d' : isDown ? '#52c41a' : '#faad14' }}>
                            {label === '看涨' ? '看涨 ↑' : label === '看跌' ? '看跌 ↓' : '震荡 -'}
                          </div>
                          {changePct != null && (
                            <div style={{ fontSize: 12, color: isUp ? '#f5222d' : isDown ? '#52c41a' : '#999' }}>
                              {changePct > 0 ? '+' : ''}{changePct.toFixed(2)}%
                            </div>
                          )}
                        </div>
                      </div>
                      {confidence != null && (
                        <Progress
                          percent={Math.round(confidence * 100)}
                          size="small"
                          strokeColor={confidence > 0.6 ? '#52c41a' : '#faad14'}
                          style={{ marginTop: 8 }}
                        />
                      )}
                    </Card>
                    {isExpanded && renderExpandedStockDetail(p.stock_code)}
                  </Col>
                )
              })}
            </Row>
            {batchResults.some((p: any) => p.error) && (
              <div style={{ marginTop: 12, fontSize: 12, color: '#999' }}>
                {batchResults.filter((p: any) => p.error).length} 只股票预测失败
              </div>
            )}
            <Alert
              style={{ marginTop: 16 }}
              message="以上预测结果仅供参考，不构成任何投资建议。股市有风险，投资需谨慎。"
              type="warning"
              showIcon
            />
          </Card>
        )}

        <Collapse
          ghost
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'manual',
              label: '手动预测（选择特定股票）',
              children: (
                <Card size="small">
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <div style={{ marginBottom: 8, fontWeight: 500 }}>预测股票</div>
                      <AutoComplete
                        placeholder="选择或输入股票代码（如 000858）"
                        value={selectedStock}
                        onChange={(value) => setSelectedStock(value)}
                        style={{ width: '100%' }}
                        options={predictableStocks.map((stock) => ({
                          value: stock.code,
                          label: `${stock.code} - ${stock.name}`,
                        }))}
                        filterOption={(inputValue, option) =>
                          option!.value.toLowerCase().includes(inputValue.toLowerCase()) ||
                          option!.label.toLowerCase().includes(inputValue.toLowerCase())
                        }
                      />
                    </Col>
                  </Row>
                  <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <Button
                      type="primary"
                      icon={<ThunderboltOutlined />}
                      loading={predicting}
                      onClick={handlePredict}
                      disabled={!selectedTaskId || !selectedStock}
                    >
                      开始预测
                    </Button>
                    <Button
                      icon={<RobotOutlined />}
                      loading={batchPredicting}
                      onClick={handleBatchPredict}
                      disabled={!selectedTaskId || predictableStocks.length === 0}
                    >
                      批量预测所有股票
                    </Button>
                    <Button
                      icon={<StockOutlined />}
                      loading={batchPredicting}
                      onClick={handleWatchlistBatchPredict}
                      disabled={!selectedTaskId || watchlistStocks.length === 0}
                    >
                      从自选股批量预测 ({watchlistStocks.length})
                    </Button>
                  </div>
                </Card>
              ),
            },
            {
              key: 'ensemble',
              label: '🔀 组合预测（多模型加权）',
              children: (
                <Card size="small">
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ color: '#999' }}>选择多个已完成的训练任务，加权组合预测结果。所有模型的预测目标需一致。</span>
                  </div>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>选择训练任务（至少2个）</div>
                  <Select
                    mode="multiple"
                    placeholder="选择已完成的训练任务"
                    style={{ width: '100%', marginBottom: 8 }}
                    value={ensembleModels.map(m => m.id)}
                    onChange={(ids: number[]) => {
                      const selected = completedTasks.filter(t => ids.includes(t.id))
                      setEnsembleModels(selected)
                      setEnsembleWeights(selected.map(() => 1.0 / Math.max(selected.length, 1)))
                      setEnsembleResult(null)
                    }}
                    options={completedTasks.map(t => {
                      const m = models[t.model_id]
                      return {
                        label: `任务#${t.id} - ${m ? `${m.name} (${m.model_type.toUpperCase()})` : `模型#${t.model_id}`}`,
                        value: t.id,
                      }
                    })}
                  />
                  {ensembleModels.length >= 2 && (
                    <>
                      <div style={{ marginBottom: 8, fontWeight: 500 }}>权重配置</div>
                      {ensembleModels.map((t, i) => {
                        const m = models[t.model_id]
                        return (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ flex: 1, fontSize: 12 }}>
                              {m ? `${m.name} (${m.model_type.toUpperCase()})` : `任务#${t.id}`}
                            </span>
                            <InputNumber
                              min={0.1} max={5} step={0.1}
                              value={ensembleWeights[i]}
                              onChange={v => {
                                const nw = [...ensembleWeights]
                                nw[i] = v || 1
                                setEnsembleWeights(nw)
                              }}
                              style={{ width: 80 }}
                              size="small"
                            />
                          </div>
                        )
                      })}
                      <div style={{ marginBottom: 8, fontWeight: 500, marginTop: 12 }}>预测股票</div>
                      <AutoComplete
                        placeholder="输入股票代码（如 000858）"
                        value={ensembleStock}
                        onChange={(value) => setEnsembleStock(value)}
                        style={{ width: '100%', marginBottom: 12 }}
                        options={predictableStocks.map((stock) => ({
                          value: stock.code,
                          label: `${stock.code} - ${stock.name}`,
                        }))}
                        filterOption={(inputValue, option) =>
                          option!.value.toLowerCase().includes(inputValue.toLowerCase()) ||
                          option!.label.toLowerCase().includes(inputValue.toLowerCase())
                        }
                      />
                      <Button type="primary" onClick={handleEnsemblePredict} loading={ensembleLoading}>
                        组合预测
                      </Button>
                    </>
                  )}
                  {ensembleResult && (
                    <Card
                      size="small"
                      style={{
                        marginTop: 12,
                        borderLeft: `3px solid ${ensembleResult.ensemble_direction === 'up' ? '#f5222d' : ensembleResult.ensemble_direction === 'down' ? '#52c41a' : '#faad14'}`,
                      }}
                    >
                      <div style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: ensembleResult.ensemble_direction === 'up' ? '#f5222d' : ensembleResult.ensemble_direction === 'down' ? '#52c41a' : '#faad14',
                      }}>
                        {ensembleResult.ensemble_direction === 'up' ? '看涨 ↑' : ensembleResult.ensemble_direction === 'down' ? '看跌 ↓' : '震荡 -'}
                      </div>
                      <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                        综合预测值 {ensembleResult.ensemble_prediction} · 置信度 {Math.round(ensembleResult.ensemble_confidence * 100)}%
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11, color: '#666' }}>
                        {ensembleResult.models.map((m: any) => `${m.model_name}: ${Math.round(m.weight * 100)}%`).join(' + ')}
                      </div>
                      <Collapse
                        ghost
                        size="small"
                        style={{ marginTop: 8 }}
                        items={[{
                          key: 'detail',
                          label: '各模型详情',
                          children: (
                            <div>
                              {ensembleResult.models.map((m: any) => (
                                <div key={m.task_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                  <span>{m.model_name} ({m.model_type.toUpperCase()})</span>
                                  <span>
                                    预测: {m.prediction} · 置信度: {Math.round(m.confidence * 100)}% · 权重: {Math.round(m.weight * 100)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          ),
                        }]}
                      />
                    </Card>
                  )}
                </Card>
              ),
            },
          ]}
        />

        {latestResult && !autoPredicting && (
          <Card
            title="最新单股预测结果"
            style={{ marginBottom: 24 }}
            extra={
              <Button
                icon={<ShareAltOutlined />}
                loading={sharingPrediction}
                onClick={() => handleSharePrediction(latestResult)}
                size="small"
              >
                发布到社区
              </Button>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Card
                  style={{
                    background: getLabelStyle(latestResult.prediction_label).bg,
                    borderRadius: 12,
                  }}
                >
                  <PredictionResult
                    direction={labelToDirection(latestResult.prediction_label)}
                    confidence={latestResult.confidence ?? deriveConfidence(latestResult.prediction)}
                    stockName={predictableStocks.find(s => s.code === latestResult.stock_code)?.name}
                    stockCode={latestResult.stock_code}
                    predictedPrice={latestResult.predicted_price}
                    predictedChangePct={latestResult.predicted_change_pct}
                    priceRangeLow={latestResult.price_range_low}
                    priceRangeHigh={latestResult.price_range_high}
                    predictedVolatility={latestResult.predicted_volatility}
                    predictedVolumeChange={latestResult.predicted_volume_change}
                    targetType={latestResult.target_type || selectedPredictModel?.target || 'next_day_return'}
                  />
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Row gutter={[16, 16]}>
                  <Col span={24}>
                    <Card>
                      <PredictionAnimation
                        direction={labelToDirection(latestResult.prediction_label)}
                        value={latestResult.prediction}
                        label={latestResult.prediction_label}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Card>
                      <Statistic
                        title="最新收盘价"
                        value={latestResult.latest_data?.close || 0}
                        prefix="¥"
                        precision={2}
                      />
                      <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
                        数据日期: {latestResult.latest_data?.date || '-'}
                      </div>
                    </Card>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Card>
                      <div style={{ marginBottom: 8, fontWeight: 500, color: '#666' }}>置信度</div>
                      <ConfidenceBar confidence={latestResult.confidence ?? deriveConfidence(latestResult.prediction)} />
                      {latestResult.price_range_low != null && latestResult.price_range_high != null && (
                        <div style={{ marginTop: 12, fontSize: 13, color: '#888' }}>
                          价格区间: ¥{latestResult.price_range_low.toFixed(2)} ~ ¥{latestResult.price_range_high.toFixed(2)}
                        </div>
                      )}
                    </Card>
                  </Col>
                </Row>
              </Col>
            </Row>

            {!predictableStocks.some(s => s.code === latestResult.stock_code) && (
              <Alert
                style={{ marginTop: 16 }}
                message="跨股票预测提示"
                description={`此模型使用 ${predictableStocks.map(s => `${s.code} ${s.name}`).join('、') || '其他股票'} 数据训练，预测当前股票基于特征模式泛化，结果仅供参考。`}
                type="info"
                showIcon
              />
            )}

            <Alert
              style={{ marginTop: 16 }}
              message="预测说明"
              description={
                latestResult.prediction_label === '看涨'
                  ? `模型预测 ${latestResult.stock_code} 短期有上涨趋势，预测值为 ${latestResult.prediction.toFixed(6)}。请注意：此预测仅供参考，不构成投资建议。`
                  : latestResult.prediction_label === '看跌'
                  ? `模型预测 ${latestResult.stock_code} 短期有下跌趋势，预测值为 ${latestResult.prediction.toFixed(6)}。请注意：此预测仅供参考，不构成投资建议。`
                  : `模型预测 ${latestResult.stock_code} 短期走势震荡，预测值为 ${latestResult.prediction.toFixed(6)}。请注意：此预测仅供参考，不构成投资建议。`
              }
              type={
                latestResult.prediction_label === '看涨' ? 'success' :
                latestResult.prediction_label === '看跌' ? 'warning' : 'info'
              }
              showIcon
            />
          </Card>
        )}

        {realtimeQuote && latestResult && (
          <Card
            title={
              <Space>
                <StockOutlined />
                <span>实时行情 - {realtimeQuote.name}({realtimeQuote.code})</span>
                <Tooltip title="刷新行情">
                  <Button
                    type="link"
                    size="small"
                    icon={<ReloadOutlined spin={loadingQuote} />}
                    onClick={() => fetchRealtimeQuote(latestResult.stock_code)}
                  />
                </Tooltip>
              </Space>
            }
            style={{ marginBottom: 24 }}
            size="small"
          >
            <Row gutter={[16, 12]}>
              <Col xs={8} sm={4}>
                <Statistic
                  title="当前价"
                  value={realtimeQuote.price}
                  precision={2}
                  prefix="¥"
                  valueStyle={realtimeQuote.change_pct > 0 ? { color: '#f5222d' } : realtimeQuote.change_pct < 0 ? { color: '#52c41a' } : undefined}
                />
              </Col>
              <Col xs={8} sm={4}>
                <Statistic
                  title="涨跌幅"
                  value={realtimeQuote.change_pct}
                  precision={2}
                  suffix="%"
                  valueStyle={realtimeQuote.change_pct > 0 ? { color: '#f5222d' } : realtimeQuote.change_pct < 0 ? { color: '#52c41a' } : undefined}
                  prefix={realtimeQuote.change_pct > 0 ? <ArrowUpOutlined /> : realtimeQuote.change_pct < 0 ? <ArrowDownOutlined /> : undefined}
                />
              </Col>
              <Col xs={8} sm={4}><Statistic title="开盘" value={realtimeQuote.open} precision={2} prefix="¥" /></Col>
              <Col xs={8} sm={4}><Statistic title="最高" value={realtimeQuote.high} precision={2} prefix="¥" /></Col>
              <Col xs={8} sm={4}><Statistic title="最低" value={realtimeQuote.low} precision={2} prefix="¥" /></Col>
              <Col xs={8} sm={4}><Statistic title="昨收" value={realtimeQuote.pre_close} precision={2} prefix="¥" /></Col>
            </Row>
            <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
              行情时间: {realtimeQuote.time || '-'}
            </div>
          </Card>
        )}

        {historyRecords.length > 0 && (
          <Card
            title={`预测历史（共 ${historyRecords.length} 条）`}
            extra={
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => usePredictionStore.getState().clearRecords()}>
                清空
              </Button>
            }
            style={{ marginBottom: 24 }}
          >
            <Collapse
              defaultActiveKey={Object.keys(groupedRecords).slice(0, 3)}
              style={{ marginTop: 16 }}
              items={Object.entries(groupedRecords).map(([stockCode, records]) => {
                const latest = records[0]
                const isUp = latest.prediction_label === '看涨'
                const isDown = latest.prediction_label === '看跌'
                return {
                  key: stockCode,
                  label: (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>
                        <span style={{ fontWeight: 600 }}>{latest.stock_name || stockCode}</span>
                        <span style={{ color: '#999', marginLeft: 8 }}>{stockCode}</span>
                      </span>
                      <span>
                        <Tag color={isUp ? 'red' : isDown ? 'green' : 'default'}>
                          {isUp ? '看涨 ↑' : isDown ? '看跌 ↓' : '震荡 -'}
                        </Tag>
                        <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
                          {records.length}条预测
                        </span>
                      </span>
                    </div>
                  ),
                  children: (
                    <Row gutter={[8, 8]}>
                      {records.map((rec, idx) => {
                        const recIsUp = rec.prediction_label === '看涨'
                        const recIsDown = rec.prediction_label === '看跌'
                        return (
                          <Col xs={24} sm={12} md={8} key={idx}>
                            <Card size="small" style={{
                              borderLeft: `3px solid ${recIsUp ? '#f5222d' : recIsDown ? '#52c41a' : '#faad14'}`
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: 12, color: '#999' }}>{rec.predict_date || new Date(rec.timestamp).toLocaleDateString()}</span>
                                <Tag color={recIsUp ? 'red' : recIsDown ? 'green' : 'default'} style={{ fontSize: 11 }}>
                                  {recIsUp ? '看涨' : recIsDown ? '看跌' : '震荡'}
                                </Tag>
                              </div>
                              {rec.predicted_price != null && (
                                <div style={{ fontSize: 16, fontWeight: 600 }}>
                                  ¥{rec.predicted_price.toFixed(2)}
                                </div>
                              )}
                              {rec.predicted_change_pct != null && (
                                <div style={{ fontSize: 12, color: rec.predicted_change_pct > 0 ? '#f5222d' : rec.predicted_change_pct < 0 ? '#52c41a' : '#999' }}>
                                  {rec.predicted_change_pct > 0 ? '+' : ''}{rec.predicted_change_pct.toFixed(2)}%
                                </div>
                              )}
                              {rec.confidence != null && (
                                <div style={{ marginTop: 4 }}>
                                  <Progress percent={Math.round(rec.confidence * 100)} size="small" strokeColor={rec.confidence > 0.6 ? '#52c41a' : '#faad14'} />
                                </div>
                              )}
                              {rec.model_name && (
                                <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                                  {rec.model_name}
                                </div>
                              )}
                            </Card>
                          </Col>
                        )
                      })}
                    </Row>
                  ),
                }
              })}
            />
          </Card>
        )}

        {(predicting || batchPredicting) && (
          <Card style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" tip="模型推理中..." />
          </Card>
        )}
      </>
    )
  }

  const renderBacktestTab = () => (
    <>
      <BacktestGuide />

      <Card
        title="回测结果列表"
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchBacktestResults}>
            刷新
          </Button>
        }
      >
        <Table
          columns={backtestColumns}
          dataSource={backtestResults}
          rowKey="id"
          loading={backtestListLoading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1200 }}
        />
      </Card>
    </>
  )

  return (
    <div>
      <h1 className="page-title">训练与预测</h1>
      <p className="page-description">
        模型训练、智能预测与回测分析一站式操作。
      </p>

      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          {
            key: TAB_KEYS.training,
            label: (
              <Space>
                <LoadingOutlined />
                训练任务
              </Space>
            ),
            children: renderTrainingTab(),
          },
          {
            key: TAB_KEYS.predict,
            label: (
              <Space>
                <ThunderboltOutlined />
                智能预测
              </Space>
            ),
            children: renderPredictTab(),
          },
          {
            key: TAB_KEYS.backtest,
            label: (
              <Space>
                <LineChartOutlined />
                回测结果
              </Space>
            ),
            children: renderBacktestTab(),
          },
        ]}
      />

      <Modal
        title={`任务详情 #${selectedTask?.id}`}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        width={isMobile ? '100%' : 900}
        footer={[
          selectedTask?.status === 'completed' && (
            <Button
              key="backtest"
              icon={<LineChartOutlined />}
              style={{ background: '#722ed1', borderColor: '#722ed1', color: '#fff' }}
              onClick={() => {
                setDetailModalVisible(false)
                if (selectedTask) handleOpenBacktest(selectedTask)
              }}
            >
              执行回测
            </Button>
          ),
          selectedTask?.status === 'completed' && (
            <Button
              key="paper-trading"
              icon={<FundOutlined />}
              onClick={() => {
                Modal.info({
                  title: '📊 模拟盘交易',
                  content: '模拟盘功能即将上线！系统将根据模型预测自动执行虚拟交易，记录真实收益表现。',
                })
              }}
            >
              模拟盘
            </Button>
          ),
          selectedTask?.status === 'completed' && (
            <Button
              key="predict"
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={() => {
                setDetailModalVisible(false)
                if (selectedTask) handleGoPredict(selectedTask)
              }}
            >
              去预测
            </Button>
          ),
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
        ].filter(Boolean)}
      >
        {selectedTask && (
          <Tabs defaultActiveKey="info" items={[
            {
              key: 'info',
              label: '基本信息',
              children: (
                <>
                  <Descriptions bordered column={{ xs: 1, sm: 2 }}>
                    <Descriptions.Item label="任务ID">{selectedTask.id}</Descriptions.Item>
                    <Descriptions.Item label="模型ID">{selectedTask.model_id}</Descriptions.Item>
                    <Descriptions.Item label="状态">
                      {getStatusTag(selectedTask.status)}
                    </Descriptions.Item>
                    <Descriptions.Item label="开始时间">
                      {selectedTask.start_time ? new Date(selectedTask.start_time).toLocaleString() : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="结束时间">
                      {selectedTask.end_time ? new Date(selectedTask.end_time).toLocaleString() : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="耗时">
                      {selectedTask.duration ? `${Math.floor(selectedTask.duration / 60)}分${Math.floor(selectedTask.duration % 60)}秒` : '-'}
                    </Descriptions.Item>
                  </Descriptions>

                  {selectedTask.metrics && (
                    <div style={{ marginTop: 24 }}>
                      <h3>训练指标</h3>
                      <Row gutter={[16, 16]}>
                        {Object.entries(selectedTask.metrics).map(([key, value]: [string, any]) => {
                          if (typeof value === 'number') {
                            return (
                              <Col span={8} key={key}>
                                <Card size="small">
                                  <Statistic
                                    title={key.toUpperCase()}
                                    value={typeof value === 'number' ? value.toFixed(4) : value}
                                  />
                                </Card>
                              </Col>
                            )
                          }
                          return null
                        })}
                      </Row>
                    </div>
                  )}

                  {selectedTask.error_message && (
                    <div style={{ marginTop: 24 }}>
                      <h3 style={{ color: '#f5222d' }}>错误信息</h3>
                      <div style={{ padding: 16, background: '#fff1f0', borderRadius: 4, color: '#f5222d' }}>
                        {selectedTask.error_message}
                      </div>
                    </div>
                  )}
                </>
              ),
            },
            {
              key: 'feature-importance',
              label: (
                <Space>
                  <InfoCircleOutlined />
                  特征重要性
                </Space>
              ),
              children: featureImportanceLoading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <LoadingOutlined style={{ fontSize: 24 }} /> 加载中...
                </div>
              ) : featureImportance && featureImportance.length > 0 ? (
                <div>
                  <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
                    Top 10 特征重要性（归一化后，总和为1）
                  </div>
                  {featureImportance.slice(0, 10).map(([name, value]: [string, number]) => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ width: 140, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>
                        {name}
                      </span>
                      <div style={{ flex: 1, height: 16, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${value * 100}%`, height: '100%', background: 'linear-gradient(90deg, #1890ff, #722ed1)', borderRadius: 4 }} />
                      </div>
                      <span style={{ width: 55, textAlign: 'right', fontSize: 11, color: '#666' }}>
                        {(value * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                  {featureImportance.length > 10 && (
                    <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
                      共 {featureImportance.length} 个特征，仅展示 Top 10
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                  特征重要性数据不可用（模型训练时未计算或模型类型不支持）
                </div>
              ),
            },
            {
              key: 'logs',
              label: (
                <Space>
                  <FileTextOutlined />
                  训练日志
                </Space>
              ),
              children: (
                <>
                  <div
                    style={{
                      background: '#1e1e1e',
                      color: '#d4d4d4',
                      padding: 16,
                      borderRadius: 8,
                      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                      fontSize: 13,
                      lineHeight: 1.6,
                      maxHeight: 400,
                      overflowY: 'auto',
                    }}
                  >
                    {logsLoading ? (
                      <div style={{ textAlign: 'center', padding: 40 }}>
                        <LoadingOutlined /> 加载日志中...
                      </div>
                    ) : logs.length > 0 ? (
                      logs.map((line, idx) => (
                        <div key={idx} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {line}
                        </div>
                      ))
                    ) : (
                      <div style={{ color: '#666', textAlign: 'center', padding: 40 }}>
                        暂无训练日志
                      </div>
                    )}
                    <div ref={logsEndRef} />
                  </div>
                  <div style={{ marginTop: 8, textAlign: 'right' }}>
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={() => selectedTask && fetchLogs(selectedTask.id)}
                    >
                      刷新日志
                    </Button>
                  </div>
                </>
              ),
            },
          ]} />
        )}
      </Modal>

      <Modal
        title="执行回测"
        open={backtestModalVisible}
        onCancel={() => { if (!backtestLoading) setBacktestModalVisible(false) }}
        footer={backtestLoading ? null : [
          <Button key="cancel" onClick={() => setBacktestModalVisible(false)}>取消</Button>,
          <Button key="ok" type="primary" onClick={handleRunBacktest}>开始回测</Button>,
        ]}
        width={isMobile ? '100%' : 600}
      >
        {backtestLoading ? (
          <div style={{ padding: '20px 0' }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <LoadingOutlined style={{ fontSize: 48, color: '#1890ff' }} />
            </div>
            <Progress
              percent={backtestProgress}
              status="active"
              strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
            />
            <div style={{ textAlign: 'center', color: '#666', marginTop: 8 }}>
              {backtestMessage}
            </div>
          </div>
        ) : (
          <Form form={backtestForm} layout="vertical">
            <Form.Item
              name="start_date"
              label="回测日期范围"
              rules={[{ required: true, message: '请选择回测日期范围' }]}
            >
              <DatePicker.RangePicker style={{ width: '100%' }} />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="initial_capital"
                  label="初始资金"
                  initialValue={100000}
                >
                  <Space.Compact style={{ width: '100%' }}>
                    <InputNumber
                      min={10000}
                      max={10000000}
                      step={10000}
                      style={{ width: 'calc(100% - 32px)' }}
                    />
                    <Input disabled value="元" style={{ width: 32, textAlign: 'center', color: '#999' }} />
                  </Space.Compact>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="commission_rate"
                  label="手续费率"
                  initialValue={0.0003}
                >
                  <InputNumber
                    min={0}
                    max={0.01}
                    step={0.0001}
                    style={{ width: '100%' }}
                    precision={4}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        )}
      </Modal>

      <Modal
        title={`回测详情 #${selectedBacktestResult?.id}`}
        open={backtestDetailModalVisible}
        onCancel={() => setBacktestDetailModalVisible(false)}
        width={isMobile ? '100%' : 1000}
        footer={[
          <Button key="close" onClick={() => setBacktestDetailModalVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        {selectedBacktestResult && (
          <Spin spinning={backtestDetailLoading}>
            <Tabs defaultActiveKey="overview" items={[
            {
              key: 'overview',
              label: '概览',
              children: (
                <>
                  <Row gutter={[16, 16]}>
                    <Col span={8}>
                      <Card size="small">
                        <Statistic
                          title="初始资金"
                          value={selectedBacktestResult.initial_capital}
                          prefix={<DollarOutlined />}
                          precision={2}
                        />
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card size="small">
                        <Statistic
                          title="最终资金"
                          value={selectedBacktestResult.final_capital || 0}
                          prefix={<DollarOutlined />}
                          precision={2}
                          valueStyle={{
                            color: (selectedBacktestResult.final_capital || 0) >= selectedBacktestResult.initial_capital
                              ? '#f5222d'
                              : '#52c41a',
                          }}
                        />
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card size="small">
                        <Statistic
                          title="总收益率"
                          value={(selectedBacktestResult.total_return || 0) * 100}
                          suffix="%"
                          precision={2}
                          valueStyle={{
                            color: (selectedBacktestResult.total_return || 0) >= 0 ? '#f5222d' : '#52c41a',
                          }}
                          prefix={(selectedBacktestResult.total_return || 0) >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                        />
                      </Card>
                    </Col>
                  </Row>

                  <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="年化收益"
                          value={(selectedBacktestResult.annual_return || 0) * 100}
                          suffix="%"
                          precision={2}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="最大回撤"
                          value={(selectedBacktestResult.max_drawdown || 0) * 100}
                          suffix="%"
                          precision={2}
                          valueStyle={{ color: '#f5222d' }}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="夏普比率"
                          value={selectedBacktestResult.sharpe_ratio || 0}
                          precision={2}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="索提诺比率"
                          value={selectedBacktestResult.sortino_ratio || 0}
                          precision={2}
                        />
                      </Card>
                    </Col>
                  </Row>

                  <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="交易次数"
                          value={selectedBacktestResult.trades_count || 0}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="胜率"
                          value={(selectedBacktestResult.win_rate || 0) * 100}
                          suffix="%"
                          precision={1}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="盈亏比"
                          value={selectedBacktestResult.profit_factor || 0}
                          precision={2}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="卡尔玛比率"
                          value={selectedBacktestResult.calmar_ratio || 0}
                          precision={2}
                        />
                      </Card>
                    </Col>
                  </Row>
                </>
              ),
            },
            {
              key: 'trades',
              label: '交易记录',
              children: selectedBacktestResult.trades && selectedBacktestResult.trades.length > 0 ? (
                <List
                  size="small"
                  dataSource={selectedBacktestResult.trades}
                  renderItem={(trade: any) => (
                    <List.Item>
                      <Space>
                        <Tag color={trade.type === 'buy' ? 'red' : 'green'}>
                          {trade.type === 'buy' ? '买入' : '卖出'}
                        </Tag>
                        <span>{trade.date}</span>
                        <span>价格: {trade.price?.toFixed(2)}</span>
                        <span>数量: {trade.shares}</span>
                        <span>金额: {trade.amount?.toFixed(2)}</span>
                        {trade.pnl !== undefined && (
                          <span style={{ color: trade.pnl >= 0 ? '#f5222d' : '#52c41a' }}>
                            盈亏: {trade.pnl >= 0 ? '+' : ''}{trade.pnl?.toFixed(2)}
                          </span>
                        )}
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="暂无交易记录" />
              ),
            },
            {
              key: 'equity',
              label: '图表分析',
              children: selectedBacktestResult.equity_curve && selectedBacktestResult.equity_curve.length > 0 ? (
                <EquityCharts equityCurve={selectedBacktestResult.equity_curve} initialCapital={selectedBacktestResult.initial_capital} />
              ) : (
                <Empty description="暂无权益曲线数据" />
              ),
            },
          ]} />
          </Spin>
        )}
      </Modal>

      {trainingEffect && (
        <TrainingCompleteEffect
          status={trainingEffect}
          autoCloseMs={3500}
          onClose={() => setTrainingEffect(null)}
        />
      )}
    </div>
  )
}

export default TrainingPredict
