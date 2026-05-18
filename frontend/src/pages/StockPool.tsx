import React, { useEffect, useState, useCallback } from 'react'
import {
  Card,
  Table,
  Button,
  Space,
  message,
  Modal,
  Input,
  Select,
  Tag,
  Descriptions,
  Spin,
  Tooltip,
} from 'antd'
import {
  SearchOutlined,
  EyeOutlined,
  StarOutlined,
  ThunderboltOutlined,
  CloudSyncOutlined,
  StockOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { dataApi, watchlistApi } from '@/services/api'

const { Option } = Select

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

const EXCHANGE_OPTIONS = [
  { value: '', label: '全部交易所' },
  { value: 'SH', label: '沪市' },
  { value: 'SZ', label: '深市' },
  { value: 'BJ', label: '北交所' },
]

const EXCHANGE_COLOR_MAP: Record<string, string> = { SH: 'blue', SZ: 'green', BJ: 'orange' }

const StockPool: React.FC = () => {
  const navigate = useNavigate()

  const [stocks, setStocks] = useState<PoolStock[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [keyword, setKeyword] = useState('')
  const [industry, setIndustry] = useState<string | undefined>(undefined)
  const [exchange, setExchange] = useState<string>('')

  const [industries, setIndustries] = useState<string[]>([])
  const [industriesLoading, setIndustriesLoading] = useState(false)

  const [searchResults, setSearchResults] = useState<PoolStock[]>([])
  const [searching, setSearching] = useState(false)

  const [detailVisible, setDetailVisible] = useState(false)
  const [detailStock, setDetailStock] = useState<PoolStock | null>(null)
  const [detailPrices, setDetailPrices] = useState<PriceRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const [syncing, setSyncing] = useState(false)

  const [watchlists, setWatchlists] = useState<any[]>([])
  const [addWatchlistVisible, setAddWatchlistVisible] = useState(false)
  const [addingStock, setAddingStock] = useState<PoolStock | null>(null)

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
    if (keyword.trim()) return
    setLoading(true)
    try {
      const params: any = { page, page_size: pageSize }
      if (industry) params.industry = industry
      if (exchange) params.exchange = exchange
      const data: any = await dataApi.getStockPool(params)
      setStocks(data.items || data.data || [])
      setTotal(data.total || 0)
    } catch {
      message.error('获取股票池失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, page, pageSize, industry, exchange])

  const fetchWatchlists = useCallback(async () => {
    try {
      const data: any = await watchlistApi.getWatchlists()
      setWatchlists(data)
    } catch {
      setWatchlists([])
    }
  }, [])

  useEffect(() => {
    fetchIndustries()
    fetchWatchlists()
  }, [fetchIndustries, fetchWatchlists])

  useEffect(() => {
    fetchStockPool()
  }, [fetchStockPool])

  const handleSearch = async (value: string) => {
    const kw = value.trim()
    setKeyword(kw)
    if (!kw) {
      setSearchResults([])
      setPage(1)
      return
    }
    setSearching(true)
    try {
      const data: any = await dataApi.searchStockPool(kw)
      setSearchResults(Array.isArray(data) ? data : [])
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const handleViewDetail = async (stock: PoolStock) => {
    setDetailStock(stock)
    setDetailVisible(true)
    setDetailLoading(true)
    setDetailPrices([])
    try {
      const data: any = await dataApi.getStockPrices(stock.code, { limit: 10 })
      setDetailPrices(Array.isArray(data) ? data : (data.items || []))
    } catch {
      setDetailPrices([])
    } finally {
      setDetailLoading(false)
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
    setSyncing(true)
    try {
      const res: any = await dataApi.syncStockPool()
      message.success(res.message || '同步完成')
      fetchStockPool()
      fetchIndustries()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      message.error(detail || '同步失败')
    } finally {
      setSyncing(false)
    }
  }

  const handleTableChange = (pagination: any) => {
    setPage(pagination.current)
    setPageSize(pagination.pageSize)
  }

  const handleIndustryChange = (value: string | undefined) => {
    setIndustry(value)
    setPage(1)
  }

  const handleExchangeChange = (value: string) => {
    setExchange(value)
    setPage(1)
  }

  const columns = [
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
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record)}
            >
              查看
            </Button>
          </Tooltip>
          <Tooltip title="添加到自选">
            <Button
              type="text"
              size="small"
              icon={<StarOutlined />}
              onClick={() => handleAddToWatchlist(record)}
            >
              自选
            </Button>
          </Tooltip>
          <Tooltip title="用于预测">
            <Button
              type="text"
              size="small"
              icon={<ThunderboltOutlined />}
              onClick={() => handlePredict(record.code)}
            >
              预测
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ]

  const searchColumns = [
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
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record)}
            >
              查看
            </Button>
          </Tooltip>
          <Tooltip title="添加到自选">
            <Button
              type="text"
              size="small"
              icon={<StarOutlined />}
              onClick={() => handleAddToWatchlist(record)}
            >
              自选
            </Button>
          </Tooltip>
          <Tooltip title="用于预测">
            <Button
              type="text"
              size="small"
              icon={<ThunderboltOutlined />}
              onClick={() => handlePredict(record.code)}
            >
              预测
            </Button>
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

  const isSearchMode = keyword.trim().length > 0
  const displayData = isSearchMode ? searchResults : stocks

  return (
    <div>
      <h1 className="page-title">股票池</h1>
      <p className="page-description">
        浏览A股股票池，搜索感兴趣的股票，添加到自选或直接用于预测
      </p>

      <Card
        size="small"
        style={{ marginBottom: 16 }}
      >
        <Space wrap size="middle">
          <Input.Search
            placeholder="输入股票代码或名称搜索"
            allowClear
            enterButton={<><SearchOutlined /> 搜索</>}
            style={{ width: 300 }}
            onSearch={handleSearch}
            onChange={(e) => {
              if (!e.target.value.trim()) {
                setKeyword('')
                setSearchResults([])
              }
            }}
            loading={searching}
          />
          <Select
            placeholder="筛选行业"
            allowClear
            style={{ width: 180 }}
            loading={industriesLoading}
            value={industry}
            onChange={handleIndustryChange}
            showSearch
            optionFilterProp="children"
          >
            {industries.map((ind) => (
              <Option key={ind} value={ind}>{ind}</Option>
            ))}
          </Select>
          <Select
            style={{ width: 140 }}
            value={exchange}
            onChange={handleExchangeChange}
          >
            {EXCHANGE_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value}>{opt.label}</Option>
            ))}
          </Select>
          <Tooltip title="从akshare同步A股股票池数据">
            <Button
              icon={<CloudSyncOutlined />}
              onClick={handleSyncPool}
              loading={syncing}
            >
              同步股票池
            </Button>
          </Tooltip>
        </Space>
      </Card>

      <Card
        title={isSearchMode ? `搜索结果 (${searchResults.length})` : `股票池 (共 ${total} 只)`}
      >
        <Table
          columns={isSearchMode ? searchColumns : columns}
          dataSource={displayData}
          rowKey="code"
          loading={isSearchMode ? searching : loading}
          pagination={isSearchMode ? false : {
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 只`,
          }}
          onChange={isSearchMode ? undefined : handleTableChange}
          size="middle"
          locale={{ emptyText: isSearchMode ? '未找到匹配的股票' : '暂无股票数据，请先同步股票池' }}
          onRow={(record) => ({
            onDoubleClick: () => handleViewDetail(record),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>

      <Modal
        title={detailStock ? `${detailStock.code} - ${detailStock.name}` : '股票详情'}
        open={detailVisible}
        onCancel={() => {
          setDetailVisible(false)
          setDetailStock(null)
          setDetailPrices([])
        }}
        footer={[
          <Button
            key="watchlist"
            icon={<StarOutlined />}
            onClick={() => {
              if (detailStock) handleAddToWatchlist(detailStock)
            }}
          >
            添加到自选
          </Button>,
          <Button
            key="predict"
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={() => {
              if (detailStock) {
                setDetailVisible(false)
                handlePredict(detailStock.code)
              }
            }}
          >
            用于预测
          </Button>,
          <Button key="close" onClick={() => {
            setDetailVisible(false)
            setDetailStock(null)
            setDetailPrices([])
          }}>
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
                <Tag color={EXCHANGE_COLOR_MAP[detailStock.exchange] || 'default'}>
                  {detailStock.exchange || '-'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="行业" span={3}>
                {detailStock.industry || '未知'}
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginBottom: 8, fontWeight: 600 }}>
              <StockOutlined style={{ marginRight: 6 }} />
              最近价格数据
            </div>
            <Spin spinning={detailLoading}>
              {detailPrices.length > 0 ? (
                <Table
                  columns={priceColumns}
                  dataSource={detailPrices}
                  rowKey="date"
                  size="small"
                  pagination={false}
                />
              ) : (
                !detailLoading && (
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
        onCancel={() => {
          setAddWatchlistVisible(false)
          setAddingStock(null)
        }}
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
}

export default StockPool
