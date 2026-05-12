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
import dayjs from 'dayjs'

const { TabPane } = Tabs

const TrainingTasks: React.FC = () => {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<TrainingTask[]>([])
  const [models, setModels] = useState<Record<number, UserModel>>({})
  const [loading, setLoading] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TrainingTask | null>(null)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [progressMap, setProgressMap] = useState<Record<number, any>>({})

  // 训练日志状态
  const [logs, setLogs] = useState<string[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // 回测弹窗状态
  const [backtestModalVisible, setBacktestModalVisible] = useState(false)
  const [backtestTask, setBacktestTask] = useState<TrainingTask | null>(null)
  const [backtestLoading, setBacktestLoading] = useState(false)
  const [backtestForm] = Form.useForm()

  useEffect(() => {
    fetchTasks()
    fetchModels()
    const interval = setInterval(fetchProgress, 3000)
    return () => clearInterval(interval)
  }, [])

  const fetchTasks = async () => {
    setLoading(true)
    try {
      const data: any = await trainingApi.getTasks()
      setTasks(data)
    } catch (error) {
      message.error('获取训练任务失败')
    } finally {
      setLoading(false)
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

  const fetchProgress = async () => {
    const runningTasks = tasks.filter((t) => t.status === 'running')
    for (const task of runningTasks) {
      try {
        const progress: any = await trainingApi.getTaskProgress(task.id)
        setProgressMap((prev) => ({ ...prev, [task.id]: progress.progress }))
      } catch (error) {
        console.error('获取进度失败:', error)
      }
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
      const dateRange = values.start_date
      await backtestApi.runBacktest({
        task_id: backtestTask.id,
        start_date: dateRange[0].format('YYYY-MM-DD'),
        end_date: dateRange[1].format('YYYY-MM-DD'),
        initial_capital: values.initial_capital || 100000,
        commission_rate: values.commission_rate || 0.0003,
      })
      message.success('回测任务已创建，正在后台执行')
      setBacktestModalVisible(false)
      navigate('/backtest')
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      if (typeof detail === 'string') {
        message.error(detail)
      } else {
        message.error('创建回测失败')
      }
    } finally {
      setBacktestLoading(false)
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
          {status === 'running' && progressMap[record.id] && (
            <Progress
              percent={progressMap[record.id].progress}
              size="small"
              style={{ marginTop: 8, width: 120 }}
            />
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
      <h1 className="page-title">训练任务</h1>
      <p className="page-description">
        查看和管理模型训练任务，训练完成后可直接进行回测和预测。
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
        />
      </Card>

      {/* 任务详情弹窗（含训练日志） */}
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
          <Tabs defaultActiveKey="info">
            <TabPane tab="基本信息" key="info">
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
            </TabPane>

            <TabPane
              tab={
                <Space>
                  <FileTextOutlined />
                  训练日志
                </Space>
              }
              key="logs"
            >
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
            </TabPane>
          </Tabs>
        )}
      </Modal>

      {/* 执行回测弹窗 */}
      <Modal
        title="执行回测"
        open={backtestModalVisible}
        onCancel={() => setBacktestModalVisible(false)}
        onOk={handleRunBacktest}
        confirmLoading={backtestLoading}
        okText="开始回测"
        width={600}
      >
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
                <InputNumber
                  min={10000}
                  max={10000000}
                  step={10000}
                  style={{ width: '100%' }}
                  addonAfter="元"
                />
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
      </Modal>
    </div>
  )
}

export default TrainingTasks
