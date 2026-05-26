import React, { useEffect, useState, useCallback } from 'react'
import {
  Card,
  Row,
  Col,
  Tag,
  Input,
  Select,
  Space,
  Avatar,
  List,
  Spin,
  Empty,
  Tabs,
  Modal,
  Button,
  Progress,
  Table,
  message,
  Skeleton,
} from 'antd'
import {
  HeartOutlined,
  CopyOutlined,
  SearchOutlined,
  TrophyOutlined,
  StarOutlined,
  RiseOutlined,
  FallOutlined,
  TeamOutlined,
  PlayCircleOutlined,
  BellOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { communityApi, pointsApi, predictionApi, socialApi, leaderboardApi } from '@/services/api'
import {
  CommunityModel,
  PredictionShareItem,
  UserPoints,
  FollowingUpdate,
  ModelLeaderboardItem,
  UserLeaderboardItem,
  SubscriptionItem,
  ReplayItem,
  ReplaySummary,
} from '@/types'
import DailyGuess from '@/components/DailyGuess'

const MODEL_TYPE_COLORS: Record<string, string> = {
  lstm: 'blue',
  gru: 'cyan',
  xgboost: 'green',
  lightgbm: 'lime',
  randomforest: 'orange',
  mlp: 'purple',
}

const SORT_OPTIONS = [
  { label: '最新发布', value: 'newest' },
  { label: '最多点赞', value: 'likes' },
  { label: '最多克隆', value: 'clones' },
]

const TYPE_OPTIONS = [
  { label: '全部类型', value: '' },
  { label: 'LSTM', value: 'lstm' },
  { label: 'GRU', value: 'gru' },
  { label: 'XGBoost', value: 'xgboost' },
  { label: 'LightGBM', value: 'lightgbm' },
  { label: 'RandomForest', value: 'randomforest' },
  { label: 'MLP', value: 'mlp' },
]

const PREDICTION_SORT_OPTIONS = [
  { label: '最新发布', value: 'newest' },
  { label: '最多点赞', value: 'likes' },
  { label: '最高置信度', value: 'confidence' },
]

const LEADERBOARD_PERIOD_OPTIONS = [
  { label: '近一周', value: 'week' },
  { label: '近一月', value: 'month' },
  { label: '全部', value: 'all' },
]

const Community: React.FC = () => {
  const navigate = useNavigate()

  // 模型广场
  const [models, setModels] = useState<CommunityModel[]>([])
  const [predictions, setPredictions] = useState<PredictionShareItem[]>([])
  const [leaderboard, setLeaderboard] = useState<UserPoints[]>([])
  const [followingUpdates, setFollowingUpdates] = useState<FollowingUpdate[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [predictionsLoading, setPredictionsLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [modelType, setModelType] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [predictionSortBy, setPredictionSortBy] = useState('newest')
  const [activeTab, setActiveTab] = useState('models')
  const [initialLoading, setInitialLoading] = useState(true)

  // 排行榜
  const [modelLeaderboard, setModelLeaderboard] = useState<ModelLeaderboardItem[]>([])
  const [userLeaderboard, setUserLeaderboard] = useState<UserLeaderboardItem[]>([])
  const [leaderboardPeriod, setLeaderboardPeriod] = useState('week')
  const [leaderboardType, setLeaderboardType] = useState<'model' | 'user'>('model')
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)

  // 跟单预测
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([])

  // 策略回放
  const [replayVisible, setReplayVisible] = useState(false)
  const [replayModelName, setReplayModelName] = useState('')
  const [replayItems, setReplayItems] = useState<ReplayItem[]>([])
  const [replaySummary, setReplaySummary] = useState<ReplaySummary | null>(null)
  const [replayLoading, setReplayLoading] = useState(false)

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchModels(), fetchPredictions(), fetchLeaderboard(), fetchFollowingUpdates(), fetchSubscriptions()])
      setInitialLoading(false)
    }
    init()
  }, [])

  const fetchModels = useCallback(async () => {
    setModelsLoading(true)
    try {
      const params: Record<string, any> = {}
      if (searchText) params.search = searchText
      if (modelType) params.model_type = modelType
      if (sortBy) params.sort_by = sortBy
      const data = await communityApi.getModels(params)
      const items = (data as any)?.items || (Array.isArray(data) ? data : [])
      setModels(items)
    } catch {
      message.error('获取模型列表失败')
    } finally {
      setModelsLoading(false)
    }
  }, [searchText, modelType, sortBy])

  const fetchPredictions = useCallback(async () => {
    setPredictionsLoading(true)
    try {
      const params: Record<string, any> = {}
      if (predictionSortBy) params.sort_by = predictionSortBy
      const data = await predictionApi.getCommunityPredictions(params)
      const items = (data as any)?.items || (Array.isArray(data) ? data : [])
      setPredictions(items)
    } catch {
      message.error('获取预测分享失败')
    } finally {
      setPredictionsLoading(false)
    }
  }, [predictionSortBy])

  const fetchLeaderboard = async () => {
    try {
      const data = await pointsApi.getLeaderboard({ page_size: 10 })
      setLeaderboard((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch {
      message.error('获取排行榜失败')
    }
  }

  const fetchFollowingUpdates = async () => {
    try {
      const data = await socialApi.getFollowingUpdates()
      const items = (data as any)?.items || (Array.isArray(data) ? data : [])
      setFollowingUpdates(items.slice(0, 3))
    } catch {
      setFollowingUpdates([])
    }
  }

  const fetchSubscriptions = async () => {
    try {
      const data = await predictionApi.getSubscriptions()
      setSubscriptions((data as any)?.subscriptions || [])
    } catch {
      setSubscriptions([])
    }
  }

  const fetchModelLeaderboard = async (period: string) => {
    setLeaderboardLoading(true)
    try {
      const data = await leaderboardApi.getModelLeaderboard({ period, limit: 20 })
      setModelLeaderboard((data as any)?.leaderboard || [])
    } catch {
      message.error('获取模型排行榜失败')
    } finally {
      setLeaderboardLoading(false)
    }
  }

  const fetchUserLeaderboard = async (period: string) => {
    setLeaderboardLoading(true)
    try {
      const data = await leaderboardApi.getUserLeaderboard({ period, limit: 20 })
      setUserLeaderboard((data as any)?.leaderboard || [])
    } catch {
      message.error('获取用户排行榜失败')
    } finally {
      setLeaderboardLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'models') {
      fetchModels()
    }
  }, [searchText, modelType, sortBy, activeTab, fetchModels])

  useEffect(() => {
    if (activeTab === 'predictions') {
      fetchPredictions()
    }
  }, [predictionSortBy, activeTab, fetchPredictions])

  useEffect(() => {
    if (activeTab === 'leaderboard') {
      if (leaderboardType === 'model') {
        fetchModelLeaderboard(leaderboardPeriod)
      } else {
        fetchUserLeaderboard(leaderboardPeriod)
      }
    }
  }, [activeTab, leaderboardPeriod, leaderboardType])

  const handleLikeModel = async (id: number) => {
    try {
      await communityApi.likeModel(id)
      fetchModels()
    } catch {
      message.error('操作失败')
    }
  }

  const handleCloneModel = async (id: number) => {
    try {
      await communityApi.cloneModel(id)
      message.success('克隆成功，已添加到我的模型')
      fetchModels()
    } catch {
      message.error('克隆失败')
    }
  }

  const handleLikePrediction = async (id: number) => {
    try {
      await predictionApi.likePrediction(id)
      fetchPredictions()
    } catch {
      message.error('操作失败')
    }
  }

  const handleSubscribe = async (targetUserId: number) => {
    try {
      const data = await predictionApi.subscribeUser(targetUserId)
      const subscribed = (data as any)?.subscribed
      message.success(subscribed ? '订阅成功' : '已取消订阅')
      fetchSubscriptions()
    } catch {
      message.error('操作失败')
    }
  }

  const handleReplay = async (modelId: number, modelName: string) => {
    setReplayModelName(modelName)
    setReplayVisible(true)
    setReplayLoading(true)
    setReplayItems([])
    setReplaySummary(null)
    try {
      const data = await predictionApi.getStrategyReplay(modelId, 30)
      setReplayItems((data as any)?.replay || [])
      setReplaySummary((data as any)?.summary || null)
    } catch {
      message.error('获取策略回放失败')
    } finally {
      setReplayLoading(false)
    }
  }

  const getDirectionColor = (direction: string) => {
    if (direction === 'up') return 'red'
    if (direction === 'down') return 'green'
    return 'default'
  }

  const getDirectionLabel = (direction: string) => {
    if (direction === 'up') return '看涨'
    if (direction === 'down') return '看跌'
    return '震荡'
  }

  const getDirectionIcon = (direction: string) => {
    if (direction === 'up') return <RiseOutlined />
    if (direction === 'down') return <FallOutlined />
    return null
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return `${diffMin}分钟前`
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return `${diffHour}小时前`
    const diffDay = Math.floor(diffHour / 24)
    if (diffDay < 30) return `${diffDay}天前`
    return date.toLocaleDateString()
  }

  const renderModelSquare = () => (
    <Spin spinning={modelsLoading}>
      {models.length === 0 && !modelsLoading ? (
        <Empty description="暂无社区模型" />
      ) : (
        <Row gutter={[16, 16]}>
          {models.map((model) => (
            <Col xs={24} sm={12} key={model.id}>
              <Card
                hoverable
                onClick={() => navigate(`/community/model/${model.id}`)}
                style={{ height: '100%' }}
              >
                <div style={{ marginBottom: 12 }}>
                  <Space>
                    <Tag color={MODEL_TYPE_COLORS[model.model_type] || 'default'}>
                      {model.model_type.toUpperCase()}
                    </Tag>
                    {model.metrics && model.metrics.accuracy !== undefined && (
                      <Tag color="blue">
                        准确率 {(model.metrics.accuracy * 100).toFixed(1)}%
                      </Tag>
                    )}
                  </Space>
                </div>
                <h3 style={{ marginBottom: 8 }}>{model.name}</h3>
                <p style={{ color: '#999', fontSize: 13, marginBottom: 12, minHeight: 40 }}>
                  {model.description || '暂无描述'}
                </p>
                {/* 战绩展示 */}
                {model.prediction_summary && model.prediction_summary.accuracy > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <Space size={8} wrap>
                      <Tag color="blue" style={{ fontSize: 11 }}>
                        准确率 {(model.prediction_summary.accuracy * 100).toFixed(1)}%
                      </Tag>
                      {model.prediction_summary.current_streak > 0 && (
                        <Tag color="orange" style={{ fontSize: 11 }}>
                          连胜 {model.prediction_summary.current_streak}
                        </Tag>
                      )}
                      {model.prediction_summary.badges.map((badge) => (
                        <Tag
                          key={badge}
                          color={
                            badge.includes('预言大师') ? 'gold' :
                            badge.includes('精准猎手') ? 'green' :
                            badge.includes('反向指标') ? 'red' :
                            badge.includes('百战老兵') ? 'purple' :
                            badge.includes('资深预测') ? 'cyan' :
                            badge.includes('七日连胜') ? 'volcano' :
                            badge.includes('五连绝世') ? 'orange' :
                            'geekblue'
                          }
                          style={{ fontSize: 11 }}
                        >
                          {badge}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                )}
                <div style={{ marginBottom: 12 }}>
                  <Space size={4} wrap>
                    {model.features.slice(0, 4).map((f) => (
                      <Tag key={f} style={{ fontSize: 11 }}>{f}</Tag>
                    ))}
                    {model.features.length > 4 && (
                      <Tag style={{ fontSize: 11 }}>+{model.features.length - 4}</Tag>
                    )}
                  </Space>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/community/model/${model.id}`)
                    }}
                    block
                    style={{
                      background: 'linear-gradient(135deg, #1890ff 0%, #36cfc9 100%)',
                      border: 'none',
                      fontWeight: 600,
                      fontSize: 14,
                      height: 36,
                      borderRadius: 6,
                    }}
                  >
                    🔮 一键预测
                  </Button>
                </div>
                <Row justify="space-between" align="middle">
                  <Col>
                    <Space>
                      <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>
                        {model.author?.username?.[0] || '?'}
                      </Avatar>
                      <span style={{ fontSize: 13 }}>{model.author?.username || '匿名'}</span>
                    </Space>
                  </Col>
                  <Col>
                    <Space size={16}>
                      <span
                        style={{ cursor: 'pointer', color: model.is_liked ? '#eb2f96' : '#999' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleLikeModel(model.id)
                        }}
                      >
                        <HeartOutlined /> {model.likes_count}
                      </span>
                      <span
                        style={{ cursor: 'pointer', color: '#999' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCloneModel(model.id)
                        }}
                      >
                        <CopyOutlined /> {model.clones_count}
                      </span>
                      <span
                        style={{ cursor: 'pointer', color: '#1890ff' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleReplay(model.source_model_id, model.name)
                        }}
                        title="策略回放"
                      >
                        <PlayCircleOutlined /> 回放
                      </span>
                    </Space>
                  </Col>
                </Row>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Spin>
  )

  const renderPredictionShare = () => (
    <Spin spinning={predictionsLoading}>
      {predictions.length === 0 && !predictionsLoading ? (
        <Empty description="暂无预测分享" />
      ) : (
        <Row gutter={[16, 16]}>
          {predictions.map((item) => (
            <Col xs={24} sm={12} key={item.id}>
              <Card style={{ height: '100%' }}>
                <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
                  <Col>
                    <Space>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>
                        {item.stock_name || item.stock_code}
                      </span>
                      <Tag style={{ fontSize: 11 }}>{item.stock_code}</Tag>
                    </Space>
                  </Col>
                  <Col>
                    <Tag
                      color={getDirectionColor(item.direction ?? 'neutral')}
                      icon={getDirectionIcon(item.direction ?? 'neutral')}
                    >
                      {getDirectionLabel(item.direction ?? 'neutral')}
                    </Tag>
                  </Col>
                </Row>

                <Row gutter={16} style={{ marginBottom: 12 }}>
                  {item.confidence != null && (
                    <Col>
                      <div style={{ fontSize: 12, color: '#999' }}>置信度</div>
                      <div style={{ fontWeight: 600, color: '#1890ff' }}>
                        {(item.confidence * 100).toFixed(0)}%
                      </div>
                    </Col>
                  )}
                  {item.prediction_value != null && (
                    <Col>
                      <div style={{ fontSize: 12, color: '#999' }}>预测值</div>
                      <div style={{ fontWeight: 600 }}>
                        ¥{item.prediction_value.toFixed(2)}
                      </div>
                    </Col>
                  )}
                </Row>

                {(item.model_name || item.model_type) && (
                  <div style={{ marginBottom: 12 }}>
                    <Space>
                      {item.model_type && (
                        <Tag color={MODEL_TYPE_COLORS[item.model_type] || 'default'}>
                          {item.model_type.toUpperCase()}
                        </Tag>
                      )}
                      {item.model_name && (
                        <span style={{ fontSize: 13, color: '#666' }}>{item.model_name}</span>
                      )}
                    </Space>
                  </div>
                )}

                <Row justify="space-between" align="middle">
                  <Col>
                    <Space>
                      <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>
                        {item.author?.username?.[0] || '?'}
                      </Avatar>
                      <span style={{ fontSize: 13 }}>{item.author?.username || '匿名'}</span>
                      <span style={{ fontSize: 12, color: '#999' }}>
                        {formatTime(item.created_at)}
                      </span>
                    </Space>
                  </Col>
                  <Col>
                    <Space size={12}>
                      <span
                        style={{ cursor: 'pointer', color: item.is_liked ? '#eb2f96' : '#999' }}
                        onClick={() => handleLikePrediction(item.id)}
                      >
                        <HeartOutlined /> {item.likes_count}
                      </span>
                      {item.user_id && (
                        <span
                          style={{ cursor: 'pointer', color: '#1890ff' }}
                          onClick={() => handleSubscribe(item.user_id)}
                          title="跟单订阅"
                        >
                          <BellOutlined /> 跟单
                        </span>
                      )}
                    </Space>
                  </Col>
                </Row>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Spin>
  )

  const renderLeaderboard = () => (
    <div>
      <Row gutter={[16, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}>
          <Select
            style={{ width: '100%' }}
            options={[
              { label: '模型排行', value: 'model' },
              { label: '用户排行', value: 'user' },
            ]}
            value={leaderboardType}
            onChange={(val) => setLeaderboardType(val)}
          />
        </Col>
        <Col xs={12} sm={8}>
          <Select
            style={{ width: '100%' }}
            options={LEADERBOARD_PERIOD_OPTIONS}
            value={leaderboardPeriod}
            onChange={(val) => setLeaderboardPeriod(val)}
          />
        </Col>
      </Row>

      <Spin spinning={leaderboardLoading}>
        {leaderboardType === 'model' ? (
          modelLeaderboard.length === 0 && !leaderboardLoading ? (
            <Empty description="暂无模型排行数据" />
          ) : (
            <List
              dataSource={modelLeaderboard}
              renderItem={(item, index) => (
                <List.Item style={{ padding: '12px 0' }}>
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        size="small"
                        style={{
                          backgroundColor:
                            index === 0 ? '#f5222d' : index === 1 ? '#faad14' : index === 2 ? '#fa8c16' : '#1890ff',
                        }}
                      >
                        {index + 1}
                      </Avatar>
                    }
                    title={
                      <Space>
                        <span style={{ fontSize: 14 }}>{item.model_name || `模型#${item.model_id}`}</span>
                        {item.model_type && (
                          <Tag color={MODEL_TYPE_COLORS[item.model_type] || 'default'} style={{ fontSize: 11 }}>
                            {item.model_type.toUpperCase()}
                          </Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Space size={8}>
                        <span style={{ fontSize: 12, color: '#999' }}>作者: {item.nickname}</span>
                        <span style={{ fontSize: 12, color: '#999' }}>预测 {item.total} 次</span>
                      </Space>
                    }
                  />
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 18, color: '#1890ff' }}>
                      {(item.accuracy * 100).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 11, color: '#999' }}>准确率</div>
                  </div>
                </List.Item>
              )}
            />
          )
        ) : (
          userLeaderboard.length === 0 && !leaderboardLoading ? (
            <Empty description="暂无用户排行数据" />
          ) : (
            <List
              dataSource={userLeaderboard}
              renderItem={(item, index) => (
                <List.Item style={{ padding: '12px 0' }}>
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        size="small"
                        style={{
                          backgroundColor:
                            index === 0 ? '#f5222d' : index === 1 ? '#faad14' : index === 2 ? '#fa8c16' : '#1890ff',
                        }}
                      >
                        {index + 1}
                      </Avatar>
                    }
                    title={<span style={{ fontSize: 14 }}>{item.nickname}</span>}
                    description={
                      <Space size={8}>
                        <span style={{ fontSize: 12, color: '#999' }}>预测 {item.total_predictions} 次</span>
                        <span style={{ fontSize: 12, color: '#999' }}>模型 {item.total_models} 个</span>
                      </Space>
                    }
                  />
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 18, color: '#faad14' }}>
                      {item.score}
                    </div>
                    <div style={{ fontSize: 11, color: '#999' }}>综合评分</div>
                  </div>
                </List.Item>
              )}
            />
          )
        )}
      </Spin>
    </div>
  )

  const renderReplayModal = () => {
    const columns = [
      {
        title: '日期',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 100,
        render: (v: string) => v ? new Date(v).toLocaleDateString() : '-',
      },
      {
        title: '股票',
        key: 'stock',
        width: 120,
        render: (_: any, record: ReplayItem) => (
          <Space size={4}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{record.stock_name || record.stock_code}</span>
            <Tag style={{ fontSize: 10, lineHeight: '14px', padding: '0 3px' }}>{record.stock_code}</Tag>
          </Space>
        ),
      },
      {
        title: '预测方向',
        dataIndex: 'direction',
        key: 'direction',
        width: 90,
        render: (v: string | null) => v ? (
          <Tag color={getDirectionColor(v)} icon={getDirectionIcon(v)}>
            {getDirectionLabel(v)}
          </Tag>
        ) : '-',
      },
      {
        title: '实际方向',
        dataIndex: 'actual_direction',
        key: 'actual_direction',
        width: 90,
        render: (v: string | null) => v ? (
          <Tag color={getDirectionColor(v)} icon={getDirectionIcon(v)}>
            {getDirectionLabel(v)}
          </Tag>
        ) : '-',
      },
      {
        title: '实际涨跌',
        dataIndex: 'actual_change',
        key: 'actual_change',
        width: 90,
        render: (v: number | null) => v != null ? (
          <span style={{ color: v > 0 ? '#f5222d' : v < 0 ? '#52c41a' : '#999', fontWeight: 600 }}>
            {v > 0 ? '+' : ''}{v}%
          </span>
        ) : '-',
      },
      {
        title: '结果',
        dataIndex: 'correct',
        key: 'correct',
        width: 60,
        render: (v: boolean | null) => {
          if (v === true) return <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
          if (v === false) return <CloseCircleFilled style={{ color: '#f5222d', fontSize: 18 }} />
          return <span style={{ color: '#999' }}>-</span>
        },
      },
    ]

    return (
      <Modal
        title={
          <Space>
            <PlayCircleOutlined style={{ color: '#1890ff' }} />
            <span>策略回放 - {replayModelName}</span>
          </Space>
        }
        open={replayVisible}
        onCancel={() => setReplayVisible(false)}
        width={800}
        footer={null}
      >
        {replaySummary && (
          <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
            <Row gutter={24} align="middle">
              <Col span={8}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>准确率</div>
                  <Progress
                    type="circle"
                    percent={Math.round(replaySummary.accuracy * 100)}
                    size={64}
                    strokeColor={replaySummary.accuracy >= 0.6 ? '#52c41a' : replaySummary.accuracy >= 0.4 ? '#faad14' : '#f5222d'}
                  />
                </div>
              </Col>
              <Col span={16}>
                <Row gutter={16}>
                  <Col span={8}>
                    <div style={{ fontSize: 12, color: '#999' }}>总预测</div>
                    <div style={{ fontWeight: 700, fontSize: 20 }}>{replaySummary.total}</div>
                  </Col>
                  <Col span={8}>
                    <div style={{ fontSize: 12, color: '#999' }}>正确</div>
                    <div style={{ fontWeight: 700, fontSize: 20, color: '#52c41a' }}>{replaySummary.correct}</div>
                  </Col>
                  <Col span={8}>
                    <div style={{ fontSize: 12, color: '#999' }}>回放天数</div>
                    <div style={{ fontWeight: 700, fontSize: 20 }}>{replaySummary.days}</div>
                  </Col>
                </Row>
              </Col>
            </Row>
          </Card>
        )}

        <Table
          columns={columns}
          dataSource={replayItems}
          rowKey="id"
          loading={replayLoading}
          size="small"
          pagination={{ pageSize: 10, size: 'small' }}
          scroll={{ x: 550 }}
          locale={{ emptyText: '暂无回放数据' }}
        />
      </Modal>
    )
  }

  const renderSidebar = () => (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <DailyGuess compact />

      {/* 跟单预测 - 我订阅的用户 */}
      <Card
        title={
          <Space>
            <BellOutlined style={{ color: '#1890ff' }} />
            <span>跟单预测</span>
          </Space>
        }
        size="small"
      >
        {subscriptions.length === 0 ? (
          <Empty description="暂未订阅任何用户" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            size="small"
            dataSource={subscriptions}
            renderItem={(sub) => (
              <List.Item style={{ padding: '8px 0' }}>
                <List.Item.Meta
                  avatar={
                    <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>
                      {sub.nickname?.[0] || sub.username?.[0] || '?'}
                    </Avatar>
                  }
                  title={
                    <span style={{ fontSize: 13 }}>{sub.nickname || sub.username}</span>
                  }
                  description={
                    sub.latest_prediction ? (
                      <Space size={4}>
                        <Tag
                          color={getDirectionColor(sub.latest_prediction.direction ?? 'flat')}
                          style={{ fontSize: 10, lineHeight: '14px', padding: '0 3px' }}
                        >
                          {getDirectionLabel(sub.latest_prediction.direction ?? 'flat')}
                        </Tag>
                        <span style={{ fontSize: 11, color: '#999' }}>
                          {sub.latest_prediction.stock_name || sub.latest_prediction.stock_code}
                        </span>
                      </Space>
                    ) : (
                      <span style={{ fontSize: 12, color: '#bbb' }}>暂无预测</span>
                    )
                  }
                />
                <Button
                  size="small"
                  type="text"
                  danger
                  onClick={() => handleSubscribe(sub.user_id)}
                >
                  取消
                </Button>
              </List.Item>
            )}
          />
        )}
      </Card>

      <Card
        title={
          <Space>
            <TeamOutlined style={{ color: '#1890ff' }} />
            <span>关注动态</span>
          </Space>
        }
        size="small"
      >
        {followingUpdates.length === 0 ? (
          <Empty description="暂无动态" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            size="small"
            dataSource={followingUpdates}
            renderItem={(update) => (
              <List.Item style={{ padding: '8px 0' }}>
                <List.Item.Meta
                  avatar={
                    <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>
                      {update.username?.[0] || '?'}
                    </Avatar>
                  }
                  title={
                    <span style={{ fontSize: 13 }}>
                      {update.nickname || update.username}
                    </span>
                  }
                  description={
                    <span style={{ fontSize: 12, color: '#999' }}>
                      {update.description}
                    </span>
                  }
                />
                <span style={{ fontSize: 11, color: '#bbb', whiteSpace: 'nowrap' }}>
                  {formatTime(update.created_at)}
                </span>
              </List.Item>
            )}
          />
        )}
      </Card>

      <Card
        title={
          <Space>
            <TrophyOutlined style={{ color: '#faad14' }} />
            <span>积分排行榜</span>
          </Space>
        }
        size="small"
      >
        <List
          size="small"
          dataSource={leaderboard}
          renderItem={(user, index) => (
            <List.Item style={{ padding: '6px 0' }}>
              <List.Item.Meta
                avatar={
                  <Avatar
                    size="small"
                    style={{
                      backgroundColor:
                        index === 0 ? '#f5222d' : index === 1 ? '#faad14' : index === 2 ? '#fa8c16' : '#1890ff',
                    }}
                  >
                    {index + 1}
                  </Avatar>
                }
                title={
                  <span style={{ fontSize: 13 }}>{user.username || `用户${user.user_id}`}</span>
                }
                description={
                  <Space size={4}>
                    <StarOutlined style={{ color: '#faad14', fontSize: 11 }} />
                    <span style={{ fontSize: 12 }}>{user.total_points} 积分</span>
                    <Tag style={{ fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>Lv.{user.level}</Tag>
                  </Space>
                }
              />
            </List.Item>
          )}
          locale={{ emptyText: '暂无排行数据' }}
        />
      </Card>
    </Space>
  )

  const tabItems = [
    {
      key: 'models',
      label: '模型广场',
      children: (
        <div>
          <Row gutter={[16, 12]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8}>
              <Input.Search
                placeholder="搜索模型名称或描述"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onSearch={() => fetchModels()}
                enterButton={<SearchOutlined />}
                allowClear
              />
            </Col>
            <Col xs={12} sm={8}>
              <Select
                style={{ width: '100%' }}
                options={TYPE_OPTIONS}
                value={modelType}
                onChange={(val) => setModelType(val)}
              />
            </Col>
            <Col xs={12} sm={8}>
              <Select
                style={{ width: '100%' }}
                options={SORT_OPTIONS}
                value={sortBy}
                onChange={(val) => setSortBy(val)}
              />
            </Col>
          </Row>
          {renderModelSquare()}
        </div>
      ),
    },
    {
      key: 'predictions',
      label: '预测分享',
      children: (
        <div>
          <Row gutter={[16, 12]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8}>
              <Select
                style={{ width: '100%' }}
                options={PREDICTION_SORT_OPTIONS}
                value={predictionSortBy}
                onChange={(val) => setPredictionSortBy(val)}
              />
            </Col>
          </Row>
          {renderPredictionShare()}
        </div>
      ),
    },
    {
      key: 'leaderboard',
      label: (
        <Space size={4}>
          <TrophyOutlined />
          <span>排行榜</span>
        </Space>
      ),
      children: renderLeaderboard(),
    },
  ]

  if (initialLoading) {
    return (
      <div>
        <Row gutter={[24, 24]}>
          <Col xs={24} lg={17}>
            <Card>
              <Skeleton active paragraph={{ rows: 2 }} style={{ marginBottom: 16 }} />
              <Row gutter={[16, 16]}>
                {[1, 2].map((i) => (
                  <Col xs={24} sm={12} key={i}>
                    <Card><Skeleton active paragraph={{ rows: 3 }} /></Card>
                  </Col>
                ))}
              </Row>
            </Card>
          </Col>
          <Col xs={24} lg={7}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card size="small"><Skeleton active paragraph={{ rows: 2 }} /></Card>
              <Card size="small"><Skeleton active paragraph={{ rows: 4 }} /></Card>
            </Space>
          </Col>
        </Row>
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title">社区</h1>
      <p className="page-description">
        浏览社区共享的预测模型与预测分享，发现优质策略，参与每日一猜。
      </p>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={17}>
          <Card>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={tabItems}
            />
          </Card>
        </Col>

        <Col xs={24} lg={7}>
          {renderSidebar()}
        </Col>
      </Row>

      {renderReplayModal()}
    </div>
  )
}

export default Community
