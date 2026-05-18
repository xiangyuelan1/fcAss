import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Select,
  Button,
  Tag,
  Space,
  message,
  Row,
  Col,
  Statistic,
  Descriptions,
  Alert,
  Spin,
  Table,
  Collapse,
  Tooltip,
} from 'antd'
import {
  ThunderboltOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  RobotOutlined,
  DeleteOutlined,
  StockOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { predictionApi, trainingApi, modelApi, dataApi } from '@/services/api'
import { TrainingTask, UserModel } from '@/types'
import MascotBull from '@/components/MascotBull'
import { PredictionResult, PredictionAnimation, ConfidenceBar, deriveConfidence, labelToDirection } from '@/components/PredictionFun'

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

const Prediction: React.FC = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const taskIdFromUrl = searchParams.get('task_id')

  const [tasks, setTasks] = useState<TrainingTask[]>([])
  const [models, setModels] = useState<Record<number, UserModel>>({})
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

  useEffect(() => {
    fetchCompletedTasks()
    fetchModels()
  }, [])

  useEffect(() => {
    if (selectedTaskId) {
      fetchPredictableStocks(selectedTaskId)
    }
  }, [selectedTaskId])

  const fetchCompletedTasks = async () => {
    try {
      const data: any = await trainingApi.getTasks({ status: 'completed' })
      setTasks(data?.items || (Array.isArray(data) ? data : []))
    } catch (error) {
      message.error('获取训练任务失败')
    }
  }

  const fetchModels = async () => {
    try {
      const data: any = await modelApi.getModels()
      const models = data?.items || (Array.isArray(data) ? data : [])
      const modelMap: Record<number, UserModel> = {}
      models.forEach((model: UserModel) => {
        modelMap[model.id] = model
      })
      setModels(modelMap)
    } catch (error) {
      console.error('获取模型列表失败:', error)
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

  const addRecord = (result: any, taskId: number) => {
    const task = tasks.find((t) => t.id === taskId)
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

  const handleClearHistory = () => {
    setHistoryRecords([])
  }

  const getLabelStyle = (label: string) => {
    if (label === '看涨') return { color: '#f5222d', icon: <ArrowUpOutlined />, bg: '#fff1f0' }
    if (label === '看跌') return { color: '#52c41a', icon: <ArrowDownOutlined />, bg: '#f6ffed' }
    return { color: '#faad14', icon: <MinusOutlined />, bg: '#fffbe6' }
  }

  const selectedTask = tasks.find((t) => t.id === selectedTaskId)
  const selectedModel = selectedTask ? models[selectedTask.model_id] : null

  const groupedRecords = historyRecords.reduce<Record<string, PredictionRecord[]>>((acc, rec) => {
    const key = rec.stock_code
    if (!acc[key]) acc[key] = []
    acc[key].push(rec)
    return acc
  }, {})

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

  const latestResult = historyRecords.length > 0 ? historyRecords[0] : null

  return (
    <div>
      <h1 className="page-title">智能预测</h1>
      <p className="page-description">
        使用已训练完成的模型对股票进行预测，获取涨跌方向和预期收益参考。
      </p>

      {tasks.length === 0 && (
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
              {tasks.map((task) => {
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

        {selectedModel && (
          <Descriptions size="small" bordered column={3} style={{ marginTop: 16 }}>
            <Descriptions.Item label="模型类型">{selectedModel.model_type.toUpperCase()}</Descriptions.Item>
            <Descriptions.Item label="预测目标">
              {selectedModel.target === 'next_day_return' ? '次日收益率' :
               selectedModel.target === 'next_day_direction' ? '次日涨跌方向' :
               selectedModel.target === 'price_change_5d' ? '5日价格变化' : selectedModel.target}
            </Descriptions.Item>
            <Descriptions.Item label="特征数量">{selectedModel.features?.length || 0}个指标</Descriptions.Item>
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

      {/* 最新预测结果 */}
      {latestResult && (() => {
        const direction = labelToDirection(latestResult.prediction_label)
        const confidence = latestResult.confidence ?? deriveConfidence(latestResult.prediction)
        const stock = predictableStocks.find(s => s.code === latestResult.stock_code)
        const changePct = latestResult.predicted_change_pct
        const isUp = changePct !== null && changePct !== undefined && changePct > 0
        const isDown = changePct !== null && changePct !== undefined && changePct < 0
        return (
          <Card title="最新预测结果" style={{ marginBottom: 24 }}>
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
                  <Col span={12}>
                    <Card>
                      <Statistic
                        title="预测目标价格"
                        value={latestResult.predicted_price ?? latestResult.latest_data?.close ?? 0}
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

            {/* 实时行情 */}
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

      {/* 批量预测结果 */}
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

      {/* 历史预测结果（按股票分组） */}
      {historyRecords.length > 0 && (
        <Card
          title={`预测历史（共 ${historyRecords.length} 条）`}
          extra={
            <Button size="small" danger icon={<DeleteOutlined />} onClick={handleClearHistory}>
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
                  ]}
                />
              ),
            }))}
          />
        </Card>
      )}

      {/* 预测中加载 */}
      {(predicting || batchPredicting) && (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="模型推理中..." />
        </Card>
      )}
    </div>
  )
}

export default Prediction
