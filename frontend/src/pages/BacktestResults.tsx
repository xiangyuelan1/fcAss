import React, { useEffect, useState, useMemo } from 'react'
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  message,
  Modal,
  Statistic,
  Row,
  Col,
  Tabs,
  List,
  Empty,
  Alert,
  Collapse,
  Tooltip,
  Spin,
} from 'antd'
import {
  EyeOutlined,
  DeleteOutlined,
  ReloadOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  DollarOutlined,
  InfoCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import { Line } from '@ant-design/charts'
import { backtestApi } from '@/services/api'
import { BacktestResult, EquityPoint } from '@/types'

/**
 * 回测说明内容
 */
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
              <li>在<strong>训练任务</strong>页面，找到已完成的训练任务</li>
              <li>点击<strong>"回测"</strong>按钮，选择回测日期范围和初始资金</li>
              <li>等待回测执行完成，在此页面查看结果</li>
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

const BacktestResults: React.FC = () => {
  const [results, setResults] = useState<BacktestResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedResult, setSelectedResult] = useState<BacktestResult | null>(null)
  const [detailModalVisible, setDetailModalVisible] = useState(false)

  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    fetchResults()
  }, [])

  const fetchResults = async () => {
    setLoading(true)
    try {
      const data: any = await backtestApi.getResults()
      setResults(Array.isArray(data) ? data : (data?.items || []))
    } catch (error) {
      message.error('获取回测结果失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (result: BacktestResult) => {
    try {
      await backtestApi.deleteResult(result.id)
      message.success('删除成功')
      fetchResults()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleViewDetail = async (result: BacktestResult) => {
    setSelectedResult(result)
    setDetailModalVisible(true)
    setDetailLoading(true)
    try {
      const [detail, equityRes, tradesRes] = await Promise.all([
        backtestApi.getResult(result.id).catch(() => null),
        backtestApi.getEquityCurve(result.id).catch(() => null),
        backtestApi.getTrades(result.id).catch(() => null),
      ])
      const detailData = detail as any
      const equityData = equityRes as any
      const tradesData = tradesRes as any
      setSelectedResult({
        ...result,
        ...(detailData || {}),
        equity_curve: equityData?.equity_curve || equityData || null,
        trades: tradesData?.trades || (Array.isArray(tradesData) ? tradesData : []),
      })
    } catch (error) {
      message.error('获取详情数据失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const columns = [
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
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <h1 className="page-title">回测分析</h1>
      <p className="page-description">
        查看模型回测结果，分析策略表现和交易记录。
      </p>

      <BacktestGuide />

      <Card
        title="回测结果列表"
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchResults}>
            刷新
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={results}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1200 }}
        />
      </Card>

      <Modal
        title={`回测详情 #${selectedResult?.id}`}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        width={1000}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        {selectedResult && (
          <Spin spinning={detailLoading}>
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
                          value={selectedResult.initial_capital}
                          prefix={<DollarOutlined />}
                          precision={2}
                        />
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card size="small">
                        <Statistic
                          title="最终资金"
                          value={selectedResult.final_capital || 0}
                          prefix={<DollarOutlined />}
                          precision={2}
                          valueStyle={{
                            color: (selectedResult.final_capital || 0) >= selectedResult.initial_capital
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
                          value={(selectedResult.total_return || 0) * 100}
                          suffix="%"
                          precision={2}
                          valueStyle={{
                            color: (selectedResult.total_return || 0) >= 0 ? '#f5222d' : '#52c41a',
                          }}
                          prefix={(selectedResult.total_return || 0) >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                        />
                      </Card>
                    </Col>
                  </Row>

                  <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="年化收益"
                          value={(selectedResult.annual_return || 0) * 100}
                          suffix="%"
                          precision={2}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="最大回撤"
                          value={(selectedResult.max_drawdown || 0) * 100}
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
                          value={selectedResult.sharpe_ratio || 0}
                          precision={2}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="索提诺比率"
                          value={selectedResult.sortino_ratio || 0}
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
                          value={selectedResult.trades_count || 0}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="胜率"
                          value={(selectedResult.win_rate || 0) * 100}
                          suffix="%"
                          precision={1}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="盈亏比"
                          value={selectedResult.profit_factor || 0}
                          precision={2}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="卡尔玛比率"
                          value={selectedResult.calmar_ratio || 0}
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
              children: selectedResult.trades && selectedResult.trades.length > 0 ? (
                <List
                  size="small"
                  dataSource={selectedResult.trades}
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
              children: selectedResult.equity_curve && selectedResult.equity_curve.length > 0 ? (
                <EquityCharts equityCurve={selectedResult.equity_curve} initialCapital={selectedResult.initial_capital} />
              ) : (
                <Empty description="暂无权益曲线数据" />
              ),
            },
          ]} />
          </Spin>
        )}
      </Modal>
    </div>
  )
}

export default BacktestResults

/** 回测图表组件：权益曲线 + 回撤图 + 每日收益 */
const EquityCharts: React.FC<{ equityCurve: EquityPoint[]; initialCapital: number }> = ({
  equityCurve,
  initialCapital,
}) => {
  if (!equityCurve || equityCurve.length === 0) {
    return <Empty description="暂无权益曲线数据" />
  }

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

  const baseLineConfig = {
    xField: 'date',
    yField: 'value',
    height: 300,
    smooth: true,
    xAxis: { label: { autoRotate: true, style: { fontSize: 11 } } } as any,
    yAxis: { label: { formatter: (v: string) => Number(v).toLocaleString(), style: { fontSize: 11 } } } as any,
    tooltip: { shared: true } as any,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card size="small" title="权益曲线" style={{ marginBottom: 0 }}>
        <Line
          {...baseLineConfig}
          data={equityData}
          seriesField="type"
          color={['#1890ff', '#52c41a', '#faad14']}
          yAxis={{
            ...baseLineConfig.yAxis,
            label: { ...baseLineConfig.yAxis.label, formatter: (v: string) => `¥${Number(v).toLocaleString()}` },
          }}
          legend={{ position: 'top' } as any}
        />
      </Card>

      <Card size="small" title="回撤 (%)" style={{ marginBottom: 0 }}>
        <Line
          {...baseLineConfig}
          data={drawdownData}
          color="#f5222d"
          yAxis={{
            ...baseLineConfig.yAxis,
            label: { ...baseLineConfig.yAxis.label, formatter: (v: string) => `${Number(v).toFixed(1)}%` },
          }}
          areaStyle={{ fill: 'l(270) 0:rgba(245,34,45,0.25) 1:rgba(245,34,45,0.02)' } as any}
        />
      </Card>

      <Card size="small" title="每日收益 (%)" style={{ marginBottom: 0 }}>
        <Line
          {...baseLineConfig}
          data={dailyReturnData}
          color="#722ed1"
          yAxis={{
            ...baseLineConfig.yAxis,
            label: { ...baseLineConfig.yAxis.label, formatter: (v: string) => `${Number(v).toFixed(2)}%` },
          }}
        />
      </Card>
    </div>
  )
}
