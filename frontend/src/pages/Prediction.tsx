import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Select,
  Button,
  Tag,
  message,
  Row,
  Col,
  Statistic,
  Descriptions,
  Alert,
  Spin,
  Table,
} from 'antd'
import {
  ThunderboltOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { predictionApi, trainingApi, modelApi } from '@/services/api'
import { TrainingTask, UserModel } from '@/types'

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
  const [predictionResult, setPredictionResult] = useState<any>(null)
  const [batchResults, setBatchResults] = useState<any[]>([])
  const [batchPredicting, setBatchPredicting] = useState(false)

  useEffect(() => {
    fetchCompletedTasks()
    fetchModels()
  }, [])

  useEffect(() => {
    if (selectedTaskId) {
      fetchPredictableStocks(selectedTaskId)
      setPredictionResult(null)
      setBatchResults([])
    }
  }, [selectedTaskId])

  const fetchCompletedTasks = async () => {
    try {
      const data: any = await trainingApi.getTasks({ status: 'completed' })
      setTasks(data)
    } catch (error) {
      message.error('获取训练任务失败')
    }
  }

  const fetchModels = async () => {
    try {
      const data: any = await modelApi.getModels()
      const modelMap: Record<number, UserModel> = {}
      data.forEach((model: UserModel) => {
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
      if (data.stocks?.length > 0) {
        setSelectedStock(data.stocks[0].code)
      }
    } catch (error) {
      message.error('获取可预测股票失败')
    }
  }

  const handlePredict = async () => {
    if (!selectedTaskId || !selectedStock) {
      message.warning('请选择训练任务和股票')
      return
    }
    setPredicting(true)
    setPredictionResult(null)
    try {
      const data: any = await predictionApi.predict({
        task_id: selectedTaskId,
        stock_code: selectedStock,
      })
      setPredictionResult(data)
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      if (typeof detail === 'string') {
        message.error(detail)
      } else {
        message.error('预测失败')
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
      setBatchResults(data.predictions || [])
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

  const getLabelStyle = (label: string) => {
    if (label === '看涨') return { color: '#f5222d', icon: <ArrowUpOutlined />, bg: '#fff1f0' }
    if (label === '看跌') return { color: '#52c41a', icon: <ArrowDownOutlined />, bg: '#f6ffed' }
    return { color: '#faad14', icon: <MinusOutlined />, bg: '#fffbe6' }
  }

  const selectedTask = tasks.find((t) => t.id === selectedTaskId)
  const selectedModel = selectedTask ? models[selectedTask.model_id] : null

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

  return (
    <div>
      <h1 className="page-title">智能预测</h1>
      <p className="page-description">
        使用已训练完成的模型对股票进行预测，获取涨跌方向和预期收益参考。
      </p>

      {tasks.length === 0 && (
        <Alert
          message="暂无可用的训练任务"
          description="请先完成模型训练后再进行预测。训练完成后，在此页面即可使用对应模型进行预测。"
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
              dropdownRender={(menu) => (
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

      {/* 单只股票预测结果 */}
      {predictionResult && (
        <Card title="预测结果" style={{ marginBottom: 24 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Card
                style={{
                  background: getLabelStyle(predictionResult.prediction_label).bg,
                  textAlign: 'center',
                }}
              >
                <Statistic
                  title="预测方向"
                  value={predictionResult.prediction_label}
                  prefix={getLabelStyle(predictionResult.prediction_label).icon}
                  valueStyle={{
                    color: getLabelStyle(predictionResult.prediction_label).color,
                    fontSize: 32,
                  }}
                />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card>
                <Statistic
                  title="预测值"
                  value={predictionResult.prediction}
                  precision={6}
                  valueStyle={{
                    color: predictionResult.prediction > 0 ? '#f5222d' : '#52c41a',
                  }}
                />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card>
                <Statistic
                  title="最新收盘价"
                  value={predictionResult.latest_data?.close || 0}
                  prefix="¥"
                  precision={2}
                />
                <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
                  数据日期: {predictionResult.latest_data?.date || '-'}
                </div>
              </Card>
            </Col>
          </Row>

          <Alert
            style={{ marginTop: 16 }}
            message="预测说明"
            description={
              predictionResult.prediction_label === '看涨'
                ? `模型预测 ${predictionResult.stock_code} 短期有上涨趋势，预测值为 ${predictionResult.prediction.toFixed(6)}。请注意：此预测仅供参考，不构成投资建议。`
                : predictionResult.prediction_label === '看跌'
                ? `模型预测 ${predictionResult.stock_code} 短期有下跌趋势，预测值为 ${predictionResult.prediction.toFixed(6)}。请注意：此预测仅供参考，不构成投资建议。`
                : `模型预测 ${predictionResult.stock_code} 短期走势震荡，预测值为 ${predictionResult.prediction.toFixed(6)}。请注意：此预测仅供参考，不构成投资建议。`
            }
            type={
              predictionResult.prediction_label === '看涨' ? 'success' :
              predictionResult.prediction_label === '看跌' ? 'warning' : 'info'
            }
            showIcon
          />
        </Card>
      )}

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
