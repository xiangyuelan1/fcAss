import React, { useEffect, useState, useCallback, useRef, Component } from 'react'
import {
  Tabs,
  Card,
  Table,
  Button,
  Space,
  message,
  Modal,
  Input,
  Select,
  Tag,
  Row,
  Col,
  List,
  Popconfirm,
  Empty,
  Spin,
  Tooltip,
  Descriptions,
  Collapse,
  InputNumber,
  Statistic,
  Alert,
  Skeleton,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderOutlined,
  StarOutlined,
  ArrowLeftOutlined,
  CloudSyncOutlined,
  SearchOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  StockOutlined,
  ToolOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  BulbOutlined,
  RobotOutlined,
  HeartOutlined,
  ShareAltOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { watchlistApi, dataApi, featureApi } from '@/services/api'
import { Indicator, Stock, CustomIndicator } from '@/types'
import { useMobileGestures } from '@/hooks/useMobileGestures'

const { Option, OptGroup } = Select

class WatchlistErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  state = { hasError: false, error: null }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🐂</div>
          <h3>自选股页面出了点问题</h3>
          <p style={{ color: '#999', margin: '8px 0 16px' }}>牛牛正在修复中，请稍后再试</p>
          <Button type="primary" onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}>
            刷新页面
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

const EXCHANGE_OPTIONS = [
  { value: '', label: '全部交易所' },
  { value: 'SH', label: '沪市' },
  { value: 'SZ', label: '深市' },
  { value: 'BJ', label: '北交所' },
]

const EXCHANGE_COLOR_MAP: Record<string, string> = { SH: 'blue', SZ: 'green', BJ: 'orange' }

const INDICATOR_TIPS: Record<string, { tip: string; useCase: string }> = {
  sma: { tip: '最基础的趋势指标，价格在均线上方为多头趋势', useCase: '判断趋势方向、支撑阻力位' },
  ema: { tip: '比SMA更灵敏，对近期价格赋予更高权重', useCase: '短期趋势跟踪、与SMA交叉判断买卖点' },
  macd: { tip: '趋势+动量双重指标，金叉看多死叉看空', useCase: '判断趋势转折点、动量强弱' },
  rsi: { tip: '>70超买可能回调，<30超卖可能反弹', useCase: '判断超买超卖、寻找反转信号' },
  kdj: { tip: 'K线上穿D线为金叉(买)，下穿为死叉(卖)', useCase: '短线买卖信号、震荡市效果好' },
  cci: { tip: '>100为超买区，<-100为超卖区', useCase: '判断价格偏离程度、寻找极端行情' },
  boll: { tip: '价格触及上轨压力大，触及下轨支撑强', useCase: '判断波动区间、突破信号' },
  atr: { tip: '数值越大波动越剧烈，适合设置止损位', useCase: '衡量波动性、设置止损止盈' },
  volume_sma: { tip: '量价配合：放量上涨看多，缩量下跌看空', useCase: '确认趋势有效性、发现异动' },
  obv: { tip: 'OBV上升+价格上升=健康上涨', useCase: '量能趋势、价格-量背离预警' },
  returns: { tip: '直接反映涨跌幅度，是最基础的价格特征', useCase: '衡量收益、计算波动率' },
  volatility: { tip: '高波动=高风险高收益，低波动=稳定', useCase: '风险评估、仓位管理' },
}

const CATEGORY_GUIDE: Record<string, { desc: string; color: string; recommendation: string }> = {
  '趋势': { desc: '判断股价运动方向，是最核心的指标类型', color: 'blue', recommendation: '必选1~2个' },
  '震荡': { desc: '判断超买超卖状态，适合寻找反转时机', color: 'orange', recommendation: '建议选1个' },
  '波动': { desc: '衡量价格波动幅度，辅助风险判断', color: 'purple', recommendation: '可选1个' },
  '成交量': { desc: '验证价格趋势的可靠性，量价配合更准确', color: 'green', recommendation: '建议选1个' },
  '价格': { desc: '直接从价格计算的基础特征', color: 'red', recommendation: '可选' },
}

interface PoolStock {
  code: string
  name: string
  exchange: string
  industry: string | null
}

interface PriceRow {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  change_pct: number | null
}

