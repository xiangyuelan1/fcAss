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
} from '@ant-design/icons'
import { Line } from '@ant-design/charts'
import { trainingApi, modelApi, backtestApi, predictionApi, dataApi } from '@/services/api'
import { TrainingTask, UserModel, BacktestResult, EquityPoint } from '@/types'
import { PredictionResult, PredictionAnimation, ConfidenceBar, deriveConfidence, labelToDirection } from '@/components/PredictionFun'
import { TrainingCompleteEffect } from '@/components/TrainingCompleteEffect'
import MascotBull from '@/components/MascotBull'
import dayjs from 'dayjs'

interface PredictionRecord {
  task_id: number
  stock_code: string
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
  const [historyRecords, setHistoryRecords] = useState<PredictionRecord[]>([])
  const [realtimeQuote, setRealtimeQuote] = useState<RealtimeQuote | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [sharingPrediction, setSharingPrediction] = useState(false)

  const [backtestResults, setBacktestResults] = useState<BacktestResult[]>([])
  const [backtestListLoading, setBacktestListLoading] = useState(false)
  const [selectedBacktestResult, setSelectedBacktestResult] = useState<BacktestResult | null>(null)
  const [backtestDetailModalVisible, setBacktestDetailModalVisible] = useState(false)
  const [backtestDetailLoading, setBacktestDetailLoading] = useState(false)

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
      setPredictableStocks(data.stocks || [])
      if (data.stocks?.length > 0 && !selectedStock) {
        setSelectedStock(data.stocks[0].code)
      }
    } catch (error) {
      message.error('获取可预测股票失败')
    }
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
    fetchLogs(task.id)
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
    }
    setHistoryRecords((prev) => [record, ...prev])
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
            const elapsed = getElapsedTime(record)
            const remaining = getEstimatedRemaining(percent, elapsed)
            const stageText = stageMap[progress.stage] || (progress.stage ? progress.stage : '处理中')
            const model = models[record.model_id]
            const isDeepLearning = model && ['lstm', 'gru'].includes(model.model_type.toLowerCase())
            return (
              <div style={{ marginTop: 8 }}>
                <Progress
                  percent={percent}
                  size="small"
                  style={{ width: 150 }}
                  status="active"
                />
                <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                  {stageText}
                  {' · '}
                  已用 {formatDuration(elapsed)}
                  {remaining !== null && remaining > 0 && (
                    <> · 预计剩余 {formatDuration(remaining)}</>
                  )}
                </div>
                {isDeepLearning && progress.epoch && (
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                    Epoch {progress.epoch}
                    {progress.total_epochs ? ` / ${progress.total_epochs}` : ''}
                    {progress.train_loss != null && ` | Loss: ${progress.train_loss.toFixed(4)}`}
                    {progress.val_loss != null && ` | Val Loss: ${progress.val_loss.toFixed(4)}`}
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

  const batchColumns = [
    {
      title: '股票代码',
      dataIndex: 'stock_code',
      key: 'stock_code',
      render: (code: string) => {
        const stock = predictableStocks.find((s) => s.code === code)
        return stock ? `${code} ${stock.name}` : code
      },
    },
    {
      title: '预测值',
      dataIndex: 'prediction',
      key: 'prediction',
      render: (val: number) => (val !== undefined ? val.toFixed(6) : '-'),
    },
    {
      title: '预测方向',
      dataIndex: 'prediction_label',
      key: 'prediction_label',
      render: (label: string) => {
        if (!label) return '-'
        const style = getLabelStyle(label)
        return (
          <Tag color={style.color === '#f5222d' ? 'red' : style.color === '#52c41a' ? 'green' : 'gold'} icon={style.icon}>
            {label}
          </Tag>
        )
      },
    },
    {
      title: '最新收盘价',
      dataIndex: 'latest_close',
      key: 'latest_close',
      render: (val: number) => (val ? `¥${val.toFixed(2)}` : '-'),
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: any) =>
        record.error ? (
          <Tag color="red">失败: {record.error}</Tag>
        ) : (
          <Tag color="green">成功</Tag>
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
    const renderTargetSpecificCards = (latest: PredictionRecord) => {
      const changePct = latest.predicted_change_pct
      const isUp = changePct !== null && changePct !== undefined && changePct > 0
      const isDown = changePct !== null && changePct !== undefined && changePct < 0
      const targetType = latest.target_type || selectedPredictModel?.target || 'next_day_return'

      if (targetType === 'next_day_direction') {
        return (
          <>
            <Col span={12}>
              <Card>
                <div style={{ marginBottom: 8, fontWeight: 500, color: '#666' }}>上涨概率</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, height: 16, borderRadius: 8, background: '#f0f0f0', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${(latest.probability_up ?? 0) * 100}%`,
                      borderRadius: 8,
                      background: '#f5222d',
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <span style={{ fontWeight: 700, color: '#f5222d', minWidth: 60, textAlign: 'right' }}>
                    {((latest.probability_up ?? 0) * 100).toFixed(1)}%
                  </span>
                </div>
              </Card>
            </Col>
            <Col span={12}>
              <Card>
                <div style={{ marginBottom: 8, fontWeight: 500, color: '#666' }}>下跌概率</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, height: 16, borderRadius: 8, background: '#f0f0f0', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${(latest.probability_down ?? 0) * 100}%`,
                      borderRadius: 8,
                      background: '#52c41a',
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <span style={{ fontWeight: 700, color: '#52c41a', minWidth: 60, textAlign: 'right' }}>
                    {((latest.probability_down ?? 0) * 100).toFixed(1)}%
                  </span>
                </div>
              </Card>
            </Col>
          </>
        )
      }

      if (targetType === 'price_change_5d') {
        return (
          <>
            <Col span={12}>
              <Card>
                <Statistic
                  title="5日累计变化"
                  value={changePct ?? 0}
                  precision={2}
                  suffix="%"
                  prefix={isUp ? <ArrowUpOutlined /> : isDown ? <ArrowDownOutlined /> : <MinusOutlined />}
                  valueStyle={isUp ? { color: '#f5222d' } : isDown ? { color: '#52c41a' } : { color: '#faad14' }}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card>
                <Statistic
                  title="日均变化率"
                  value={latest.daily_avg_change_pct ?? 0}
                  precision={4}
                  suffix="%"
                  valueStyle={isUp ? { color: '#f5222d' } : isDown ? { color: '#52c41a' } : { color: '#faad14' }}
                />
              </Card>
            </Col>
          </>
        )
      }

      if (targetType === 'multi_feature_next_day') {
        return (
          <>
            <Col span={8}>
              <Card>
                <Statistic
                  title="预测收益率"
                  value={changePct ?? 0}
                  precision={2}
                  suffix="%"
                  prefix={isUp ? <ArrowUpOutlined /> : isDown ? <ArrowDownOutlined /> : <MinusOutlined />}
                  valueStyle={isUp ? { color: '#f5222d' } : isDown ? { color: '#52c41a' } : { color: '#faad14' }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title="预测波动率"
                  value={latest.predicted_volatility ?? 0}
                  precision={6}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title="预测量变率"
                  value={latest.predicted_volume_change ?? 0}
                  precision={6}
                  valueStyle={{ color: '#722ed1' }}
                />
              </Card>
            </Col>
          </>
        )
      }

      return (
        <>
          <Col span={12}>
            <Card>
              <Statistic
                title="预测目标价格"
                value={latest.predicted_price ?? latest.latest_data?.close ?? 0}
                prefix="¥"
                precision={2}
                valueStyle={isUp ? { color: '#f5222d' } : isDown ? { color: '#52c41a' } : undefined}
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card>
              <Statistic
                title="预测涨跌幅"
                value={changePct ?? 0}
                precision={2}
                suffix="%"
                prefix={isUp ? <ArrowUpOutlined /> : isDown ? <ArrowDownOutlined /> : <MinusOutlined />}
                valueStyle={isUp ? { color: '#f5222d' } : isDown ? { color: '#52c41a' } : { color: '#faad14' }}
              />
            </Card>
          </Col>
        </>
      )
    }

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

        <Card title="选择模型和股票" style={{ marginBottom: 24 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>训练任务（已完成的模型）</div>
              <Select
                placeholder="选择已完成的训练任务"
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
            <Col xs={24} md={12}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>预测股票</div>
              <Select
                placeholder="选择或输入股票代码"
                value={selectedStock}
                onChange={setSelectedStock}
                style={{ width: '100%' }}
                showSearch
                allowClear
                filterOption={(input, option) =>
                  (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
                }
                popupRender={(menu) => (
                  <>
                    {menu}
                    <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0', color: '#999', fontSize: 12 }}>
                      可输入任意A股代码进行预测（如 000858），不仅限于训练股票
                    </div>
                  </>
                )}
              >
                {predictableStocks.map((stock) => (
                  <Select.Option key={stock.code} value={stock.code}>
                    {stock.code} - {stock.name}
                  </Select.Option>
                ))}
              </Select>
            </Col>
          </Row>

          {selectedPredictModel && (
            <Descriptions size="small" bordered column={3} style={{ marginTop: 16 }}>
              <Descriptions.Item label="模型类型">{selectedPredictModel.model_type.toUpperCase()}</Descriptions.Item>
              <Descriptions.Item label="预测目标">
                {selectedPredictModel.target === 'next_day_return' ? '次日收益率' :
                 selectedPredictModel.target === 'next_day_direction' ? '次日涨跌方向' :
                 selectedPredictModel.target === 'price_change_5d' ? '5日价格变化' :
                 selectedPredictModel.target === 'multi_feature_next_day' ? '多维预测（收益率+波动率+量变率）' : selectedPredictModel.target}
              </Descriptions.Item>
              <Descriptions.Item label="特征数量">{selectedPredictModel.features?.length || 0}个指标</Descriptions.Item>
            </Descriptions>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={predicting}
              onClick={handlePredict}
              disabled={!selectedTaskId || !selectedStock}
              size="large"
            >
              开始预测
            </Button>
            <Button
              icon={<RobotOutlined />}
              loading={batchPredicting}
              onClick={handleBatchPredict}
              disabled={!selectedTaskId || predictableStocks.length === 0}
              size="large"
            >
              批量预测所有股票
            </Button>
          </div>
        </Card>

        {latestResult && (() => {
          const direction = labelToDirection(latestResult.prediction_label)
          const confidence = latestResult.confidence ?? deriveConfidence(latestResult.prediction)
          const stock = predictableStocks.find(s => s.code === latestResult.stock_code)
          const targetType = latestResult.target_type || selectedPredictModel?.target || 'next_day_return'
          const isTrainingStock = predictableStocks.some(s => s.code === latestResult.stock_code)
          const trainingStockNames = predictableStocks.map(s => `${s.code} ${s.name}`).join('、')

          return (
            <Card title="最新预测结果" style={{ marginBottom: 24 }}
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
                      direction={direction}
                      confidence={confidence}
                      stockName={stock?.name}
                      stockCode={latestResult.stock_code}
                      predictedPrice={latestResult.predicted_price}
                      predictedChangePct={latestResult.predicted_change_pct}
                      priceRangeLow={latestResult.price_range_low}
                      priceRangeHigh={latestResult.price_range_high}
                      predictedVolatility={latestResult.predicted_volatility}
                      predictedVolumeChange={latestResult.predicted_volume_change}
                      targetType={targetType}
                    />
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <Card>
                        <PredictionAnimation
                          direction={direction}
                          value={latestResult.prediction}
                          label={latestResult.prediction_label}
                        />
                      </Card>
                    </Col>
                    {renderTargetSpecificCards(latestResult)}
                    <Col span={12}>
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
                    <Col span={12}>
                      <Card>
                        <div style={{ marginBottom: 8, fontWeight: 500, color: '#666' }}>置信度</div>
                        <ConfidenceBar confidence={confidence} />
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

              {!isTrainingStock && (
                <Alert
                  style={{ marginTop: 16 }}
                  message="跨股票预测提示"
                  description={`此模型使用 ${trainingStockNames || '其他股票'} 数据训练，预测当前股票基于特征模式泛化，结果仅供参考。模型学习的是技术指标组合的特征模式，而非特定股票的规律。`}
                  type="info"
                  showIcon
                />
              )}

              {realtimeQuote && (
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
                  style={{ marginTop: 16 }}
                  size="small"
                >
                  <Row gutter={[16, 12]}>
                    <Col span={4}>
                      <Statistic
                        title="当前价"
                        value={realtimeQuote.price}
                        precision={2}
                        prefix="¥"
                        valueStyle={realtimeQuote.change_pct > 0 ? { color: '#f5222d' } : realtimeQuote.change_pct < 0 ? { color: '#52c41a' } : undefined}
                      />
                    </Col>
                    <Col span={4}>
                      <Statistic
                        title="涨跌幅"
                        value={realtimeQuote.change_pct}
                        precision={2}
                        suffix="%"
                        valueStyle={realtimeQuote.change_pct > 0 ? { color: '#f5222d' } : realtimeQuote.change_pct < 0 ? { color: '#52c41a' } : undefined}
                        prefix={realtimeQuote.change_pct > 0 ? <ArrowUpOutlined /> : realtimeQuote.change_pct < 0 ? <ArrowDownOutlined /> : undefined}
                      />
                    </Col>
                    <Col span={4}><Statistic title="开盘" value={realtimeQuote.open} precision={2} prefix="¥" /></Col>
                    <Col span={4}><Statistic title="最高" value={realtimeQuote.high} precision={2} prefix="¥" /></Col>
                    <Col span={4}><Statistic title="最低" value={realtimeQuote.low} precision={2} prefix="¥" /></Col>
                    <Col span={4}><Statistic title="昨收" value={realtimeQuote.pre_close} precision={2} prefix="¥" /></Col>
                  </Row>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                    行情时间: {realtimeQuote.time || '-'}
                  </div>
                </Card>
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
          )
        })()}

        {batchResults.length > 0 && (
          <Card title="批量预测结果" style={{ marginBottom: 24 }}>
            <Table
              columns={batchColumns}
              dataSource={batchResults}
              rowKey="stock_code"
              pagination={false}
              size="small"
            />
            <Alert
              style={{ marginTop: 16 }}
              message="以上预测结果仅供参考，不构成任何投资建议。股市有风险，投资需谨慎。"
              type="warning"
              showIcon
            />
          </Card>
        )}

        {historyRecords.length > 0 && (
          <Card
            title={`预测历史（共 ${historyRecords.length} 条）`}
            extra={
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setHistoryRecords([])}>
                清空
              </Button>
            }
            style={{ marginBottom: 24 }}
          >
            <Collapse
              items={Object.entries(groupedRecords).map(([stockCode, records]) => ({
                key: stockCode,
                label: (
                  <Space>
                    <span style={{ fontWeight: 600 }}>{stockCode}</span>
                    <Tag>{records.length} 条预测</Tag>
                    {records.length > 0 && (() => {
                      const latest = records[0]
                      const style = getLabelStyle(latest.prediction_label)
                      return (
                        <Tag color={style.color === '#f5222d' ? 'red' : style.color === '#52c41a' ? 'green' : 'gold'}>
                          最新: {latest.prediction_label}
                        </Tag>
                      )
                    })()}
                  </Space>
                ),
                children: (
                  <Table
                    size="small"
                    pagination={false}
                    dataSource={records}
                    rowKey="timestamp"
                    columns={[
                      {
                        title: '模型',
                        key: 'model',
                        render: (_: any, r: PredictionRecord) => (
                          <span>{r.model_name} <Tag>{r.model_type.toUpperCase()}</Tag></span>
                        ),
                      },
                      {
                        title: '预测方向',
                        dataIndex: 'prediction_label',
                        key: 'prediction_label',
                        render: (label: string) => {
                          const style = getLabelStyle(label)
                          return (
                            <Tag color={style.color === '#f5222d' ? 'red' : style.color === '#52c41a' ? 'green' : 'gold'} icon={style.icon}>
                              {label}
                            </Tag>
                          )
                        },
                      },
                      {
                        title: '预测值',
                        dataIndex: 'prediction',
                        key: 'prediction',
                        render: (val: number) => val.toFixed(6),
                      },
                      {
                        title: '收盘价',
                        key: 'close',
                        render: (_: any, r: PredictionRecord) =>
                          r.latest_data?.close ? `¥${r.latest_data.close.toFixed(2)}` : '-',
                      },
                      {
                        title: '预测时间',
                        key: 'time',
                        render: (_: any, r: PredictionRecord) => new Date(r.timestamp).toLocaleString(),
                      },
                      {
                        title: '操作',
                        key: 'action',
                        render: (_: any, r: PredictionRecord) => (
                          <Button
                            type="text"
                            size="small"
                            icon={<ShareAltOutlined />}
                            loading={sharingPrediction}
                            onClick={() => handleSharePrediction(r)}
                          >
                            发布
                          </Button>
                        ),
                      },
                    ]}
                  />
                ),
              }))}
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
        width={900}
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
                  <Descriptions bordered column={2}>
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
        width={600}
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
        width={1000}
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
