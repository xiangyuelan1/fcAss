import React, { useEffect, useState } from 'react'
import { Row, Col, Card, Statistic, List, Tag, Button, Steps } from 'antd'
import {
  DatabaseOutlined,
  RobotOutlined,
  PlayCircleOutlined,
  LineChartOutlined,
  ArrowRightOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { dataApi, modelApi, trainingApi, backtestApi } from '@/services/api'
import { UserModel, TrainingTask } from '@/types'

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    stockCount: 0,
    modelCount: 0,
    taskCount: 0,
    backtestCount: 0,
    completedTaskCount: 0,
  })
  const [recentModels, setRecentModels] = useState<UserModel[]>([])
  const [recentTasks, setRecentTasks] = useState<TrainingTask[]>([])

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const [stocksRes, modelsRes, tasksRes, backtestsRes] = await Promise.all([
        dataApi.getStocks(),
        modelApi.getModels(),
        trainingApi.getTasks(),
        backtestApi.getResults(),
      ])

      const stocksData = stocksRes as any
      const modelsData = modelsRes as any
      const tasksData = tasksRes as any
      const backtestsData = backtestsRes as any

      setStats({
        stockCount: stocksData.length || 0,
        modelCount: modelsData.length || 0,
        taskCount: tasksData.length || 0,
        backtestCount: backtestsData.length || 0,
        completedTaskCount: (tasksData || []).filter((t: TrainingTask) => t.status === 'completed').length,
      })

      setRecentModels(modelsData.slice(0, 5))
      setRecentTasks(tasksData.slice(0, 5))
    } catch (error) {
      console.error('获取仪表盘数据失败:', error)
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'default',
      trained: 'success',
      deployed: 'processing',
      pending: 'default',
      running: 'processing',
      completed: 'success',
      failed: 'error',
      cancelled: 'warning',
    }
    return colors[status] || 'default'
  }

  const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
      draft: '草稿',
      trained: '已训练',
      deployed: '已部署',
      pending: '待执行',
      running: '运行中',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消',
    }
    return texts[status] || status
  }

  // 根据当前状态判断用户处于流程的哪一步
  const getCurrentStep = () => {
    if (stats.stockCount === 0) return 0
    if (stats.modelCount === 0) return 1
    if (stats.completedTaskCount === 0) return 2
    if (stats.backtestCount === 0) return 3
    return 4
  }

  const currentStep = getCurrentStep()

  const stepActions: Record<number, { path: string; text: string }> = {
    0: { path: '/data', text: '获取股票数据' },
    1: { path: '/models/build', text: '创建模型' },
    2: { path: '/models', text: '训练模型' },
    3: { path: '/training', text: '执行回测' },
    4: { path: '/prediction', text: '开始预测' },
  }

  return (
    <div>
      <h1 className="page-title">平台概览</h1>
      <p className="page-description">
        欢迎使用A股预测训练平台，在这里您可以DIY自己的预测模型并进行训练和回测。
      </p>

      {/* 引导式流程进度 */}
      <Card style={{ marginBottom: 24 }}>
        <Steps
          current={currentStep}
          items={[
            { title: '获取数据', icon: stats.stockCount > 0 ? <CheckCircleOutlined /> : <DatabaseOutlined /> },
            { title: '构建模型', icon: stats.modelCount > 0 ? <CheckCircleOutlined /> : <RobotOutlined /> },
            { title: '训练模型', icon: stats.completedTaskCount > 0 ? <CheckCircleOutlined /> : <PlayCircleOutlined /> },
            { title: '回测验证', icon: stats.backtestCount > 0 ? <CheckCircleOutlined /> : <LineChartOutlined /> },
            { title: '智能预测', icon: <ThunderboltOutlined /> },
          ]}
        />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button
            type="primary"
            size="large"
            icon={<ArrowRightOutlined />}
            onClick={() => navigate(stepActions[currentStep].path)}
          >
            {stepActions[currentStep].text}
          </Button>
        </div>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/data')}>
            <Statistic
              title="股票数据"
              value={stats.stockCount}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
            <div style={{ marginTop: 8 }}>
              <Button type="link" size="small">
                管理数据 <ArrowRightOutlined />
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/models')}>
            <Statistic
              title="模型数量"
              value={stats.modelCount}
              prefix={<RobotOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
            <div style={{ marginTop: 8 }}>
              <Button type="link" size="small">
                查看模型 <ArrowRightOutlined />
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/training')}>
            <Statistic
              title="训练任务"
              value={stats.taskCount}
              prefix={<PlayCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
            <div style={{ marginTop: 8 }}>
              <Button type="link" size="small">
                查看任务 <ArrowRightOutlined />
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/prediction')}>
            <Statistic
              title="可预测模型"
              value={stats.completedTaskCount}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
            <div style={{ marginTop: 8 }}>
              <Button type="link" size="small">
                去预测 <ArrowRightOutlined />
              </Button>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={12}>
          <Card
            title="最近创建的模型"
            extra={<Button type="link" onClick={() => navigate('/models')}>查看全部</Button>}
          >
            <List
              dataSource={recentModels}
              renderItem={(model) => (
                <List.Item
                  actions={[
                    model.status === 'trained' ? (
                      <Button type="link" size="small" onClick={() => navigate('/prediction')}>
                        预测
                      </Button>
                    ) : model.status === 'draft' ? (
                      <Button type="link" size="small" onClick={() => navigate('/models')}>
                        训练
                      </Button>
                    ) : null,
                    <Button type="link" size="small" onClick={() => navigate(`/models/build/${model.id}`)}>
                      编辑
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={model.name}
                    description={
                      <div>
                        <Tag>{model.model_type.toUpperCase()}</Tag>
                        <Tag color={getStatusColor(model.status)}>
                          {getStatusText(model.status)}
                        </Tag>
                      </div>
                    }
                  />
                </List.Item>
              )}
              locale={{ emptyText: '暂无模型，点击上方"创建模型"开始' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="最近训练任务"
            extra={<Button type="link" onClick={() => navigate('/training')}>查看全部</Button>}
          >
            <List
              dataSource={recentTasks}
              renderItem={(task) => (
                <List.Item
                  actions={[
                    task.status === 'completed' ? (
                      <Button type="link" size="small" onClick={() => navigate(`/prediction?task_id=${task.id}`)}>
                        预测
                      </Button>
                    ) : null,
                    <Button type="link" size="small" onClick={() => navigate('/training')}>
                      详情
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={`任务 #${task.id}`}
                    description={
                      <div>
                        <Tag color={getStatusColor(task.status)}>
                          {getStatusText(task.status)}
                        </Tag>
                        {task.start_time && (
                          <span style={{ marginLeft: 8, color: '#999' }}>
                            {new Date(task.start_time).toLocaleString()}
                          </span>
                        )}
                      </div>
                    }
                  />
                </List.Item>
              )}
              locale={{ emptyText: '暂无训练任务' }}
            />
          </Card>
        </Col>
      </Row>

      <Row style={{ marginTop: 24 }}>
        <Col span={24}>
          <Card title="快速开始">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={6}>
                <Card type="inner" title="1. 准备数据">
                  <p>输入股票代码获取历史数据</p>
                  <Button type="primary" onClick={() => navigate('/data')} block>
                    前往数据管理
                  </Button>
                </Card>
              </Col>
              <Col xs={24} sm={6}>
                <Card type="inner" title="2. 构建模型">
                  <p>选择模型类型和特征指标</p>
                  <Button type="primary" onClick={() => navigate('/models/build')} block>
                    创建新模型
                  </Button>
                </Card>
              </Col>
              <Col xs={24} sm={6}>
                <Card type="inner" title="3. 训练与回测">
                  <p>训练模型并验证策略效果</p>
                  <Button type="primary" onClick={() => navigate('/training')} block>
                    开始训练
                  </Button>
                </Card>
              </Col>
              <Col xs={24} sm={6}>
                <Card type="inner" title="4. 智能预测">
                  <p>使用模型预测股票走势</p>
                  <Button type="primary" onClick={() => navigate('/prediction')} block
                    icon={<ThunderboltOutlined />}
                  >
                    去预测
                  </Button>
                </Card>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
