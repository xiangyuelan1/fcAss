import React, { useEffect, useState, useRef } from 'react'
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
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { trainingApi, modelApi, backtestApi } from '@/services/api'
import { TrainingTask, UserModel } from '@/types'
import { TrainingCompleteEffect } from '@/components/TrainingCompleteEffect'
import MascotBull from '@/components/MascotBull'
import dayjs from 'dayjs'

const TrainingTasks: React.FC = () => {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<TrainingTask[]>([])
  const [models, setModels] = useState<Record<number, UserModel>>({})
  const [loading, setLoading] = useState(false)
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
  const [backtestResults, setBacktestResults] = useState<Record<number, any>>({})

  const [trainingEffect, setTrainingEffect] = useState<'completed' | 'failed' | null>(null)

  useEffect(() => {
    fetchTasks()
    fetchModels()
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
        }
      } catch {}
    }

    es.onerror = () => {
      es.close()
      delete sseRefs.current[taskId]
    }
  }

  const fetchTasks = async () => {
    setLoading(true)
    try {
      const data: any = await trainingApi.getTasks()
      const items = data?.items || (Array.isArray(data) ? data : [])
      setTasks(items)
      const completedTaskIds = items
        .filter((t: TrainingTask) => t.status === 'completed')
        .map((t: TrainingTask) => t.id)
      if (completedTaskIds.length > 0) {
        fetchBacktestResults(completedTaskIds)
      }
    } catch (error) {
      message.error('哎呀，模型训练翻车了，牛牛建议换个参数试试？')
    } finally {
      setLoading(false)
    }
  }

  const fetchBacktestResults = async (taskIds: number[]) => {
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
      setBacktestResults(results)
    } catch {}
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
                  navigate('/backtest')
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
    navigate(`/prediction?task_id=${task.id}`)
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

  const columns = [
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
          {record.status === 'completed' && backtestResults[record.id] && (
            <div style={{ marginTop: 4, fontSize: 11, color: '#666' }}>
              <span style={{ color: (backtestResults[record.id].total_return || 0) >= 0 ? '#f5222d' : '#52c41a' }}>
                收益: {((backtestResults[record.id].total_return || 0) * 100).toFixed(1)}%
              </span>
              {' | '}
              <span>夏普: {(backtestResults[record.id].sharpe_ratio || 0).toFixed(2)}</span>
              {' | '}
              <span style={{ color: '#f5222d' }}>回撤: {((backtestResults[record.id].max_drawdown || 0) * 100).toFixed(1)}%</span>
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
              {backtestResults[record.id] && (
                <Button
                  type="text"
                  icon={<EyeOutlined />}
                  style={{ color: '#1890ff' }}
                  onClick={() => navigate(`/backtest`)}
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

  const runningCount = tasks.filter((t) => t.status === 'running').length
  const completedCount = tasks.filter((t) => t.status === 'completed').length
  const failedCount = tasks.filter((t) => t.status === 'failed').length

  return (
    <div>
      <h1 className="page-title">训练与回测</h1>
      <p className="page-description">
        创建模型训练任务，训练完成后可直接回测验证策略表现。
      </p>

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
          columns={columns}
          dataSource={tasks}
          rowKey="id"
          loading={loading}
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

export default TrainingTasks