const WatchlistPage: React.FC = () => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('watchlist')

  const [watchlists, setWatchlists] = useState<any[]>([])
  const [wlLoading, setWlLoading] = useState(false)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [detailId, setDetailId] = useState<number | null>(null)
  const [detailName, setDetailName] = useState('')
  const [detailStocks, setDetailStocks] = useState<any[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)

  const [autoPoolItems, setAutoPoolItems] = useState<any[]>([])
  const [autoPoolLoading, setAutoPoolLoading] = useState(false)
  const [autoPoolSearchKeyword, setAutoPoolSearchKeyword] = useState('')
  const [autoPoolSearchResults, setAutoPoolSearchResults] = useState<any[]>([])
  const [autoPoolSearching, setAutoPoolSearching] = useState(false)

  const [poolStocks, setPoolStocks] = useState<PoolStock[]>([])
  const [poolLoading, setPoolLoading] = useState(false)
  const [poolTotal, setPoolTotal] = useState(0)
  const [poolPage, setPoolPage] = useState(1)
  const [poolPageSize, setPoolPageSize] = useState(20)
  const [poolKeyword, setPoolKeyword] = useState('')
  const [poolIndustry, setPoolIndustry] = useState<string | undefined>(undefined)
  const [poolExchange, setPoolExchange] = useState<string>('')
  const [industries, setIndustries] = useState<string[]>([])
  const [industriesLoading, setIndustriesLoading] = useState(false)
  const [poolSearchResults, setPoolSearchResults] = useState<PoolStock[]>([])
  const [poolSearching, setPoolSearching] = useState(false)
  const [poolSyncing, setPoolSyncing] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailStock, setDetailStock] = useState<PoolStock | null>(null)
  const [detailPrices, setDetailPrices] = useState<PriceRow[]>([])
  const [detailPriceLoading, setDetailPriceLoading] = useState(false)
  const [addWatchlistVisible, setAddWatchlistVisible] = useState(false)
  const [addingStock, setAddingStock] = useState<PoolStock | null>(null)

  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [feStocks, setFeStocks] = useState<Stock[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedStock, setSelectedStock] = useState<string>()
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([])
  const [indicatorParams, setIndicatorParams] = useState<Record<string, Record<string, any>>>({})
  const [previewData, setPreviewData] = useState<any[]>([])
  const [previewColumns, setPreviewColumns] = useState<any[]>([])
  const [previewStats, setPreviewStats] = useState<Record<string, any>>({})
  const [previewDateRange, setPreviewDateRange] = useState<{ start: string; end: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const [customIndicators, setCustomIndicators] = useState<CustomIndicator[]>([])
  const [createIndicatorVisible, setCreateIndicatorVisible] = useState(false)
  const [newIndicator, setNewIndicator] = useState({
    name: '',
    formula: '',
    description: '',
    category: '自定义',
  })

  const hasAutoExpanded = useRef(false)
  const [initialLoading, setInitialLoading] = useState(true)

  const gestures = useMobileGestures({
    onPullDown: () => fetchWatchlists(),
    onSwipeLeft: () => {
      const tabs = ['watchlist', 'stockPool', 'featureEngineering']
      const idx = tabs.indexOf(activeTab)
      if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1])
    },
    onSwipeRight: () => {
      const tabs = ['watchlist', 'stockPool', 'featureEngineering']
      const idx = tabs.indexOf(activeTab)
      if (idx > 0) setActiveTab(tabs[idx - 1])
    },
  })

  const fetchWatchlists = useCallback(async () => {
    setWlLoading(true)
    try {
      const data: any = await watchlistApi.getWatchlists()
      const safeData = Array.isArray(data) ? data : (data?.items || [])
      setWatchlists(safeData)
      if (safeData.length > 0 && !hasAutoExpanded.current) {
        hasAutoExpanded.current = true
        const first = safeData[0]
        setDetailId(first.id)
        setDetailName(first.name)
        setDetailLoading(true)
        try {
          const stockData: any = await watchlistApi.getStocks(first.id)
          setDetailStocks(Array.isArray(stockData) ? stockData : (stockData?.items || []))
        } catch {
          // 首次自动展开获取股票列表失败时静默处理，不影响主流程
        } finally {
          setDetailLoading(false)
        }
      }
    } catch {
      message.error('获取自选表列表失败')
    } finally {
      setWlLoading(false)
    }
  }, [])

  const fetchAutoPredictPool = useCallback(async () => {
    setAutoPoolLoading(true)
    try {
      const data: any = await dataApi.getAutoPredictPool()
      const safeItems = Array.isArray(data) ? data : (data?.items || [])
      setAutoPoolItems(safeItems)
    } catch {
      message.error('获取自动预测池失败')
    } finally {
      setAutoPoolLoading(false)
    }
  }, [])

  const fetchIndustries = useCallback(async () => {
    setIndustriesLoading(true)
    try {
      const data: any = await dataApi.getIndustries()
      const list: string[] = Array.isArray(data) ? data : (data.industries || [])
      setIndustries(list.filter(Boolean))
    } catch {
      setIndustries([])
    } finally {
      setIndustriesLoading(false)
    }
  }, [])

  const fetchStockPool = useCallback(async () => {
    if (poolKeyword.trim()) return
    setPoolLoading(true)
    try {
      const params: any = { page: poolPage, page_size: poolPageSize }
      if (poolIndustry) params.industry = poolIndustry
      if (poolExchange) params.exchange = poolExchange
      const data: any = await dataApi.getStockPool(params)
      const safeStocks = Array.isArray(data?.stocks) ? data.stocks : []
      setPoolStocks(safeStocks)
      setPoolTotal(data?.total || 0)
    } catch {
      message.error('获取股票池失败')
    } finally {
      setPoolLoading(false)
    }
  }, [poolKeyword, poolPage, poolPageSize, poolIndustry, poolExchange])

  const fetchFeStocks = useCallback(async () => {
    try {
      const data: any = await dataApi.getStocks()
      setFeStocks(Array.isArray(data) ? data.slice(0, 100) : [])
    } catch {
      message.error('获取股票列表失败')
    }
  }, [])

  const fetchIndicators = useCallback(async () => {
    try {
      const data: any = await featureApi.getIndicators()
      setIndicators(Array.isArray(data) ? data : (data?.items || []))
    } catch {
      message.error('获取指标列表失败')
    }
  }, [])

  const fetchCategories = useCallback(async () => {
    try {
      const data: any = await featureApi.getCategories()
      setCategories(data.categories || [])
    } catch {
      setCategories([])
    }
  }, [])

  const fetchCustomIndicators = useCallback(async () => {
    try {
      const data: any = await featureApi.getCustomIndicators()
      setCustomIndicators(Array.isArray(data) ? data : (data?.items || []))
    } catch {
      message.error('获取自定义指标失败')
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchWatchlists(), fetchAutoPredictPool()])
      setInitialLoading(false)
    }
    init()
  }, [fetchWatchlists, fetchAutoPredictPool])

  useEffect(() => {
    if (activeTab === 'stockPool') {
      fetchIndustries()
      fetchStockPool()
    }
  }, [activeTab, fetchIndustries, fetchStockPool])

  useEffect(() => {
    if (activeTab === 'featureEngineering') {
      fetchIndicators()
      fetchFeStocks()
      fetchCategories()
      fetchCustomIndicators()
    }
  }, [activeTab, fetchIndicators, fetchFeStocks, fetchCategories, fetchCustomIndicators])

  const handleCreateWatchlist = async () => {
    if (!createName.trim()) {
      message.error('请输入自选表名称')
      return
    }
    try {
      await watchlistApi.createWatchlist({
        name: createName.trim(),
        description: createDesc.trim() || undefined,
      })
      message.success('自选表创建成功')
      setCreateModalVisible(false)
      setCreateName('')
      setCreateDesc('')
      fetchWatchlists()
    } catch {
      message.error('创建失败')
    }
  }

  const handleUpdateWatchlist = async () => {
    if (!editId || !editName.trim()) return
    try {
      await watchlistApi.updateWatchlist(editId, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
      })
      message.success('更新成功')
      setEditModalVisible(false)
      fetchWatchlists()
      if (detailId === editId) setDetailName(editName.trim())
    } catch {
      message.error('更新失败')
    }
  }

  const handleDeleteWatchlist = async (id: number) => {
    try {
      await watchlistApi.deleteWatchlist(id)
      message.success('已删除')
      if (detailId === id) {
        setDetailId(null)
        setDetailStocks([])
      }
      fetchWatchlists()
    } catch {
      message.error('删除失败')
    }
  }

  const handleViewDetail = async (wl: any) => {
    setDetailId(wl.id)
    setDetailName(wl.name)
    setDetailLoading(true)
    try {
      const data: any = await watchlistApi.getStocks(wl.id)
      setDetailStocks(Array.isArray(data) ? data : (data?.items || []))
    } catch {
      message.error('获取股票列表失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleRemoveStock = async (stockCode: string) => {
    if (!detailId) return
    try {
      await watchlistApi.removeStock(detailId, stockCode)
      message.success('已移除')
      const data: any = await watchlistApi.getStocks(detailId)
      setDetailStocks(Array.isArray(data) ? data : (data?.items || []))
      fetchWatchlists()
    } catch {
      message.error('移除失败')
    }
  }

  const handleSearchStock = async (keyword: string) => {
    setSearchKeyword(keyword)
    if (!keyword.trim()) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      const data: any = await dataApi.searchStockPool(keyword.trim())
      setSearchResults(data)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const handleAddStock = async (code: string, name: string) => {
    if (!detailId) return
    try {
      await watchlistApi.addStock(detailId, { stock_code: code, stock_name: name })
      message.success(`已添加 ${name}`)
      const data: any = await watchlistApi.getStocks(detailId)
      setDetailStocks(Array.isArray(data) ? data : (data?.items || []))
      fetchWatchlists()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (detail) message.warning(detail)
      else message.error('添加失败')
    }
  }

  const handleAutoPoolSearch = async (keyword: string) => {
    setAutoPoolSearchKeyword(keyword)
    if (!keyword.trim()) {
      setAutoPoolSearchResults([])
      return
    }
    setAutoPoolSearching(true)
    try {
      const data: any = await dataApi.searchStockPool(keyword.trim())
      setAutoPoolSearchResults(data)
    } catch {
      setAutoPoolSearchResults([])
    } finally {
      setAutoPoolSearching(false)
    }
  }

  const handleAddToAutoPool = async (code: string, name: string) => {
    try {
      await dataApi.addToAutoPredictPool(code, name)
      message.success(`已添加 ${name} 到自动预测池`)
      setAutoPoolSearchKeyword('')
      setAutoPoolSearchResults([])
      fetchAutoPredictPool()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (detail) message.warning(detail)
      else message.error('添加失败')
    }
  }

  const handleRemoveFromAutoPool = async (stockCode: string) => {
    try {
      await dataApi.removeFromAutoPredictPool(stockCode)
      message.success('已从自动预测池移除')
      fetchAutoPredictPool()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      message.error(detail || '移除失败')
    }
  }

  const handlePoolSearch = async (value: string) => {
    const kw = value.trim()
    setPoolKeyword(kw)
    if (!kw) {
      setPoolSearchResults([])
      setPoolPage(1)
      return
    }
    setPoolSearching(true)
    try {
      const data: any = await dataApi.searchStockPool(kw)
      setPoolSearchResults(Array.isArray(data) ? data : [])
    } catch {
      setPoolSearchResults([])
    } finally {
      setPoolSearching(false)
    }
  }

  const handlePoolViewDetail = async (stock: PoolStock) => {
    setDetailStock(stock)
    setDetailVisible(true)
    setDetailPriceLoading(true)
    setDetailPrices([])
    try {
      const data: any = await dataApi.getStockPrices(stock.code, { limit: 10 })
      setDetailPrices(Array.isArray(data) ? data : (data.items || []))
    } catch {
      setDetailPrices([])
    } finally {
      setDetailPriceLoading(false)
    }
  }

  const handleAddToWatchlist = (stock: PoolStock) => {
    if (watchlists.length === 0) {
      message.warning('暂无自选表，请先创建自选表')
      return
    }
    setAddingStock(stock)
    setAddWatchlistVisible(true)
  }

  const handleConfirmAddToWatchlist = async (watchlistId: number) => {
    if (!addingStock) return
    try {
      await watchlistApi.addStock(watchlistId, {
        stock_code: addingStock.code,
        stock_name: addingStock.name,
      })
      message.success(`已将 ${addingStock.name} 添加到自选表`)
      setAddWatchlistVisible(false)
      setAddingStock(null)
      fetchWatchlists()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (detail) message.warning(detail)
      else message.error('添加失败')
    }
  }

  const handlePredict = (code: string) => {
    navigate(`/prediction?stock_code=${code}`)
  }

  const handleSyncPool = async () => {
    setPoolSyncing(true)
    try {
      const res: any = await dataApi.syncStockPool()
      message.success(res.message || '同步完成')
      fetchStockPool()
      fetchIndustries()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      message.error(detail || '同步失败')
    } finally {
      setPoolSyncing(false)
    }
  }

  const handleIndicatorChange = (values: string[]) => {
    setSelectedIndicators(values)
    const newParams = { ...indicatorParams }
    values.forEach((key) => {
      const indicator = indicators.find((i) => i.key === key)
      if (indicator && !newParams[key]) {
        newParams[key] = {}
        indicator.params.forEach((param) => {
          newParams[key][param.name] = param.default
        })
      }
    })
    Object.keys(newParams).forEach((key) => {
      if (!values.includes(key)) delete newParams[key]
    })
    setIndicatorParams(newParams)
  }

  const handleParamChange = (indicatorKey: string, paramName: string, value: any) => {
    setIndicatorParams((prev) => ({
      ...prev,
      [indicatorKey]: {
        ...prev[indicatorKey],
        [paramName]: value,
      },
    }))
  }

  const handlePreview = async () => {
    if (!selectedStock) {
      message.warning('请先选择一只股票')
      return
    }
    if (selectedIndicators.length === 0) {
      message.warning('请至少选择一个指标')
      return
    }
    setPreviewLoading(true)
    try {
      const result: any = await featureApi.previewFeatures({
        stock_code: selectedStock,
        indicators: selectedIndicators,
        indicator_params: indicatorParams,
        limit: 50,
      })
      if (result.success && result.preview) {
        setPreviewData(result.preview.data)
        setPreviewStats(result.preview.stats || {})
        setPreviewDateRange(result.preview.date_range || null)
        const columns = result.preview.columns.map((col: string) => ({
          title: col,
          dataIndex: col,
          key: col,
          width: 120,
          render: (val: any) => {
            if (typeof val === 'number') return val.toFixed(4)
            return val ?? '-'
          },
        }))
        setPreviewColumns(columns)
        message.success('特征预览加载成功')
      } else {
        message.error(result.message || '预览失败')
      }
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message
      message.error(typeof detail === 'string' ? detail : '预览失败，请检查股票是否有数据')
    } finally {
      setPreviewLoading(false)
    }
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      '趋势': 'blue',
      '震荡': 'orange',
      '波动': 'purple',
      '成交量': 'green',
      '价格': 'red',
      '自定义': 'purple',
    }
    return colors[category] || 'default'
  }

  const handleCreateIndicator = async () => {
    if (!newIndicator.name.trim()) {
      message.error('请输入指标名称')
      return
    }
    if (!newIndicator.formula.trim()) {
      message.error('请输入计算公式')
      return
    }
    try {
      await featureApi.createCustomIndicator(newIndicator)
      message.success('自定义指标创建成功')
      setCreateIndicatorVisible(false)
      setNewIndicator({ name: '', formula: '', description: '', category: '自定义' })
      fetchCustomIndicators()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      message.error(typeof detail === 'string' ? detail : '创建失败')
    }
  }

  const handleUseCustomIndicator = (item: CustomIndicator) => {
    if (!selectedIndicators.includes(item.key)) {
      const newSelected = [...selectedIndicators, item.key]
      setSelectedIndicators(newSelected)
      message.success(`已添加自定义指标: ${item.name}`)
    } else {
      message.info('该指标已在选择列表中')
    }
  }

  const handlePublishIndicator = async (id: number) => {
    try {
      await featureApi.publishCustomIndicator(id)
      message.success('指标已发布到社区')
      fetchCustomIndicators()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      message.error(typeof detail === 'string' ? detail : '发布失败')
    }
  }

  const handleLikeIndicator = async (id: number) => {
    try {
      await featureApi.likeCustomIndicator(id)
      fetchCustomIndicators()
    } catch {
      message.error('点赞失败')
    }
  }

  const handleDeleteIndicator = async (id: number) => {
    try {
      await featureApi.deleteCustomIndicator(id)
      message.success('指标已删除')
      fetchCustomIndicators()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      message.error(typeof detail === 'string' ? detail : '删除失败')
    }
  }

  const getSelectedCategories = () => {
    const cats = new Set<string>()
    selectedIndicators.forEach((key) => {
      const ind = indicators.find((i) => i.key === key)
      if (ind) cats.add(ind.category)
    })
    return Array.from(cats)
  }

  const poolColumns = [
    {
      title: '股票代码',
      dataIndex: 'code',
      key: 'code',
      width: 110,
      render: (code: string) => <strong>{code}</strong>,
    },
    {
      title: '股票名称',
      dataIndex: 'name',
      key: 'name',
      width: 140,
    },
    {
      title: '交易所',
      dataIndex: 'exchange',
      key: 'exchange',
      width: 90,
      render: (exchange: string) => (
        <Tag color={EXCHANGE_COLOR_MAP[exchange] || 'default'}>{exchange || '-'}</Tag>
      ),
    },
    {
      title: '行业',
      dataIndex: 'industry',
      key: 'industry',
      width: 120,
      render: (industry: string | null) => industry ? <Tag>{industry}</Tag> : <Tag>未知</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_: any, record: PoolStock) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handlePoolViewDetail(record)}>查看</Button>
          </Tooltip>
          <Tooltip title="添加到自选">
            <Button type="text" size="small" icon={<StarOutlined />} onClick={() => handleAddToWatchlist(record)}>自选</Button>
          </Tooltip>
          <Tooltip title="用于预测">
            <Button type="text" size="small" icon={<ThunderboltOutlined />} onClick={() => handlePredict(record.code)}>预测</Button>
          </Tooltip>
        </Space>
      ),
    },
  ]

  const priceColumns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    { title: '开盘', dataIndex: 'open', key: 'open', width: 80, render: (v: number) => v?.toFixed(2) ?? '-' },
    { title: '最高', dataIndex: 'high', key: 'high', width: 80, render: (v: number) => v?.toFixed(2) ?? '-' },
    { title: '最低', dataIndex: 'low', key: 'low', width: 80, render: (v: number) => v?.toFixed(2) ?? '-' },
    { title: '收盘', dataIndex: 'close', key: 'close', width: 80, render: (v: number) => v?.toFixed(2) ?? '-' },
    {
      title: '涨跌幅',
      dataIndex: 'change_pct',
      key: 'change_pct',
      width: 90,
      render: (v: number | null) => {
        if (v == null) return '-'
        const color = v > 0 ? '#f5222d' : v < 0 ? '#52c41a' : '#999'
        return <span style={{ color }}>{v > 0 ? '+' : ''}{v.toFixed(2)}%</span>
      },
    },
  ]

  const selectedStockInfo = feStocks.find((s) => s.code === selectedStock)
  const groupedIndicators = categories.map((category) => ({
    category,
    indicators: indicators.filter((i) => i.category === category),
  }))

  const isPoolSearchMode = poolKeyword.trim().length > 0
  const poolDisplayData = isPoolSearchMode ? poolSearchResults : poolStocks

  const renderWatchlistTab = () => {
    if (detailId) {
      return renderWatchlistDetail()
    }

    return (
      <div>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            <Card
              title={
                <Space>
                  <FolderOutlined style={{ color: '#faad14' }} />
                  <span>我的自选表</span>
                </Space>
              }
              extra={
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
                  创建自选表
                </Button>
              }
            >
              <Spin spinning={wlLoading}>
                {wlLoading && watchlists.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
                    加载中...
                  </div>
                ) : watchlists.length === 0 ? (
                  <Empty description="暂无自选表" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
                      创建第一个自选表
                    </Button>
                  </Empty>
                ) : (
                  <Row gutter={[12, 12]}>
                    {watchlists.map((wl: any) => (
                      <Col xs={24} sm={12} md={8} key={wl.id}>
                        <Card
                          hoverable
                          size="small"
                          onClick={() => handleViewDetail(wl)}
                          style={{ height: '100%' }}
                          styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%' } }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                              <span style={{ fontSize: 15, fontWeight: 600 }}>
                                <FolderOutlined style={{ marginRight: 6, color: '#faad14' }} />
                                {wl.name}
                              </span>
                              <Popconfirm
                                title="确定删除？"
                                onConfirm={(e) => { e?.stopPropagation(); handleDeleteWatchlist(wl.id) }}
                                onCancel={(e) => e?.stopPropagation()}
                              >
                                <Button
                                  size="small"
                                  type="text"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </Popconfirm>
                            </div>
                            <div style={{ color: '#999', fontSize: 13, marginBottom: 8, lineHeight: 1.5 }}>
                              {wl.description || '暂无描述'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                            <Tag color="blue" icon={<StarOutlined />}>{wl.stock_count} 只股票</Tag>
                            <span style={{ fontSize: 11, color: '#bbb' }}>{wl.updated_at?.split(' ')[0] || ''}</span>
                          </div>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                )}
              </Spin>
            </Card>
          </Col>

          <Col xs={24} lg={8}>
            <Card
              title={
                <Space>
                  <RobotOutlined style={{ color: '#722ed1' }} />
                  <span>自动预测池</span>
                  <Tag color="purple">{autoPoolItems.length}/10</Tag>
                </Space>
              }
              size="small"
            >
              <Spin spinning={autoPoolLoading}>
                {autoPoolItems.length === 0 ? (
                  <Empty description="暂无股票，搜索添加" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <List
                    size="small"
                    dataSource={autoPoolItems}
                    renderItem={(item: any) => (
                      <List.Item
                        actions={[
                          <Popconfirm title="确定移除？" onConfirm={() => handleRemoveFromAutoPool(item.stock_code)}>
                            <Button size="small" danger icon={<DeleteOutlined />}>移除</Button>
                          </Popconfirm>,
                        ]}
                      >
                        <List.Item.Meta
                          title={<span><strong>{item.stock_code}</strong> - {item.stock_name}</span>}
                        />
                      </List.Item>
                    )}
                  />
                )}
              </Spin>

              <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                <Input.Search
                  placeholder="搜索股票添加到预测池"
                  value={autoPoolSearchKeyword}
                  onChange={(e) => handleAutoPoolSearch(e.target.value)}
                  onSearch={handleAutoPoolSearch}
                  loading={autoPoolSearching}
                  allowClear
                  enterButton
                />
                {autoPoolSearchResults.length > 0 && (
                  <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 8, border: '1px solid #f0f0f0', borderRadius: 6 }}>
                    {autoPoolSearchResults.map((stock: any) => {
                      const alreadyInPool = autoPoolItems.some((i: any) => i.stock_code === stock.code)
                      return (
                        <div
                          key={stock.code}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 10px',
                            background: alreadyInPool ? '#f6ffed' : 'transparent',
                            borderBottom: '1px solid #f5f5f5',
                          }}
                        >
                          <span>
                            <strong>{stock.code}</strong> - {stock.name}
                            {stock.exchange && <Tag color="blue" style={{ marginLeft: 6, fontSize: 11 }}>{stock.exchange}</Tag>}
                          </span>
                          {alreadyInPool ? (
                            <Tag color="green" style={{ fontSize: 11 }}>已添加</Tag>
                          ) : (
                            <Button size="small" type="link" onClick={() => handleAddToAutoPool(stock.code, stock.name)}>添加</Button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Card>
          </Col>
        </Row>

        <Modal
          title="创建自选表"
          open={createModalVisible}
          onOk={handleCreateWatchlist}
          onCancel={() => { setCreateModalVisible(false); setCreateName(''); setCreateDesc('') }}
          okText="创建"
        >
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
              名称 <span style={{ color: '#f5222d' }}>*</span>
            </label>
            <Input
              placeholder="例如：白酒龙头、科技成长"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              maxLength={100}
              showCount
            />
          </div>
          <div>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>描述</label>
            <Input.TextArea
              placeholder="描述这个自选表的用途（可选）"
              rows={3}
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              maxLength={500}
              showCount
            />
          </div>
        </Modal>
      </div>
    )
  }

  const renderWatchlistDetail = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Button
            type="link"
            icon={<ArrowLeftOutlined />}
            onClick={() => { setDetailId(null); setDetailStocks([]); setSearchKeyword(''); setSearchResults([]) }}
            style={{ padding: 0, marginRight: 12 }}
          >
            返回列表
          </Button>
          <span style={{ fontSize: 18, fontWeight: 600 }}>{detailName}</span>
        </div>
        <Space>
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              const wl = watchlists.find((w) => w.id === detailId)
              if (wl) {
                setEditId(wl.id)
                setEditName(wl.name)
                setEditDesc(wl.description || '')
                setEditModalVisible(true)
              }
            }}
          >
            编辑
          </Button>
          <Popconfirm title="确定删除此自选表？删除后不可恢复" onConfirm={() => handleDeleteWatchlist(detailId!)}>
            <Button danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      </div>

      <Card size="small" title="搜索添加股票" style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="输入股票代码或名称搜索"
          value={searchKeyword}
          onChange={(e) => handleSearchStock(e.target.value)}
          onSearch={handleSearchStock}
          loading={searching}
          allowClear
          enterButton
        />
        {searchResults.length > 0 && (
          <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 12, border: '1px solid #f0f0f0', borderRadius: 8 }}>
            {searchResults.map((stock: any) => {
              const alreadyAdded = detailStocks.some((s: any) => s.stock_code === stock.code)
              return (
                <div
                  key={stock.code}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: alreadyAdded ? '#f6ffed' : 'transparent',
                    borderBottom: '1px solid #f5f5f5',
                  }}
                >
                  <span>
                    <strong>{stock.code}</strong> - {stock.name}
                    {stock.exchange && <Tag color="blue" style={{ marginLeft: 8 }}>{stock.exchange}</Tag>}
                  </span>
                  {alreadyAdded ? (
                    <Tag color="green">已添加</Tag>
                  ) : (
                    <Button size="small" type="link" onClick={() => handleAddStock(stock.code, stock.name)}>添加</Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card size="small" title={`股票列表 (${detailStocks.length})`}>
        <Spin spinning={detailLoading}>
          {detailStocks.length === 0 ? (
            <Empty description="暂无股票，请通过搜索添加" />
          ) : (
            <List
              size="small"
              dataSource={detailStocks}
              renderItem={(item: any) => (
                <List.Item
                  actions={[
                    <Popconfirm title="确定移除此股票？" onConfirm={() => handleRemoveStock(item.stock_code)}>
                      <Button size="small" danger icon={<DeleteOutlined />}>移除</Button>
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    title={<span><strong>{item.stock_code}</strong> - {item.stock_name}</span>}
                    description={`添加时间: ${item.added_at || '未知'}`}
                  />
                </List.Item>
              )}
            />
          )}
        </Spin>
      </Card>

      <Modal
        title="编辑自选表"
        open={editModalVisible}
        onOk={handleUpdateWatchlist}
        onCancel={() => setEditModalVisible(false)}
        okText="保存"
      >
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>名称</label>
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
        </div>
        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>描述</label>
          <Input.TextArea rows={3} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
        </div>
      </Modal>
    </div>
  )

  const renderStockPoolTab = () => (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap size="middle">
          <Input.Search
            placeholder="输入股票代码或名称搜索"
            allowClear
            enterButton={<><SearchOutlined /> 搜索</>}
            style={{ width: 300 }}
            onSearch={handlePoolSearch}
            onChange={(e) => {
              if (!e.target.value.trim()) {
                setPoolKeyword('')
                setPoolSearchResults([])
              }
            }}
            loading={poolSearching}
          />
          <Select
            placeholder="筛选行业/板块"
            allowClear
            style={{ width: 200 }}
            loading={industriesLoading}
            value={poolIndustry}
            onChange={(value) => { setPoolIndustry(value); setPoolPage(1) }}
            showSearch
            filterOption={(input, option) =>
              (option?.value as string)?.toLowerCase().includes(input.toLowerCase())
            }
          >
            {Object.entries(
              industries.reduce((groups, ind) => {
                const key = ind.charAt(0)
                if (!groups[key]) groups[key] = []
                groups[key].push(ind)
                return groups
              }, {} as Record<string, string[]>)
            )
              .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
              .map(([key, items]) => (
                <OptGroup key={key} label={key}>
                  {items.map((ind) => (
                    <Option key={ind} value={ind}>{ind}</Option>
                  ))}
                </OptGroup>
              ))}
          </Select>
          <Select
            style={{ width: 140 }}
            value={poolExchange}
            onChange={(value) => { setPoolExchange(value); setPoolPage(1) }}
          >
            {EXCHANGE_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value}>{opt.label}</Option>
            ))}
          </Select>
          <Tooltip title="从akshare同步A股股票池数据">
            <Button icon={<CloudSyncOutlined />} onClick={handleSyncPool} loading={poolSyncing}>
              同步股票池
            </Button>
          </Tooltip>
        </Space>
      </Card>

      <Card title={isPoolSearchMode ? `搜索结果 (${poolSearchResults.length})` : `股票池 (共 ${poolTotal} 只)`}>
        <Table
          columns={poolColumns}
          dataSource={poolDisplayData}
          rowKey="code"
          loading={isPoolSearchMode ? poolSearching : poolLoading}
          pagination={isPoolSearchMode ? false : {
            current: poolPage,
            pageSize: poolPageSize,
            total: poolTotal,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 只`,
          }}
          onChange={(pagination) => { setPoolPage(pagination.current || 1); setPoolPageSize(pagination.pageSize || 20) }}
          size="middle"
          locale={{ emptyText: isPoolSearchMode ? '未找到匹配的股票' : '暂无股票数据，请先同步股票池' }}
          onRow={(record) => ({ onDoubleClick: () => handlePoolViewDetail(record), style: { cursor: 'pointer' } })}
        />
      </Card>

      <Modal
        title={detailStock ? `${detailStock.code} - ${detailStock.name}` : '股票详情'}
        open={detailVisible}
        onCancel={() => { setDetailVisible(false); setDetailStock(null); setDetailPrices([]) }}
        footer={[
          <Button key="watchlist" icon={<StarOutlined />} onClick={() => { if (detailStock) handleAddToWatchlist(detailStock) }}>
            添加到自选
          </Button>,
          <Button key="predict" type="primary" icon={<ThunderboltOutlined />} onClick={() => { if (detailStock) { setDetailVisible(false); handlePredict(detailStock.code) } }}>
            用于预测
          </Button>,
          <Button key="close" onClick={() => { setDetailVisible(false); setDetailStock(null); setDetailPrices([]) }}>
            关闭
          </Button>,
        ]}
        width={720}
      >
        {detailStock && (
          <>
            <Descriptions column={3} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="代码">{detailStock.code}</Descriptions.Item>
              <Descriptions.Item label="名称">{detailStock.name}</Descriptions.Item>
              <Descriptions.Item label="交易所">
                <Tag color={EXCHANGE_COLOR_MAP[detailStock.exchange] || 'default'}>{detailStock.exchange || '-'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="行业" span={3}>{detailStock.industry || '未知'}</Descriptions.Item>
            </Descriptions>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>
              <StockOutlined style={{ marginRight: 6 }} />
              最近价格数据
            </div>
            <Spin spinning={detailPriceLoading}>
              {detailPrices.length > 0 ? (
                <Table columns={priceColumns} dataSource={detailPrices} rowKey="date" size="small" pagination={false} />
              ) : (
                !detailPriceLoading && (
                  <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
                    暂无价格数据，请先在数据管理中获取该股票数据
                  </div>
                )
              )}
            </Spin>
          </>
        )}
      </Modal>

      <Modal
        title={`添加 ${addingStock?.name || ''} 到自选表`}
        open={addWatchlistVisible}
        onCancel={() => { setAddWatchlistVisible(false); setAddingStock(null) }}
        footer={null}
        width={400}
      >
        {watchlists.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
            暂无自选表，请先前往自选股管理创建
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {watchlists.map((wl) => (
              <Button
                key={wl.id}
                block
                onClick={() => handleConfirmAddToWatchlist(wl.id)}
                style={{ textAlign: 'left', height: 'auto', padding: '8px 16px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span>{wl.name}</span>
                  <Tag color="blue">{wl.stock_count} 只</Tag>
                </div>
              </Button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )

  const renderFeatureEngineeringTab = () => (
    <div>
      <Alert
        message="什么是特征工程？"
        description={
          <div>
            <p style={{ marginBottom: 8 }}>
              <strong>特征工程就是把原始股价数据转化为模型能理解的"线索"。</strong>
              就像医生看病需要量体温、测血压一样，模型预测涨跌也需要从价格数据中提取各种技术指标作为判断依据。
            </p>
            <p style={{ marginBottom: 4 }}>
              <BulbOutlined style={{ color: '#faad14', marginRight: 4 }} />
              <strong>使用建议：</strong>选择3~6个不同类型的指标（如1个趋势+1个震荡+1个成交量），让模型从多个角度分析，效果比单一指标好。
            </p>
          </div>
        }
        type="info"
        showIcon
        icon={<ToolOutlined />}
        style={{ marginBottom: 16 }}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <DatabaseOutlined />
                <span>选择股票</span>
              </Space>
            }
            size="small"
          >
            <Select
              placeholder="选择要分析的股票"
              style={{ width: '100%' }}
              value={selectedStock}
              onChange={setSelectedStock}
              showSearch
              optionFilterProp="children"
              size="large"
              options={feStocks.map((stock) => ({
                label: `${stock.code} - ${stock.name}`,
                value: stock.code,
              }))}
            />
            {selectedStockInfo && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                <Space split="·">
                  <span>{selectedStockInfo.exchange}</span>
                  <span>{selectedStockInfo.industry || '未知行业'}</span>
                  {selectedStockInfo.price_count != null && <span>{selectedStockInfo.price_count} 条数据</span>}
                </Space>
              </div>
            )}
            {feStocks.length === 0 && (
              <Alert message="暂无股票数据" description="请先到数据管理页面获取股票数据" type="warning" showIcon style={{ marginTop: 8 }} />
            )}
          </Card>

          <Card
            title={
              <Space>
                <ToolOutlined />
                <span>选择指标</span>
                {selectedIndicators.length > 0 && <Tag color="blue">{selectedIndicators.length}个已选</Tag>}
              </Space>
            }
            size="small"
            style={{ marginTop: 16 }}
          >
            {selectedIndicators.length > 0 && (
              <div style={{ marginBottom: 12, padding: 10, background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f' }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>已选指标：</div>
                <Space wrap size={4}>
                  {selectedIndicators.map((key) => {
                    const ind = indicators.find((i) => i.key === key)
                    return (
                      <Tag
                        key={key}
                        closable
                        onClose={() => handleIndicatorChange(selectedIndicators.filter((k) => k !== key))}
                        color={getCategoryColor(ind?.category || '')}
                      >
                        {ind?.name || key}
                      </Tag>
                    )
                  })}
                </Space>
                <div style={{ marginTop: 6, fontSize: 11, color: '#999' }}>
                  覆盖分类：{getSelectedCategories().join('、') || '无'}
                  {getSelectedCategories().length < 2 && selectedIndicators.length > 0 && (
                    <span style={{ color: '#faad14', marginLeft: 4 }}>（建议选2种以上类型）</span>
                  )}
                </div>
              </div>
            )}

            <Collapse
              size="small"
              defaultActiveKey={categories.slice(0, 2)}
              items={groupedIndicators.map(({ category, indicators: catIndicators }) => {
                const guide = CATEGORY_GUIDE[category] || { desc: '', color: 'default', recommendation: '' }
                const selectedInCat = catIndicators.filter((i) => selectedIndicators.includes(i.key)).length
                return {
                  key: category,
                  label: (
                    <Space>
                      <Tag color={guide.color}>{category}</Tag>
                      <span style={{ fontSize: 12 }}>{catIndicators.length}个</span>
                      {selectedInCat > 0 && <Tag color="blue" style={{ fontSize: 11 }}>已选{selectedInCat}</Tag>}
                      <Tooltip title={guide.recommendation}>
                        <InfoCircleOutlined style={{ color: '#1890ff', fontSize: 12 }} />
                      </Tooltip>
                    </Space>
                  ),
                  children: (
                    <div>
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 8, padding: '4px 8px', background: '#f5f5f5', borderRadius: 4 }}>
                        {guide.desc}
                      </div>
                      <Space direction="vertical" style={{ width: '100%' }} size={8}>
                        {catIndicators.map((indicator) => {
                          const isSelected = selectedIndicators.includes(indicator.key)
                          const tip = INDICATOR_TIPS[indicator.key]
                          return (
                            <div
                              key={indicator.key}
                              style={{
                                padding: 10,
                                border: isSelected ? '2px solid #1890ff' : '1px solid #f0f0f0',
                                borderRadius: 6,
                                background: isSelected ? '#e6f7ff' : '#fff',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                              }}
                              onClick={() => {
                                const newSelected = isSelected
                                  ? selectedIndicators.filter((k) => k !== indicator.key)
                                  : [...selectedIndicators, indicator.key]
                                handleIndicatorChange(newSelected)
                              }}
                            >
                              <Space>
                                {isSelected ? (
                                  <CheckCircleOutlined style={{ color: '#1890ff' }} />
                                ) : (
                                  <div style={{ width: 14, height: 14, border: '1px solid #d9d9d9', borderRadius: 2 }} />
                                )}
                                <strong style={{ fontSize: 14 }}>{indicator.name}</strong>
                                <Tag style={{ fontSize: 11 }}>{indicator.category}</Tag>
                              </Space>
                              <div style={{ fontSize: 12, color: '#666', marginTop: 4, marginLeft: 22 }}>
                                {indicator.description}
                              </div>
                              {tip && (
                                <div style={{ fontSize: 11, color: '#999', marginTop: 2, marginLeft: 22 }}>
                                  <BulbOutlined style={{ marginRight: 4, color: '#faad14' }} />
                                  {tip.tip}
                                </div>
                              )}
                              {isSelected && indicator.params.length > 0 && (
                                <div
                                  style={{ marginTop: 8, padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #e8e8e8' }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div style={{ fontSize: 11, marginBottom: 6, color: '#999' }}>参数调整：</div>
                                  <Space wrap size={8}>
                                    {indicator.params.map((param) => (
                                      <div key={param.name}>
                                        <span style={{ fontSize: 11, marginRight: 4, color: '#666' }}>{param.name}:</span>
                                        <InputNumber
                                          size="small"
                                          value={indicatorParams[indicator.key]?.[param.name] ?? param.default}
                                          min={param.min}
                                          max={param.max}
                                          step={param.step}
                                          onChange={(value) => handleParamChange(indicator.key, param.name, value)}
                                          style={{ width: 70 }}
                                        />
                                      </div>
                                    ))}
                                  </Space>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </Space>
                    </div>
                  ),
                }
              })}
            />
          </Card>

          <Card
            title={
              <Space>
                <ExperimentOutlined />
                <span>自定义指标</span>
              </Space>
            }
            size="small"
            style={{ marginTop: 16 }}
            extra={
              <Button size="small" icon={<PlusOutlined />} onClick={() => setCreateIndicatorVisible(true)}>
                创建指标
              </Button>
            }
          >
            {customIndicators.length === 0 ? (
              <Empty description="暂无自定义指标" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                <Button size="small" type="primary" onClick={() => setCreateIndicatorVisible(true)}>
                  创建第一个指标
                </Button>
              </Empty>
            ) : (
              <List
                size="small"
                dataSource={customIndicators}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button key="use" size="small" type="link" onClick={() => handleUseCustomIndicator(item)}>使用</Button>,
                      <Tooltip key="like" title="点赞">
                        <Button size="small" type="link" icon={<HeartOutlined />} onClick={() => handleLikeIndicator(item.id)}>
                          {item.likes_count}
                        </Button>
                      </Tooltip>,
                      !item.is_published && (
                        <Tooltip key="publish" title="发布到社区">
                          <Button size="small" type="link" icon={<ShareAltOutlined />} onClick={() => handlePublishIndicator(item.id)}>发布</Button>
                        </Tooltip>
                      ),
                      <Popconfirm key="delete" title="确定删除此指标？" onConfirm={() => handleDeleteIndicator(item.id)}>
                        <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                      </Popconfirm>,
                    ].filter(Boolean)}
                  >
                    <List.Item.Meta
                      title={
                        <span>
                          {item.name}
                          <Tag color={getCategoryColor(item.category)} style={{ marginLeft: 6 }}>{item.category}</Tag>
                          {item.is_published && <Tag color="green" style={{ marginLeft: 2 }}>已发布</Tag>}
                        </span>
                      }
                      description={item.description || item.formula}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>

          <Button
            type="primary"
            icon={<EyeOutlined />}
            onClick={handlePreview}
            loading={previewLoading}
            disabled={!selectedStock || selectedIndicators.length === 0}
            block
            size="large"
            style={{ marginTop: 16 }}
          >
            预览特征数据
          </Button>
        </Col>

        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <ExperimentOutlined />
                <span>特征预览</span>
              </Space>
            }
            extra={
              selectedIndicators.length > 0 && (
                <Space size={4} wrap>
                  {selectedIndicators.map((key) => {
                    const indicator = indicators.find((i) => i.key === key)
                    return (
                      <Tag key={key} color={getCategoryColor(indicator?.category || '')}>
                        {indicator?.name || key}
                      </Tag>
                    )
                  })}
                </Space>
              )
            }
          >
            {previewLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin size="large" />
                <div style={{ marginTop: 12, color: '#666' }}>正在计算特征数据...</div>
              </div>
            ) : previewData.length > 0 ? (
              <Table
                columns={previewColumns}
                dataSource={previewData}
                rowKey={(record) => record.date || Math.random()}
                pagination={{ pageSize: 10, size: 'small' }}
                scroll={{ x: 'max-content' }}
                size="small"
                bordered
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div>
                    <p>选择股票和指标后点击预览</p>
                    <p style={{ fontSize: 12, color: '#999' }}>
                      预览将展示所选指标的计算结果，帮助你了解特征数据的分布和含义
                    </p>
                  </div>
                }
              />
            )}
          </Card>

          {previewData.length > 0 && (
            <Card
              title={
                <Space>
                  <InfoCircleOutlined />
                  <span>数据概要</span>
                </Space>
              }
              size="small"
              style={{ marginTop: 16 }}
            >
              <Row gutter={[16, 16]}>
                <Col span={6}>
                  <Statistic title="数据条数" value={previewData.length} suffix="条" />
                </Col>
                <Col span={6}>
                  <Statistic title="特征数量" value={previewColumns.length - 1} suffix="个" />
                </Col>
                <Col span={6}>
                  <Statistic title="已选指标" value={selectedIndicators.length} suffix="个" />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="数据范围"
                    value={previewDateRange ? `${previewDateRange.start} ~ ${previewDateRange.end}` : selectedStock || '-'}
                    valueStyle={{ fontSize: 14 }}
                  />
                </Col>
              </Row>
              {Object.keys(previewStats).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>各特征统计：</div>
                  <Table
                    size="small"
                    pagination={false}
                    dataSource={Object.entries(previewStats).map(([col, stat]: [string, any]) => ({
                      key: col,
                      feature: col,
                      mean: stat.mean?.toFixed(4) ?? '-',
                      std: stat.std?.toFixed(4) ?? '-',
                      min: stat.min?.toFixed(4) ?? '-',
                      max: stat.max?.toFixed(4) ?? '-',
                      null_count: stat.null_count ?? 0,
                    }))}
                    columns={[
                      { title: '特征名', dataIndex: 'feature', key: 'feature', width: 140 },
                      { title: '均值', dataIndex: 'mean', key: 'mean', width: 100 },
                      { title: '标准差', dataIndex: 'std', key: 'std', width: 100 },
                      { title: '最小值', dataIndex: 'min', key: 'min', width: 100 },
                      { title: '最大值', dataIndex: 'max', key: 'max', width: 100 },
                      {
                        title: '缺失',
                        dataIndex: 'null_count',
                        key: 'null_count',
                        width: 70,
                        render: (v: number) => v > 0 ? <Tag color="warning">{v}</Tag> : <Tag color="success">0</Tag>,
                      },
                    ]}
                  />
                </div>
              )}
            </Card>
          )}

          {!previewData.length && (
            <Card
              title={
                <Space>
                  <BulbOutlined />
                  <span>如何使用特征工程？</span>
                </Space>
              }
              size="small"
              style={{ marginTop: 16 }}
            >
              <Descriptions column={1} size="small">
                <Descriptions.Item label="第1步">
                  <strong>选择股票</strong> — 选一只你想分析的股票（需要先在数据管理中获取数据）
                </Descriptions.Item>
                <Descriptions.Item label="第2步">
                  <strong>选择指标</strong> — 从不同分类中勾选3~6个技术指标，建议覆盖趋势+震荡+成交量
                </Descriptions.Item>
                <Descriptions.Item label="第3步">
                  <strong>点击预览</strong> — 查看指标计算结果，了解数据分布和特征含义
                </Descriptions.Item>
                <Descriptions.Item label="第4步">
                  <strong>创建模型</strong> — 在模型创建页面选择同样的指标，模型将使用这些特征进行训练
                </Descriptions.Item>
              </Descriptions>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  )

  if (initialLoading) {
    return (
      <div>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            <Card>
              <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 16 }} />
              <Row gutter={[12, 12]}>
                {[1, 2, 3].map((i) => (
                  <Col xs={24} sm={12} md={8} key={i}>
                    <Card size="small"><Skeleton active paragraph={{ rows: 2 }} /></Card>
                  </Col>
                ))}
              </Row>
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card size="small"><Skeleton active paragraph={{ rows: 4 }} /></Card>
          </Col>
        </Row>
      </div>
    )
  }

  return (
    <div {...gestures} style={{ minHeight: '100%' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>自选股</h1>
        <p className="page-description" style={{ marginBottom: 0 }}>
          管理自选股、浏览股票池、配置特征工程
        </p>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'watchlist',
            label: (
              <Space>
                <StarOutlined />
                自选股
              </Space>
            ),
            children: renderWatchlistTab(),
          },
          {
            key: 'stockPool',
            label: (
              <Space>
                <StockOutlined />
                股票池
              </Space>
            ),
            children: renderStockPoolTab(),
          },
          {
            key: 'featureEngineering',
            label: (
              <Space>
                <ToolOutlined />
                特征工程
              </Space>
            ),
            children: renderFeatureEngineeringTab(),
          },
        ]}
      />

      <Modal
        title="创建自定义指标"
        open={createIndicatorVisible}
        onOk={handleCreateIndicator}
        onCancel={() => setCreateIndicatorVisible(false)}
        okText="创建"
        width={600}
      >
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
            指标名称 <span style={{ color: '#f5222d' }}>*</span>
          </label>
          <Input
            placeholder="例如：量价背离度"
            value={newIndicator.name}
            onChange={(e) => setNewIndicator({ ...newIndicator, name: e.target.value })}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
            计算公式 <span style={{ color: '#f5222d' }}>*</span>
          </label>
          <Input.TextArea
            placeholder={"使用 Python 表达式，可用变量：close, open, high, low, volume, returns\n例如：(close - close.rolling(20).mean()) / close.rolling(20).std()"}
            rows={4}
            value={newIndicator.formula}
            onChange={(e) => setNewIndicator({ ...newIndicator, formula: e.target.value })}
          />
          <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
            可用变量：close, open, high, low, volume, returns, amount, change_pct
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>描述</label>
          <Input.TextArea
            placeholder="描述这个指标的含义和用途"
            rows={2}
            value={newIndicator.description}
            onChange={(e) => setNewIndicator({ ...newIndicator, description: e.target.value })}
          />
        </div>
        <div>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>分类</label>
          <Select
            value={newIndicator.category}
            onChange={(value) => setNewIndicator({ ...newIndicator, category: value })}
            style={{ width: '100%' }}
          >
            <Option value="自定义">自定义</Option>
            <Option value="趋势">趋势</Option>
            <Option value="震荡">震荡</Option>
            <Option value="波动">波动</Option>
            <Option value="成交量">成交量</Option>
            <Option value="价格">价格</Option>
          </Select>
        </div>
      </Modal>
    </div>
  )
}

export default function WatchlistPageWrapper() {
  return (
    <WatchlistErrorBoundary>
      <WatchlistPage />
    </WatchlistErrorBoundary>
  )
}
