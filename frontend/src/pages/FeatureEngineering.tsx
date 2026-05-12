import React, { useEffect, useState } from 'react'
import {
  Card,
  Row,
  Col,
  Select,
  Button,
  Table,
  Tag,
  message,
  Space,
  Collapse,
  InputNumber,
  Statistic,
  Alert,
  Tooltip,
  Descriptions,
  Spin,
  Empty,
} from 'antd'
import {
  ToolOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import { featureApi, dataApi } from '@/services/api'
import { Indicator, Stock } from '@/types'

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

const FeatureEngineering: React.FC = () => {
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedStock, setSelectedStock] = useState<string>()
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([])
  const [indicatorParams, setIndicatorParams] = useState<Record<string, Record<string, any>>>({})
  const [previewData, setPreviewData] = useState<any[]>([])
  const [previewColumns, setPreviewColumns] = useState<any[]>([])
  const [previewStats, setPreviewStats] = useState<Record<string, any>>({})
  const [previewDateRange, setPreviewDateRange] = useState<{ start: string; end: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    fetchIndicators()
    fetchStocks()
    fetchCategories()
  }, [])

  const fetchIndicators = async () => {
    try {
      const data: any = await featureApi.getIndicators()
      setIndicators(data)
    } catch (error) {
      message.error('获取指标列表失败')
    }
  }

  const fetchStocks = async () => {
    try {
      const data: any = await dataApi.getStocks()
      setStocks(data.slice(0, 100))
    } catch (error) {
      message.error('获取股票列表失败')
    }
  }

  const fetchCategories = async () => {
    try {
      const data: any = await featureApi.getCategories()
      setCategories(data.categories || [])
    } catch (error) {
      console.error('获取分类失败:', error)
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
            if (typeof val === 'number') {
              return val.toFixed(4)
            }
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
    }
    return colors[category] || 'default'
  }

  const selectedStockInfo = stocks.find((s) => s.code === selectedStock)

  const groupedIndicators = categories.map((category) => ({
    category,
    indicators: indicators.filter((i) => i.category === category),
  }))

  const getSelectedCategories = () => {
    const cats = new Set<string>()
    selectedIndicators.forEach((key) => {
      const ind = indicators.find((i) => i.key === key)
      if (ind) cats.add(ind.category)
    })
    return Array.from(cats)
  }

  return (
    <div>
      <h1 className="page-title">特征工程</h1>
      <p className="page-description">
        选择技术指标并预览计算结果，为模型训练准备特征数据。
      </p>

      {/* 什么是特征工程 */}
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
        {/* 左栏：选择区 */}
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
              options={stocks.map((stock) => ({
                label: `${stock.code} - ${stock.name}`,
                value: stock.code,
              }))}
            />
            {selectedStockInfo && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                <Space split="·">
                  <span>{selectedStockInfo.exchange}</span>
                  <span>{selectedStockInfo.industry || '未知行业'}</span>
                  {selectedStockInfo.price_count != null && (
                    <span>{selectedStockInfo.price_count} 条数据</span>
                  )}
                </Space>
              </div>
            )}
            {stocks.length === 0 && (
              <Alert
                message="暂无股票数据"
                description="请先到数据管理页面获取股票数据"
                type="warning"
                showIcon
                style={{ marginTop: 8 }}
              />
            )}
          </Card>

          <Card
            title={
              <Space>
                <ToolOutlined />
                <span>选择指标</span>
                {selectedIndicators.length > 0 && (
                  <Tag color="blue">{selectedIndicators.length}个已选</Tag>
                )}
              </Space>
            }
            size="small"
            style={{ marginTop: 16 }}
          >
            {/* 已选指标摘要 */}
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
                      {selectedInCat > 0 && (
                        <Tag color="blue" style={{ fontSize: 11 }}>已选{selectedInCat}</Tag>
                      )}
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
                                        <span style={{ fontSize: 11, marginRight: 4, color: '#666' }}>
                                          {param.name}:
                                        </span>
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

        {/* 右栏：预览区 */}
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

          {/* 统计信息 */}
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

              {/* 各指标统计 */}
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

          {/* 如何使用特征工程 */}
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
}

export default FeatureEngineering
