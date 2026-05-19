import React, { useEffect, useState } from 'react'
import { Row, Col, Card, Statistic, List, Tag, Button, Steps, Alert, message, Radio, Avatar, Space, Divider, Collapse, Switch } from 'antd'
import {
  DatabaseOutlined,
  RobotOutlined,
  PlayCircleOutlined,
  LineChartOutlined,
  ArrowRightOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  WarningOutlined,
  TrophyOutlined,
  RiseOutlined,
  FallOutlined,
  MinusOutlined,
  QuestionCircleOutlined,
  GlobalOutlined,
  FireOutlined,
  StarOutlined,
  CopyOutlined,
  UserOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { dataApi, modelApi, trainingApi, backtestApi, pointsApi, communityApi, predictionApi, authApi } from '@/services/api'
import { UserModel, TrainingTask, DailyChallenge, PredictionShareItem } from '@/types'
import { useAuthStore } from '@/store'
import OnboardingGuide, { isOnboardingCompleted } from '@/components/OnboardingGuide'
import DailyGuess from '@/components/DailyGuess'
import MascotBull from '@/components/MascotBull'

interface StaleModel {
  model_id: number
  model_name: string
  model_type: string
  task_id: number
  trained_at: string
  stale_stocks: { code: string; latest_data_date: string; trained_at: string }[]
  new_data_count: number
}

interface CommunitySignal {
  id: number
  stock_code: string
  stock_name?: string
  direction: string
  confidence: number
  author?: { username: string }
  created_at?: string
}

interface CommunityModelItem {
  id: number
  name: string
  model_type: string
  description?: string
  likes_count: number
  clones_count: number
  author?: { username: string }
}

interface LeaderboardItem {
  user_id: number
  username: string
  total_points: number
  level: number
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  const [stats, setStats] = useState({
    stockCount: 0,
    modelCount: 0,
    taskCount: 0,
    backtestCount: 0,
    completedTaskCount: 0,
  })
  const [recentModels, setRecentModels] = useState<UserModel[]>([])
  const [recentTasks, setRecentTasks] = useState<TrainingTask[]>([])
  const [staleModels, setStaleModels] = useState<StaleModel[]>([])
  const [syncing, setSyncing] = useState(false)
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallenge | null>(null)
  const [challengeDirection, setChallengeDirection] = useState<string>('up')
  const [submittingChallenge, setSubmittingChallenge] = useState(false)
  const [onboardingVisible, setOnboardingVisible] = useState(false)

  const [hotSignals, setHotSignals] = useState<CommunitySignal[]>([])
  const [popularModels, setPopularModels] = useState<CommunityModelItem[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([])
  const [myPredictions, setMyPredictions] = useState<PredictionShareItem[]>([])

  useEffect(() => {
    fetchDashboardData()
    fetchCommunityData()
    fetchMyPredictions()
  }, [])

  useEffect(() => {
    if (!isOnboardingCompleted() && stats.modelCount === 0 && stats.stockCount >= 0) {
      const timer = setTimeout(() => setOnboardingVisible(true), 800)
      return () => clearTimeout(timer)
    }
  }, [stats.modelCount, stats.stockCount])

  const fetchCommunityData = async () => {
    try {
      const signalsRes: any = await communityApi.getSignals({ page: 1, page_size: 5 })
      setHotSignals(signalsRes.items || signalsRes || [])
    } catch {}

    try {
      const modelsRes: any = await communityApi.getModels({ sort: 'likes', page: 1, page_size: 4 })
      setPopularModels(modelsRes.items || modelsRes || [])
    } catch {}

    try {
      const lbRes: any = await pointsApi.getLeaderboard({ limit: 5 })
      setLeaderboard(lbRes.leaderboard || lbRes || [])
    } catch {}
  }

  const fetchMyPredictions = async () => {
    try {
      const res: any = await predictionApi.getMyPredictions()
      const items = (res as any)?.items || (Array.isArray(res) ? res : [])
      setMyPredictions(items)
    } catch {}
  }

  const fetchDashboardData = async () => {
    const results = await Promise.allSettled([
      dataApi.getStocks(),
      modelApi.getModels(),
      trainingApi.getTasks(),
      backtestApi.getResults(),
    ])

    const [stocksRes, modelsRes, tasksRes, backtestsRes] = results.map((r) =>
      r.status === 'fulfilled' ? r.value : null
    )

    const stocksData = (stocksRes as any)?.items || (Array.isArray(stocksRes) ? stocksRes : [])
    const modelsData = (modelsRes as any)?.items || (Array.isArray(modelsRes) ? modelsRes : [])
    const tasksData = (tasksRes as any)?.items || (Array.isArray(tasksRes) ? tasksRes : [])
    const backtestsData = (backtestsRes as any)?.items || (Array.isArray(backtestsRes) ? backtestsRes : [])

    setStats({
      stockCount: stocksData.length || 0,
      modelCount: modelsData.length || 0,
      taskCount: tasksData.length || 0,
      backtestCount: backtestsData.length || 0,
      completedTaskCount: (tasksData || []).filter((t: TrainingTask) => t.status === 'completed').length,
    })

    setRecentModels(modelsData.slice(0, 5))
    setRecentTasks(tasksData.slice(0, 5))

    try {
      const staleRes: any = await dataApi.checkStaleData()
      setStaleModels(staleRes.stale_models || [])
    } catch {
    }

    try {
      const challengeRes: any = await pointsApi.getDailyChallenge()
      setDailyChallenge(challengeRes)
    } catch {
    }
  }

  const handleBatchSync = async () => {
    setSyncing(true)
    try {
      const res: any = await dataApi.batchSync()
      message.success(`同步完成: ${res.synced_count} 只成功, ${res.failed_count} 只失败`)
      setStaleModels([])
      fetchDashboardData()
    } catch {
      message.error('批量同步失败')
    } finally {
      setSyncing(false)
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

  const handleSubmitChallenge = async () => {
    setSubmittingChallenge(true)
    try {
      await pointsApi.submitDailyChallenge({ direction: challengeDirection, confidence: 0.7 })
      message.success('挑战提交成功！+5积分，次日自动评估')
      setDailyChallenge(prev => prev ? { ...prev, completed: true, direction: challengeDirection } : null)
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '提交失败')
    } finally {
      setSubmittingChallenge(false)
    }
  }

  const getDirectionInfo = (direction: string) => {
    if (direction === 'up') return { label: '看涨', color: 'red', icon: <RiseOutlined /> }
    if (direction === 'down') return { label: '看跌', color: 'green', icon: <FallOutlined /> }
    return { label: '震荡', color: 'default', icon: <MinusOutlined /> }
  }

  const currentStep = (() => {
    if (stats.stockCount === 0) return 0
    if (stats.modelCount === 0) return 1
    if (stats.completedTaskCount === 0) return 2
    if (stats.backtestCount === 0) return 3
    return 4
  })()

  const stepActions: Record<number, { path: string; text: string }> = {
    0: { path: '/data', text: '获取股票数据' },
    1: { path: '/models/build', text: '创建模型' },
    2: { path: '/train-predict', text: '训练模型' },
    3: { path: '/train-predict', text: '执行回测' },
    4: { path: '/train-predict', text: '开始预测' },
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <MascotBull mood="chill" size="small" />
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            A股预测平台
          </h1>
        </div>
        <Button
          type="link"
          icon={<QuestionCircleOutlined />}
          onClick={() => setOnboardingVisible(true)}
          style={{ fontSize: 14 }}
        >
          新手引导
        </Button>
      </div>
      <p className="page-description" style={{ marginBottom: 20 }}>
        看看大家都在预测什么，参与每日挑战，或创建自己的预测模型
      </p>

      {/* ===== 每日一猜 ===== */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} lg={10}>
          <DailyGuess compact />
        </Col>
        <Col xs={24} lg={14}>
          <Card
            title={
              <span>
                <FireOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                社区热门预测
              </span>
            }
            extra={<Button type="link" onClick={() => navigate('/community')}>查看更多 <ArrowRightOutlined /></Button>}
            style={{ height: '100%' }}
            styles={{ body: { paddingTop: 12 } }}
          >
            {hotSignals.length > 0 ? (
              <List
                dataSource={hotSignals}
                split
                renderItem={(signal) => {
                  const dirInfo = getDirectionInfo(signal.direction)
                  return (
                    <List.Item style={{ padding: '8px 0' }}>
                      <List.Item.Meta
                        avatar={
                          <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
                        }
                        title={
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Tag color="blue">{signal.stock_code}</Tag>
                            <Tag color={dirInfo.color}>{dirInfo.icon} {dirInfo.label}</Tag>
                            <span style={{ fontSize: 12, color: '#999' }}>
                              置信度 {Math.round((signal.confidence || 0) * 100)}%
                            </span>
                          </div>
                        }
                        description={
                          <span style={{ fontSize: 12, color: '#999' }}>
                            {signal.author?.username || '匿名'} · {signal.created_at?.slice(0, 10)}
                          </span>
                        }
                      />
                    </List.Item>
                  )
                }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#999' }}>
                <GlobalOutlined style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
                暂无预测信号，成为第一个发布预测的人！
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            title={
              <span>
                <TrophyOutlined style={{ color: '#faad14', marginRight: 8 }} />
                积分排行
              </span>
            }
            extra={<Button type="link" onClick={() => navigate('/community/leaderboard')}>完整榜单 <ArrowRightOutlined /></Button>}
            style={{ height: '100%' }}
            styles={{ body: { paddingTop: 12 } }}
          >
            {leaderboard.length > 0 ? (
              <List
                dataSource={leaderboard}
                split
                renderItem={(item, idx) => (
                  <List.Item style={{ padding: '8px 0' }}>
                    <List.Item.Meta
                      avatar={
                        <Avatar
                          size="small"
                          style={{
                            backgroundColor: idx === 0 ? '#ffd700' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#cd7f32' : '#1890ff',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {idx + 1}
                        </Avatar>
                      }
                      title={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{item.username}</span>
                          <span style={{ fontSize: 13, color: '#faad14', fontWeight: 600 }}>{item.total_points}分</span>
                        </div>
                      }
                      description={<span style={{ fontSize: 12, color: '#999' }}>Lv.{item.level}</span>}
                    />
                  </List.Item>
                )}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#999' }}>
                暂无排行数据
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ===== 每日挑战 + 热门模型 ===== */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} lg={12}>
          {dailyChallenge && dailyChallenge.stock_code ? (
            <Card
              title={
                <span>
                  <TrophyOutlined style={{ color: '#faad14', marginRight: 8 }} />
                  每日挑战
                  <Tag color="gold" style={{ marginLeft: 8 }}>+5积分</Tag>
                </span>
              }
            >
              <Row gutter={[16, 16]} align="middle">
                <Col xs={24} md={8}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 14, color: '#999', marginBottom: 4 }}>今日挑战股票</div>
                    <div style={{ fontSize: 22, fontWeight: 600 }}>{dailyChallenge.stock_name}</div>
                    <Tag color="blue" style={{ marginTop: 4 }}>{dailyChallenge.stock_code}</Tag>
                  </div>
                </Col>
                <Col xs={24} md={16}>
                  {dailyChallenge.completed ? (
                    <div style={{ textAlign: 'center', padding: '16px 0' }}>
                      <CheckCircleOutlined style={{ fontSize: 36, color: '#52c41a' }} />
                      <div style={{ marginTop: 8, fontSize: 15 }}>今日挑战已提交</div>
                      <div style={{ color: '#999', marginTop: 4 }}>
                        预测方向：
                        {dailyChallenge.direction === 'up' && <Tag color="red"><RiseOutlined /> 上涨</Tag>}
                        {dailyChallenge.direction === 'down' && <Tag color="green"><FallOutlined /> 下跌</Tag>}
                        {dailyChallenge.direction === 'flat' && <Tag><MinusOutlined /> 持平</Tag>}
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ marginBottom: 12, fontSize: 14 }}>
                        预测 {dailyChallenge.stock_name} 明日走势：
                      </div>
                      <Radio.Group
                        value={challengeDirection}
                        onChange={(e) => setChallengeDirection(e.target.value)}
                        size="large"
                        style={{ marginBottom: 12 }}
                      >
                        <Radio.Button value="up"><RiseOutlined /> 上涨</Radio.Button>
                        <Radio.Button value="down"><FallOutlined /> 下跌</Radio.Button>
                        <Radio.Button value="flat"><MinusOutlined /> 持平</Radio.Button>
                      </Radio.Group>
                      <div>
                        <Button type="primary" size="large" icon={<TrophyOutlined />} onClick={handleSubmitChallenge} loading={submittingChallenge}>
                          提交预测
                        </Button>
                      </div>
                    </div>
                  )}
                </Col>
              </Row>
            </Card>
          ) : (
            <Card
              title={
                <span>
                  <BulbOutlined style={{ color: '#faad14', marginRight: 8 }} />
                  快速上手
                </span>
              }
            >
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <p style={{ fontSize: 15, marginBottom: 16 }}>三步开始你的AI预测之旅</p>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Button type="primary" size="large" block icon={<CopyOutlined />} onClick={() => navigate('/community')}>
                    浏览社区模型，一键克隆
                  </Button>
                  <Button size="large" block icon={<ThunderboltOutlined />} onClick={() => navigate('/models/build')}>
                    使用模板快速创建模型
                  </Button>
                  <Button size="large" block icon={<DatabaseOutlined />} onClick={() => navigate('/data')}>
                    获取股票数据
                  </Button>
                </Space>
              </div>
            </Card>
          )}
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <span>
                <StarOutlined style={{ color: '#faad14', marginRight: 8 }} />
                热门模型
              </span>
            }
            extra={<Button type="link" onClick={() => navigate('/community')}>模型广场 <ArrowRightOutlined /></Button>}
            styles={{ body: { paddingTop: 12 } }}
          >
            {popularModels.length > 0 ? (
              <List
                dataSource={popularModels}
                split
                renderItem={(model) => (
                  <List.Item
                    style={{ padding: '8px 0', cursor: 'pointer' }}
                    onClick={() => navigate(`/community/model/${model.id}`)}
                  >
                    <List.Item.Meta
                      title={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{model.name}</span>
                          <Tag>{model.model_type?.toUpperCase()}</Tag>
                        </div>
                      }
                      description={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: '#999' }}>{model.author?.username || '匿名'}</span>
                          <Space size="middle" style={{ fontSize: 12, color: '#999' }}>
                            <span><StarOutlined /> {model.likes_count}</span>
                            <span><CopyOutlined /> {model.clones_count}</span>
                          </Space>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#999' }}>
                <RobotOutlined style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
                暂无社区模型，成为第一个发布模型的人！
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ===== 数据过期警告 ===== */}
      {staleModels.length > 0 && (
        <Alert
          style={{ marginBottom: 20 }}
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message={`有 ${staleModels.length} 个模型的数据已过期，建议更新后重新训练`}
          description={
            <div>
              {staleModels.map((m) => (
                <div key={m.model_id} style={{ marginBottom: 4 }}>
                  <Tag color="orange">{m.model_name}</Tag>
                  <Tag>{m.model_type.toUpperCase()}</Tag>
                  <span style={{ color: '#999', fontSize: 12 }}>
                    {m.new_data_count} 只股票有新数据
                  </span>
                </div>
              ))}
              <Button
                type="primary"
                size="small"
                icon={<SyncOutlined spin={syncing} />}
                loading={syncing}
                onClick={handleBatchSync}
                style={{ marginTop: 8 }}
              >
                一键更新所有数据
              </Button>
            </div>
          }
        />
      )}

      {/* ===== 我的工作台 ===== */}
      <Divider orientation="left" style={{ fontSize: 15, color: '#666' }}>
        我的工作台
      </Divider>

      {/* ===== 我的预测结果 ===== */}
      <Divider orientation="left" style={{ fontSize: 15, color: '#666' }}>
        我的预测结果
      </Divider>

      <Alert
        message="预测结果会自动展示在工作台，同一只股票的预测结果会归在一起"
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
      />

      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#666' }}>每日自动清空预测结果</span>
        <Switch
          checked={user?.auto_clear_predictions_daily !== false}
          onChange={async (checked) => {
            try {
              await authApi.updateSettings({ auto_clear_predictions_daily: checked })
              setUser({ ...user!, auto_clear_predictions_daily: checked })
              message.success(checked ? '已开启每日自动清空' : '已关闭每日自动清空')
            } catch {
              message.error('更新设置失败')
            }
          }}
        />
      </div>

      {myPredictions.length > 0 ? (
        <Collapse
          size="small"
          style={{ marginBottom: 20 }}
          items={Object.entries(
            myPredictions.reduce((acc, pred) => {
              const key = pred.stock_code
              if (!acc[key]) acc[key] = []
              acc[key].push(pred)
              return acc
            }, {} as Record<string, PredictionShareItem[]>)
          ).map(([code, preds]) => {
            const latest = preds[0]
            const dirInfo = getDirectionInfo(latest.direction || 'flat')
            return {
              key: code,
              label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag color="blue">{code}</Tag>
                  <span>{latest.stock_name || code}</span>
                  <Tag color={dirInfo.color}>{dirInfo.icon} {dirInfo.label}</Tag>
                  <span style={{ fontSize: 12, color: '#999' }}>
                    置信度 {Math.round((latest.confidence || 0) * 100)}%
                  </span>
                  <span style={{ fontSize: 12, color: '#999' }}>
                    {latest.created_at?.slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
              ),
              children: (
                <List
                  size="small"
                  dataSource={preds}
                  renderItem={(pred) => {
                    const predDirInfo = getDirectionInfo(pred.direction || 'flat')
                    return (
                      <List.Item>
                        <List.Item.Meta
                          title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Tag color={predDirInfo.color}>{predDirInfo.icon} {predDirInfo.label}</Tag>
                              <span style={{ fontSize: 12 }}>
                                置信度 {Math.round((pred.confidence || 0) * 100)}%
                              </span>
                              {pred.prediction_value != null && (
                                <span style={{ fontSize: 12, color: '#666' }}>
                                  预测值: {pred.prediction_value.toFixed(2)}
                                </span>
                              )}
                            </div>
                          }
                          description={
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 12, color: '#999' }}>
                                {pred.model_name || '未知模型'}
                              </span>
                              <span style={{ fontSize: 12, color: '#999' }}>
                                {pred.created_at?.slice(0, 16).replace('T', ' ')}
                              </span>
                            </div>
                          }
                        />
                      </List.Item>
                    )
                  }}
                />
              ),
            }
          })}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#999', marginBottom: 20 }}>
          <ThunderboltOutlined style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
          暂无预测结果，完成训练后即可进行预测
        </div>
      )}

      {/* 引导式流程进度 */}
      <Card style={{ marginBottom: 20 }} size="small">
        <Steps
          current={currentStep}
          size="small"
          items={[
            { title: '获取数据', icon: stats.stockCount > 0 ? <CheckCircleOutlined /> : <DatabaseOutlined /> },
            { title: '构建模型', icon: stats.modelCount > 0 ? <CheckCircleOutlined /> : <RobotOutlined /> },
            { title: '训练模型', icon: stats.completedTaskCount > 0 ? <CheckCircleOutlined /> : <PlayCircleOutlined /> },
            { title: '回测验证', icon: stats.backtestCount > 0 ? <CheckCircleOutlined /> : <LineChartOutlined /> },
            { title: '智能预测', icon: <ThunderboltOutlined /> },
          ]}
        />
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Button
            type="primary"
            icon={<ArrowRightOutlined />}
            onClick={() => navigate(stepActions[currentStep].path)}
          >
            {stepActions[currentStep].text}
          </Button>
        </div>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/data')} size="small">
            <Statistic
              title="股票数据"
              value={stats.stockCount}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#1890ff', fontSize: 22 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/models')} size="small">
            <Statistic
              title="我的模型"
              value={stats.modelCount}
              prefix={<RobotOutlined />}
              valueStyle={{ color: '#52c41a', fontSize: 22 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/train-predict')} size="small">
            <Statistic
              title="训练任务"
              value={stats.taskCount}
              prefix={<PlayCircleOutlined />}
              valueStyle={{ color: '#faad14', fontSize: 22 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/train-predict')} size="small">
            <Statistic
              title="可预测模型"
              value={stats.completedTaskCount}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: '#722ed1', fontSize: 22 }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
        <Col xs={24} lg={12}>
          <Card
            title="最近模型"
            size="small"
            extra={<Button type="link" size="small" onClick={() => navigate('/models')}>查看全部</Button>}
          >
            <List
              dataSource={recentModels}
              size="small"
              renderItem={(model) => (
                <List.Item
                  actions={[
                    model.status === 'trained' ? (
                      <Button type="link" size="small" onClick={() => navigate('/train-predict')}>预测</Button>
                    ) : model.status === 'draft' ? (
                      <Button type="link" size="small" onClick={() => navigate('/train-predict')}>训练</Button>
                    ) : null,
                    <Button type="link" size="small" onClick={() => navigate(`/models/build/${model.id}`)}>编辑</Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={model.name}
                    description={
                      <div>
                        <Tag>{model.model_type?.toUpperCase()}</Tag>
                        <Tag color={getStatusColor(model.status)}>{getStatusText(model.status)}</Tag>
                      </div>
                    }
                  />
                </List.Item>
              )}
              locale={{ emptyText: '暂无模型，点击"创建模型"开始' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="最近任务"
            size="small"
            extra={<Button type="link" size="small" onClick={() => navigate('/train-predict')}>查看全部</Button>}
          >
            <List
              dataSource={recentTasks}
              size="small"
              renderItem={(task) => (
                <List.Item
                  actions={[
                    task.status === 'completed' ? (
                      <Button type="link" size="small" onClick={() => navigate('/train-predict')}>预测</Button>
                    ) : null,
                    <Button type="link" size="small" onClick={() => navigate('/train-predict')}>详情</Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={`任务 #${task.id}`}
                    description={
                      <div>
                        <Tag color={getStatusColor(task.status)}>{getStatusText(task.status)}</Tag>
                        {task.start_time && (
                          <span style={{ marginLeft: 8, color: '#999', fontSize: 12 }}>
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

      <OnboardingGuide
        open={onboardingVisible}
        onClose={() => setOnboardingVisible(false)}
      />
    </div>
  )
}

export default Dashboard
