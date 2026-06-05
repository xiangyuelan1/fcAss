/**
 * 模拟盘 Tab 内容
 * 包含模拟盘持仓列表、开启模拟盘弹窗
 */
import React, { useEffect, useState } from 'react'
import { Card, Row, Col, Tag, Space, Spin, Button, Modal, Select, InputNumber, Statistic, Table, Alert, message } from 'antd'
import { FundOutlined, PlusOutlined } from '@ant-design/icons'
import { communityApi, paperTradingApi } from '@/services/api'
import { CommunityModel } from '@/types'
import { MODEL_TYPE_COLORS } from './utils'

const PaperTrading: React.FC = () => {
  // 模型列表（用于开启模拟盘弹窗中的模型选择）
  const [models, setModels] = useState<CommunityModel[]>([])
  const [paperTradingList, setPaperTradingList] = useState<any[]>([])
  const [paperTradingLoading, setPaperTradingLoading] = useState(false)
  const [startPaperTradingVisible, setStartPaperTradingVisible] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<number | undefined>()
  const [initialCapital, setInitialCapital] = useState(100000)
  const [startingPaperTrading, setStartingPaperTrading] = useState(false)

  /** 获取模型列表（供弹窗选择用） */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fetchModels = async () => {
    try {
      const data = await communityApi.getModels({})
      const items = (data as any)?.items || (Array.isArray(data) ? data : [])
      setModels(items)
    } catch {
      // 静默失败，弹窗中模型列表为空即可
    }
  }

  /** 获取模拟盘列表（批量查询，避免 N+1 请求） */
  const fetchPaperTradingList = async () => {
    setPaperTradingLoading(true)
    try {
      const data: any = await paperTradingApi.getBatchStatus()
      setPaperTradingList(data?.items || [])
    } catch {
      setPaperTradingList([])
    } finally {
      setPaperTradingLoading(false)
    }
  }

  useEffect(() => {
    fetchPaperTradingList()
  }, [])

  /** 开启模拟盘 */
  const handleStartPaperTrading = async () => {
    if (!selectedModelId) {
      message.warning('请选择模型')
      return
    }
    setStartingPaperTrading(true)
    try {
      await paperTradingApi.startPaperTrading({
        model_id: selectedModelId,
        initial_capital: initialCapital,
      })
      message.success('模拟盘已开启')
      setStartPaperTradingVisible(false)
      setSelectedModelId(undefined)
      setInitialCapital(100000)
      fetchPaperTradingList()
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      message.error(typeof detail === 'string' ? detail : '开启模拟盘失败')
    } finally {
      setStartingPaperTrading(false)
    }
  }

  return (
    <>
      <Spin spinning={paperTradingLoading}>
        {paperTradingList.length === 0 && !paperTradingLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <FundOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16, display: 'block' }} />
            <div style={{ fontSize: 16, color: '#666', marginBottom: 8 }}>还没有模拟盘</div>
            <div style={{ fontSize: 13, color: '#999', marginBottom: 24 }}>
              选择一个已训练的模型，开启模拟盘交易，验证策略在真实市场中的表现
            </div>
            <Button
              type="primary"
              icon={<FundOutlined />}
              onClick={() => { setStartPaperTradingVisible(true); fetchModels() }}
            >
              开启模拟盘
            </Button>
          </div>
        ) : (
          <>
            {paperTradingList.map((item: any) => (
              <Card
                key={item.model_id}
                size="small"
                style={{ marginBottom: 12 }}
                title={
                  <Space>
                    <Tag color={MODEL_TYPE_COLORS[item.model_type] || 'default'}>
                      {item.model_type?.toUpperCase()}
                    </Tag>
                    <span>{item.model_name}</span>
                  </Space>
                }
              >
                <Row gutter={16} style={{ marginBottom: 12 }}>
                  <Col span={8}>
                    <Statistic
                      title="总资产"
                      value={item.total_value ?? item.current_capital ?? 0}
                      precision={2}
                      prefix="¥"
                      valueStyle={{ fontSize: 16 }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="总收益率"
                      value={((item.total_return ?? 0) * 100)}
                      precision={2}
                      suffix="%"
                      valueStyle={{
                        fontSize: 16,
                        color: (item.total_return ?? 0) >= 0 ? '#f5222d' : '#52c41a',
                      }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="持仓数"
                      value={item.positions?.length ?? 0}
                      valueStyle={{ fontSize: 16 }}
                    />
                  </Col>
                </Row>
                {item.positions && item.positions.length > 0 && (
                  <Table
                    dataSource={item.positions}
                    rowKey={(p: any) => p.stock_code || p.code}
                    size="small"
                    pagination={false}
                    columns={[
                      {
                        title: '股票代码', dataIndex: 'stock_code', key: 'stock_code', width: 100,
                        render: (code: string) => <Tag color="blue">{code}</Tag>,
                      },
                      {
                        title: '买入价', dataIndex: 'buy_price', key: 'buy_price', width: 90, align: 'right',
                        render: (v: number) => v != null ? `¥${v.toFixed(2)}` : '-',
                      },
                      {
                        title: '当前价', dataIndex: 'current_price', key: 'current_price', width: 90, align: 'right',
                        render: (v: number) => v != null ? `¥${v.toFixed(2)}` : '-',
                      },
                      {
                        title: '盈亏', key: 'pnl', width: 100, align: 'right',
                        render: (_: any, record: any) => {
                          const pnl = record.pnl ?? ((record.current_price ?? 0) - (record.buy_price ?? 0)) * (record.quantity ?? 1)
                          const pnlPct = record.pnl_pct ?? ((record.current_price && record.buy_price)
                            ? ((record.current_price - record.buy_price) / record.buy_price * 100)
                            : null)
                          return (
                            <span style={{ color: pnl >= 0 ? '#f5222d' : '#52c41a', fontWeight: 600 }}>
                              {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                              {pnlPct != null && <span style={{ fontSize: 11, marginLeft: 4 }}>({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)</span>}
                            </span>
                          )
                        },
                      },
                    ]}
                  />
                )}
              </Card>
            ))}
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => { setStartPaperTradingVisible(true); fetchModels() }}>
                开启新模拟盘
              </Button>
            </div>
          </>
        )}
      </Spin>

      {/* 开启模拟盘弹窗 */}
      <Modal
        title={
          <Space>
            <FundOutlined style={{ color: '#1890ff' }} />
            <span>开启模拟盘</span>
          </Space>
        }
        open={startPaperTradingVisible}
        onCancel={() => { setStartPaperTradingVisible(false); setSelectedModelId(undefined); setInitialCapital(100000) }}
        onOk={handleStartPaperTrading}
        okText="开始"
        confirmLoading={startingPaperTrading}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>选择模型</div>
          <Select
            placeholder="请选择一个已训练的模型"
            value={selectedModelId}
            onChange={setSelectedModelId}
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            options={models.map((m: any) => ({
              value: m.source_model_id || m.id,
              label: `${m.name} (${m.model_type?.toUpperCase() || '未知'})`,
            }))}
          />
        </div>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>初始资金（元）</div>
          <InputNumber
            value={initialCapital}
            onChange={(v) => setInitialCapital(v ?? 100000)}
            min={10000}
            max={10000000}
            step={10000}
            style={{ width: '100%' }}
            formatter={(value) => `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => Number(value!.replace(/¥\s?|(,*)/g, '')) as 0}
          />
        </div>
        <Alert
          style={{ marginTop: 12 }}
          message="模拟盘将使用所选模型的预测信号进行模拟交易，不涉及真实资金"
          type="info"
          showIcon
        />
      </Modal>
    </>
  )
}

export default PaperTrading
