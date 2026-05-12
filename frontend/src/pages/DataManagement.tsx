import React, { useEffect, useState } from 'react'
import {
  Card,
  Table,
  Button,
  Space,
  message,
  Modal,
  Form,
  Input,
  Tag,
  Progress,
  Alert,
  Descriptions,
  Tooltip,
  Badge,
  Statistic,
  Row,
  Col,
} from 'antd'
import {
  PlusOutlined,
  SearchOutlined,
  CloudDownloadOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  DatabaseOutlined,
  CalendarOutlined,
  InfoCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { dataApi } from '@/services/api'
import { Stock } from '@/types'

const DataManagement: React.FC = () => {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchModalVisible, setFetchModalVisible] = useState(false)
  const [fetchForm] = Form.useForm()

  const [fetching, setFetching] = useState(false)
  const [fetchProgress, setFetchProgress] = useState(0)
  const [fetchMessage, setFetchMessage] = useState('')
  const [fetchStage, setFetchStage] = useState('')
  const [fetchResult, setFetchResult] = useState<{ stock_name: string; price_count: number } | null>(null)

  useEffect(() => {
    fetchStocks()
  }, [])

  const fetchStocks = async () => {
    setLoading(true)
    try {
      const data: any = await dataApi.getStocks()
      setStocks(data)
    } catch (error) {
      message.error('获取股票列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleFetchStock = async (values: { code: string }) => {
    const code = values.code.trim()
    if (!code) return

    setFetching(true)
    setFetchProgress(0)
    setFetchMessage('正在连接数据源...')
    setFetchStage('init')
    setFetchResult(null)

    const token = localStorage.getItem('token')
    const baseUrl = (window as any).__API_BASE_URL__ || ''
    const url = `${baseUrl}/api/data/stocks/fetch-stream?code=${encodeURIComponent(code)}&token=${token || ''}`

    const eventSource = new EventSource(url)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        setFetchProgress(data.progress || 0)
        setFetchMessage(data.message || '')
        setFetchStage(data.stage || '')

        if (data.stage === 'completed') {
          eventSource.close()
          setFetching(false)
          setFetchResult({ stock_name: data.stock?.name || code, price_count: data.price_count || 0 })
          message.success(data.message)
          fetchStocks()
          fetchForm.resetFields()
        } else if (data.stage === 'error') {
          eventSource.close()
          setFetching(false)
          message.error(data.message)
        }
      } catch {
        // 忽略SSE解析错误
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
      handleFetchStockFallback(code)
    }
  }

  const handleFetchStockFallback = async (code: string) => {
    setFetchMessage('正在获取数据（回退模式）...')
    setFetchProgress(50)
    try {
      const result: any = await dataApi.fetchStock({ code })
      if (result.success) {
        setFetchResult({ stock_name: result.stock?.name || code, price_count: result.price_count || 0 })
        message.success(result.message)
        fetchStocks()
        fetchForm.resetFields()
      } else {
        message.error(result.message)
      }
    } catch (error: any) {
      message.error(error?.response?.data?.message || '获取数据失败')
    } finally {
      setFetching(false)
      setFetchProgress(100)
    }
  }

  const handleSync = async (code: string) => {
    const hide = message.loading(`正在同步 ${code}...`, 0)
    try {
      const result: any = await dataApi.syncStockPrices(code)
      if (result.success) {
        message.success(result.message)
        fetchStocks()
      } else {
        message.error(result.message)
      }
    } catch (error: any) {
      message.error(error?.response?.data?.message || '同步失败')
    } finally {
      hide()
    }
  }

  const totalPrices = stocks.reduce((sum, s) => sum + (s.price_count || 0), 0)

  const columns = [
    {
      title: '代码',
      dataIndex: 'code',
      key: 'code',
      width: 100,
      render: (code: string) => <strong>{code}</strong>,
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '交易所',
      dataIndex: 'exchange',
      key: 'exchange',
      width: 80,
      render: (exchange: string) => {
        const colorMap: Record<string, string> = { SH: 'blue', SZ: 'green', BJ: 'orange' }
        return <Tag color={colorMap[exchange] || 'default'}>{exchange}</Tag>
      },
    },
    {
      title: '行业',
      dataIndex: 'industry',
      key: 'industry',
      width: 100,
      render: (industry: string | null) => industry || <Tag>未知</Tag>,
    },
    {
      title: '数据概要',
      key: 'data_summary',
      width: 280,
      render: (_: any, record: Stock) => {
        const count = record.price_count || 0
        if (count === 0) {
          return <Tag color="warning">暂无数据</Tag>
        }
        return (
          <Space size={4} wrap>
            <Tooltip title="数据条数">
              <Tag icon={<DatabaseOutlined />} color="blue">{count} 条</Tag>
            </Tooltip>
            {record.earliest_date && record.latest_date && (
              <Tooltip title="数据日期范围">
                <Tag icon={<CalendarOutlined />} color="green">
                  {record.earliest_date} ~ {record.latest_date}
                </Tag>
              </Tooltip>
            )}
          </Space>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: Stock) => (
        <Tooltip title="重新从数据源同步最新价格数据">
          <Button
            type="text"
            icon={<SyncOutlined />}
            onClick={() => handleSync(record.code)}
            size="small"
          >
            同步
          </Button>
        </Tooltip>
      ),
    },
  ]

  return (
    <div>
      <h1 className="page-title">数据管理</h1>
      <p className="page-description">
        管理A股历史数据。输入股票代码获取数据后，即可用于模型训练和预测。
      </p>

      {/* 数据总览 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="已入库股票" value={stocks.length} suffix="只" prefix={<DatabaseOutlined />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="总数据量" value={totalPrices} suffix="条" prefix={<DatabaseOutlined />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="有数据的股票"
              value={stocks.filter((s) => (s.price_count || 0) > 0).length}
              suffix={`/ ${stocks.length}`}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: stocks.filter((s) => (s.price_count || 0) > 0).length > 0 ? '#52c41a' : '#999' }}
            />
          </Card>
        </Col>
      </Row>

      <Alert
        message="数据获取说明"
        description={
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>输入6位A股代码即可获取近3年历史数据（如 600519 茅台、000001 平安银行）</li>
            <li>数据来源自动降级：baostock → 腾讯财经 → 新浪财经</li>
            <li>获取的数据包含：开盘价、最高价、最低价、收盘价、成交量、成交额、涨跌幅</li>
            <li>点击"同步"可更新已有股票的最新数据</li>
          </ul>
        }
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        style={{ marginBottom: 16 }}
      />

      <Card
        title="股票列表"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setFetchModalVisible(true)}
          >
            获取股票数据
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={stocks}
          rowKey="code"
          loading={loading}
          pagination={{ pageSize: 10 }}
          size="middle"
          locale={{ emptyText: '暂无股票数据，点击上方"获取股票数据"按钮开始' }}
        />
      </Card>

      {/* 获取股票数据弹窗 */}
      <Modal
        title="获取股票数据"
        open={fetchModalVisible}
        onCancel={() => {
          if (!fetching) {
            setFetchModalVisible(false)
            fetchForm.resetFields()
            setFetchResult(null)
          }
        }}
        footer={null}
        width={520}
      >
        {!fetching && !fetchResult ? (
          <Form form={fetchForm} onFinish={handleFetchStock}>
            <Alert
              message="输入A股代码获取历史数据"
              description={
                <div>
                  <p style={{ marginBottom: 4 }}>系统将自动获取近3年的日K线数据（前复权），包含开高低收量额涨跌幅。</p>
                  <p style={{ marginBottom: 0, color: '#666' }}>
                    常用代码：600519（贵州茅台）、000001（平安银行）、000858（五粮液）、601318（中国平安）
                  </p>
                </div>
              }
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Form.Item
              name="code"
              rules={[{ required: true, message: '请输入股票代码' }]}
            >
              <Input
                placeholder="输入6位股票代码，如 600519"
                size="large"
                prefix={<SearchOutlined />}
                maxLength={6}
              />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                icon={<CloudDownloadOutlined />}
                size="large"
                block
              >
                获取数据
              </Button>
            </Form.Item>
          </Form>
        ) : fetching ? (
          <div style={{ padding: '20px 0' }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <LoadingOutlined style={{ fontSize: 48, color: '#1890ff' }} />
            </div>
            <Progress
              percent={fetchProgress}
              status="active"
              strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
            />
            <div style={{ textAlign: 'center', color: '#666', marginTop: 8, fontSize: 14 }}>
              {fetchMessage}
            </div>
            <div style={{ textAlign: 'center', color: '#999', marginTop: 4, fontSize: 12 }}>
              {fetchStage === 'init' && '正在初始化...'}
              {fetchStage === 'info' && '已获取股票基本信息'}
              {fetchStage === 'fetch' && '正在从数据源下载历史数据...'}
              {fetchStage === 'sync' && '正在将数据写入本地数据库...'}
              {fetchStage === 'update' && '正在更新股票信息...'}
            </div>
          </div>
        ) : fetchResult ? (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a' }} />
            <div style={{ marginTop: 16, fontSize: 16, fontWeight: 600 }}>
              数据获取成功！
            </div>
            <Descriptions column={1} size="small" style={{ marginTop: 16, maxWidth: 300, margin: '16px auto 0' }}>
              <Descriptions.Item label="股票">{fetchResult.stock_name}</Descriptions.Item>
              <Descriptions.Item label="数据条数">
                <Badge count={fetchResult.price_count} style={{ backgroundColor: '#52c41a' }} overflowCount={99999} />
                <span style={{ marginLeft: 8, color: '#999' }}>条日K线数据</span>
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 16 }}>
              <Space>
                <Button type="primary" onClick={() => { setFetchModalVisible(false); setFetchResult(null); fetchForm.resetFields() }}>
                  完成
                </Button>
                <Button onClick={() => { setFetchResult(null); fetchForm.resetFields() }}>
                  继续获取
                </Button>
              </Space>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

export default DataManagement
