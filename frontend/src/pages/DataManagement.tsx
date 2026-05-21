import React, { useEffect, useState, useRef } from 'react'
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
  Popconfirm,
} from 'antd'
import {
  SearchOutlined,
  CloudDownloadOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  DatabaseOutlined,
  CalendarOutlined,
  InfoCircleOutlined,
  SyncOutlined,
  PushpinOutlined,
  PushpinFilled,
  DeleteOutlined,
} from '@ant-design/icons'
import { dataApi } from '@/services/api'
import { Stock } from '@/types'

const DataManagement: React.FC = () => {
  const isMobile = window.innerWidth < 768
  const [stocks, setStocks] = useState<Stock[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchModalVisible, setFetchModalVisible] = useState(false)
  const [fetchForm] = Form.useForm()

  const [fetching, setFetching] = useState(false)
  const [fetchProgress, setFetchProgress] = useState(0)
  const [fetchMessage, setFetchMessage] = useState('')
  const [fetchStage, setFetchStage] = useState('')
  const [fetchResult, setFetchResult] = useState<{ stock_name: string; price_count: number } | null>(null)

  const [syncingCode, setSyncingCode] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncMessage, setSyncMessage] = useState('')
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [updatingAll, setUpdatingAll] = useState(false)

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

    let retryCount = 0
    const maxRetries = 2

    const connectSSE = () => {
      const eventSource = new EventSource(url)
      let receivedData = false
      const timeoutId = setTimeout(() => {
        if (!receivedData) {
          eventSource.close()
          handleFetchStockFallback(code)
        }
      }, 15000)

      eventSource.onmessage = (event) => {
        receivedData = true
        clearTimeout(timeoutId)
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
          // ignore SSE parse errors
        }
      }

      eventSource.onerror = () => {
        clearTimeout(timeoutId)
        eventSource.close()
        retryCount++
        if (retryCount <= maxRetries && !receivedData) {
          setFetchMessage(`连接中断，正在重试 (${retryCount}/${maxRetries})...`)
          setTimeout(connectSSE, 1000)
        } else {
          handleFetchStockFallback(code)
        }
      }
    }

    connectSSE()
  }

  const handleFetchStockFallback = async (code: string) => {
    setFetchMessage('正在获取数据（回退模式）...')
    setFetchStage('fetch')
    setFetchProgress(10)

    const progressTimer = setInterval(() => {
      setFetchProgress((prev) => {
        if (prev >= 85) return prev
        return prev + Math.random() * 8
      })
    }, 300)

    try {
      const result: any = await dataApi.fetchStock({ code })
      clearInterval(progressTimer)
      setFetchProgress(100)
      if (result.success) {
        setFetchResult({ stock_name: result.stock?.name || code, price_count: result.price_count || 0 })
        message.success(result.message)
        fetchStocks()
        fetchForm.resetFields()
      } else {
        message.error(result.message)
      }
    } catch (error: any) {
      clearInterval(progressTimer)
      message.error(error?.response?.data?.message || '获取数据失败')
    } finally {
      setFetching(false)
    }
  }

  const handleSync = async (code: string) => {
    if (syncingCode) return

    setSyncingCode(code)
    setSyncProgress(10)
    setSyncMessage(`正在同步 ${code}...`)

    if (syncTimerRef.current) clearInterval(syncTimerRef.current)
    syncTimerRef.current = setInterval(() => {
      setSyncProgress((prev) => {
        if (prev >= 90) return prev
        return prev + Math.random() * 12
      })
    }, 300)

    try {
      const result: any = await dataApi.syncStockPrices(code)
      if (syncTimerRef.current) clearInterval(syncTimerRef.current)
      setSyncProgress(100)
      setSyncMessage('同步完成')
      if (result.success) {
        message.success(result.message)
        fetchStocks()
      } else {
        message.error(result.message)
      }
    } catch (error: any) {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current)
      message.error(error?.response?.data?.message || '同步失败')
    } finally {
      setTimeout(() => {
        setSyncingCode(null)
        setSyncProgress(0)
        setSyncMessage('')
      }, 800)
    }
  }

  const handlePin = async (code: string, isPinned: boolean) => {
    try {
      if (isPinned) {
        await dataApi.unpinStock(code)
        message.success('已取消置顶')
      } else {
        await dataApi.pinStock(code)
        message.success('已置顶')
      }
      fetchStocks()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleDelete = async (code: string) => {
    try {
      await dataApi.deleteStock(code)
      message.success('删除成功')
      fetchStocks()
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '删除失败')
    }
  }

  const handleUpdateAll = async () => {
    setUpdatingAll(true)
    try {
      const res: any = await dataApi.updateAll()
      message.success(`更新完成: ${res.synced_count} 只成功, ${res.failed_count} 只失败`)
      fetchStocks()
    } catch {
      message.error('批量更新失败')
    } finally {
      setUpdatingAll(false)
    }
  }

  const totalPrices = stocks.reduce((sum, s) => sum + (s.price_count || 0), 0)

  const columns = [
    {
      title: '',
      key: 'pin',
      width: 40,
      render: (_: any, record: Stock) => (
        <Button
          type="text"
          size="small"
          icon={record.is_pinned ? <PushpinFilled style={{ color: '#1890ff' }} /> : <PushpinOutlined />}
          onClick={() => handlePin(record.code, !!record.is_pinned)}
        />
      ),
    },
    {
      title: '代码',
      dataIndex: 'code',
      key: 'code',
      width: 100,
      render: (code: string, record: Stock) => (
        <Space>
          <strong>{code}</strong>
          {record.is_pinned && <Tag color="blue" style={{ fontSize: 10 }}>置顶</Tag>}
        </Space>
      ),
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
      width: 160,
      render: (_: any, record: Stock) => (
        <Space>
          <Tooltip title="同步数据">
            <Button
              type="text"
              icon={<SyncOutlined />}
              onClick={() => handleSync(record.code)}
              size="small"
            >
              同步
            </Button>
          </Tooltip>
          <Popconfirm
            title="确认删除"
            description={`删除股票 ${record.name}(${record.code}) 及其所有价格数据？`}
            onConfirm={() => handleDelete(record.code)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="删除股票">
              <Button type="text" danger icon={<DeleteOutlined />} size="small" />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <h1 className="page-title">数据管理</h1>
      <p className="page-description">
        管理A股历史数据。输入股票代码获取数据后，即可用于模型训练和预测。
      </p>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="已入库股票" value={stocks.length} suffix="只" prefix={<DatabaseOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="总数据量" value={totalPrices} suffix="条" prefix={<DatabaseOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
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
            <li>点击📌图标可置顶/取消置顶股票，置顶的股票排在最前</li>
          </ul>
        }
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        style={{ marginBottom: 16 }}
      />

      {syncingCode && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SyncOutlined spin style={{ color: '#1890ff', fontSize: 16 }} />
            <div style={{ flex: 1 }}>
              <Progress
                percent={Math.round(syncProgress)}
                status="active"
                strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
                size="small"
              />
            </div>
            <span style={{ color: '#666', fontSize: 13, whiteSpace: 'nowrap' }}>{syncMessage}</span>
          </div>
        </Card>
      )}

      <Card
        title="股票列表"
        extra={
          <Space>
            <Button
              icon={<SyncOutlined spin={updatingAll} />}
              onClick={handleUpdateAll}
              loading={updatingAll}
              disabled={stocks.filter((s) => (s.price_count || 0) > 0).length === 0}
            >
              一键更新所有数据
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={stocks}
          rowKey="code"
          loading={loading}
          pagination={{ pageSize: 10 }}
          size="middle"
          scroll={{ x: 800 }}
          locale={{ emptyText: '暂无股票数据，点击上方"获取股票数据"按钮开始' }}
        />
      </Card>

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
        width={isMobile ? '100%' : 520}
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
