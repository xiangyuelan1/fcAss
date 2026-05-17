import React, { useEffect, useState } from 'react'
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
  message,
} from 'antd'
import {
  HeartOutlined,
  CopyOutlined,
  GlobalOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  StarOutlined,
  RiseOutlined,
  FallOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { communityApi, pointsApi } from '@/services/api'
import { CommunityModel, CommunitySignal, UserPoints } from '@/types'

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

const Community: React.FC = () => {
  const navigate = useNavigate()
  const [models, setModels] = useState<CommunityModel[]>([])
  const [signals, setSignals] = useState<CommunitySignal[]>([])
  const [leaderboard, setLeaderboard] = useState<UserPoints[]>([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [modelType, setModelType] = useState('')
  const [sortBy, setSortBy] = useState('newest')

  useEffect(() => {
    fetchModels()
    fetchSignals()
    fetchLeaderboard()
  }, [])

  const fetchModels = async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (searchText) params.search = searchText
      if (modelType) params.model_type = modelType
      if (sortBy) params.sort_by = sortBy
      const data = await communityApi.getModels(params)
      const items = (data as any)?.items || (Array.isArray(data) ? data : [])
      setModels(items)
    } catch (error) {
      message.error('获取模型列表失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchSignals = async () => {
    try {
      const data = await communityApi.getSignals({ page_size: 10 })
      setSignals((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch (error) {
      message.error('获取信号列表失败')
    }
  }

  const fetchLeaderboard = async () => {
    try {
      const data = await pointsApi.getLeaderboard({ page_size: 10 })
      setLeaderboard((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch (error) {
      message.error('获取排行榜失败')
    }
  }

  const handleSearch = () => {
    fetchModels()
  }

  const handleLike = async (id: number) => {
    try {
      await communityApi.likeModel(id)
      fetchModels()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleClone = async (id: number) => {
    try {
      await communityApi.cloneModel(id)
      message.success('克隆成功，已添加到我的模型')
      fetchModels()
    } catch (error) {
      message.error('克隆失败')
    }
  }

  const getDirectionIcon = (direction: string) => {
    if (direction === 'up') return <RiseOutlined style={{ color: '#f5222d' }} />
    if (direction === 'down') return <FallOutlined style={{ color: '#52c41a' }} />
    return <GlobalOutlined />
  }

  const getDirectionText = (direction: string) => {
    if (direction === 'up') return '看涨'
    if (direction === 'down') return '看跌'
    return '震荡'
  }

  return (
    <div>
      <h1 className="page-title">模型广场</h1>
      <p className="page-description">
        浏览社区共享的预测模型，发现优质策略，克隆模型或发起PK挑战。
      </p>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Input.Search
            placeholder="搜索模型名称或描述"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={handleSearch}
            enterButton={<SearchOutlined />}
            allowClear
          />
        </Col>
        <Col xs={12} sm={8}>
          <Select
            style={{ width: '100%' }}
            options={TYPE_OPTIONS}
            value={modelType}
            onChange={(val) => {
              setModelType(val)
              setTimeout(fetchModels, 0)
            }}
          />
        </Col>
        <Col xs={12} sm={8}>
          <Select
            style={{ width: '100%' }}
            options={SORT_OPTIONS}
            value={sortBy}
            onChange={(val) => {
              setSortBy(val)
              setTimeout(fetchModels, 0)
            }}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Spin spinning={loading}>
            {models.length === 0 && !loading ? (
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
                                handleLike(model.id)
                              }}
                            >
                              <HeartOutlined /> {model.likes_count}
                            </span>
                            <span
                              style={{ cursor: 'pointer', color: '#999' }}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleClone(model.id)
                              }}
                            >
                              <CopyOutlined /> {model.clones_count}
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
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <ThunderboltOutlined style={{ color: '#faad14' }} />
                <span>热门预测信号</span>
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            <List
              dataSource={signals}
              renderItem={(signal) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={getDirectionIcon(signal.direction)}
                    title={
                      <Space>
                        <span>{signal.stock_code}</span>
                        <Tag color={signal.direction === 'up' ? 'red' : signal.direction === 'down' ? 'green' : 'default'}>
                          {getDirectionText(signal.direction)}
                        </Tag>
                        {signal.confidence !== undefined && (
                          <Tag color="blue">置信度 {(signal.confidence * 100).toFixed(0)}%</Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Space size={4}>
                        <span style={{ fontSize: 12 }}>{signal.author?.username || '匿名'}</span>
                        <span style={{ fontSize: 12, color: '#999' }}>
                          {signal.prediction_date}
                        </span>
                      </Space>
                    }
                  />
                </List.Item>
              )}
              locale={{ emptyText: '暂无信号' }}
            />
          </Card>

          <Card
            title={
              <Space>
                <TrophyOutlined style={{ color: '#faad14' }} />
                <span>积分排行榜</span>
              </Space>
            }
          >
            <List
              dataSource={leaderboard}
              renderItem={(user, index) => (
                <List.Item>
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
                    title={user.username || `用户${user.user_id}`}
                    description={
                      <Space>
                        <StarOutlined style={{ color: '#faad14' }} />
                        <span>{user.total_points} 积分</span>
                        <Tag>Lv.{user.level}</Tag>
                      </Space>
                    }
                  />
                </List.Item>
              )}
              locale={{ emptyText: '暂无排行数据' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Community
