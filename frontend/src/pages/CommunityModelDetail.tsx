import React, { useEffect, useState } from 'react'
import {
  Card,
  Row,
  Col,
  Tag,
  Button,
  Space,
  Statistic,
  Descriptions,
  List,
  Spin,
  message,
  Avatar,
} from 'antd'
import {
  HeartOutlined,
  HeartFilled,
  CopyOutlined,
  ThunderboltOutlined,
  ArrowLeftOutlined,
  RiseOutlined,
  FallOutlined,
  GlobalOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { communityApi } from '@/services/api'
import { CommunityModel, CommunitySignal } from '@/types'

const MODEL_TYPE_COLORS: Record<string, string> = {
  lstm: 'blue',
  gru: 'cyan',
  xgboost: 'green',
  lightgbm: 'lime',
  randomforest: 'orange',
  mlp: 'purple',
}

const CommunityModelDetail: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [model, setModel] = useState<CommunityModel | null>(null)
  const [signals, setSignals] = useState<CommunitySignal[]>([])
  const [loading, setLoading] = useState(false)
  const [liking, setLiking] = useState(false)
  const [cloning, setCloning] = useState(false)

  useEffect(() => {
    if (id) {
      fetchModel()
      fetchSignals()
    }
  }, [id])

  const fetchModel = async () => {
    setLoading(true)
    try {
      const data = await communityApi.getModel(Number(id))
      setModel(data as any)
    } catch (error) {
      message.error('获取模型详情失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchSignals = async () => {
    try {
      const data = await communityApi.getSignals({ community_model_id: Number(id), page_size: 20 })
      setSignals((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch (error) {
      message.error('获取信号列表失败')
    }
  }

  const handleLike = async () => {
    if (!model) return
    setLiking(true)
    try {
      await communityApi.likeModel(model.id)
      fetchModel()
    } catch (error) {
      message.error('操作失败')
    } finally {
      setLiking(false)
    }
  }

  const handleClone = async () => {
    if (!model) return
    setCloning(true)
    try {
      await communityApi.cloneModel(model.id)
      message.success('克隆成功，已添加到我的模型')
      fetchModel()
    } catch (error) {
      message.error('克隆失败')
    } finally {
      setCloning(false)
    }
  }

  const handlePK = async () => {
    navigate('/community/pk')
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

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!model) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <p>模型不存在</p>
        <Button onClick={() => navigate('/community')}>返回社区</Button>
      </div>
    )
  }

  return (
    <div>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/community')}
        style={{ paddingLeft: 0, marginBottom: 16 }}
      >
        返回模型广场
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center" size={16}>
              <h2 style={{ margin: 0 }}>{model.name}</h2>
              <Tag color={MODEL_TYPE_COLORS[model.model_type] || 'default'}>
                {model.model_type.toUpperCase()}
              </Tag>
            </Space>
            <div style={{ marginTop: 8, color: '#999' }}>
              {model.description || '暂无描述'}
            </div>
            <div style={{ marginTop: 8 }}>
              <Space>
                <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>
                  {model.author?.username?.[0] || '?'}
                </Avatar>
                <span>{model.author?.username || '匿名'}</span>
                <span style={{ color: '#999' }}>
                  发布于 {new Date(model.created_at).toLocaleDateString()}
                </span>
              </Space>
            </div>
          </Col>
          <Col>
            <Space>
              <Button
                icon={model.is_liked ? <HeartFilled style={{ color: '#eb2f96' }} /> : <HeartOutlined />}
                onClick={handleLike}
                loading={liking}
              >
                {model.likes_count} 点赞
              </Button>
              <Button
                icon={<CopyOutlined />}
                onClick={handleClone}
                loading={cloning}
              >
                {model.clones_count} 克隆
              </Button>
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={handlePK}
              >
                发起PK
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {model.metrics && Object.keys(model.metrics).length > 0 && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {Object.entries(model.metrics).map(([key, value]) => (
            <Col xs={12} sm={8} md={6} key={key}>
              <Card>
                <Statistic
                  title={key}
                  value={typeof value === 'number' && value <= 1 ? (value * 100).toFixed(2) : value}
                  suffix={typeof value === 'number' && value <= 1 ? '%' : ''}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={14}>
          <Card title="模型配置">
            <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
              <Descriptions.Item label="模型类型">
                <Tag color={MODEL_TYPE_COLORS[model.model_type] || 'default'}>
                  {model.model_type.toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="预测目标">{model.target}</Descriptions.Item>
              <Descriptions.Item label="训练股票">
                <Space size={4} wrap>
                  {model.stock_codes.map((code) => (
                    <Tag key={code}>{code}</Tag>
                  ))}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="训练日期范围">
                {model.train_date_range?.start || '未设置'} ~ {model.train_date_range?.end || '未设置'}
              </Descriptions.Item>
              {Object.entries(model.model_params).map(([key, value]) => (
                <Descriptions.Item label={key} key={key}>
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="特征列表">
            <Space size={[8, 8]} wrap>
              {model.features.map((feature) => (
                <Tag key={feature} color="blue">{feature}</Tag>
              ))}
            </Space>
            {model.features.length === 0 && (
              <div style={{ color: '#999' }}>暂无特征信息</div>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="预测信号">
        <List
          dataSource={signals}
          renderItem={(signal) => (
            <List.Item
              actions={[
                <span key="likes" style={{ color: '#999' }}>
                  <HeartOutlined /> {signal.likes_count}
                </span>,
              ]}
            >
              <List.Item.Meta
                avatar={getDirectionIcon(signal.direction)}
                title={
                  <Space>
                    <span>{signal.stock_code}</span>
                    {signal.stock_name && <span style={{ color: '#999' }}>{signal.stock_name}</span>}
                    <Tag color={signal.direction === 'up' ? 'red' : signal.direction === 'down' ? 'green' : 'default'}>
                      {getDirectionText(signal.direction)}
                    </Tag>
                    {signal.confidence !== undefined && (
                      <Tag color="blue">置信度 {(signal.confidence * 100).toFixed(0)}%</Tag>
                    )}
                    {signal.is_correct !== undefined && (
                      <Tag color={signal.is_correct ? 'success' : 'error'}>
                        {signal.is_correct ? '正确' : '错误'}
                      </Tag>
                    )}
                  </Space>
                }
                description={
                  <Space size={8}>
                    <span style={{ fontSize: 12 }}>{signal.author?.username || '匿名'}</span>
                    <span style={{ fontSize: 12, color: '#999' }}>{signal.prediction_date}</span>
                  </Space>
                }
              />
            </List.Item>
          )}
          locale={{ emptyText: '暂无预测信号' }}
        />
      </Card>
    </div>
  )
}

export default CommunityModelDetail
