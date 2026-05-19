import React, { useEffect, useState } from 'react'
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Popconfirm,
  message,
  Tooltip,
  Badge,
  Row,
  Col,
  Statistic,
  Segmented,
  Modal,
  Input,
  Radio,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  PushpinOutlined,
  PushpinFilled,
  HeartOutlined,
  HeartFilled,
  SendOutlined,
  GlobalOutlined,
  LinkOutlined,
  LockOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { modelApi, trainingApi, communityApi } from '@/services/api'
import { UserModel } from '@/types'
import MascotBull from '@/components/MascotBull'

const ModelList: React.FC = () => {
  const navigate = useNavigate()
  const [models, setModels] = useState<UserModel[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<string>('全部')
  const [publishedModelIds, setPublishedModelIds] = useState<Set<number>>(new Set())

  // 发布弹窗状态
  const [publishModalVisible, setPublishModalVisible] = useState(false)
  const [publishingModel, setPublishingModel] = useState<UserModel | null>(null)
  const [publishDescription, setPublishDescription] = useState('')
  const [publishVisibility, setPublishVisibility] = useState<string>('public')
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    fetchModels()
    fetchPublishedModelIds()
  }, [])

  const fetchModels = async () => {
    setLoading(true)
    try {
      const data: any = await modelApi.getModels()
      setModels(data?.items || (Array.isArray(data) ? data : []))
    } catch (error) {
      message.error('获取模型列表失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchPublishedModelIds = async () => {
    try {
      const data: any = await communityApi.getModels({ page_size: 100 })
      const items = data?.items || (Array.isArray(data) ? data : [])
      const ids = new Set<number>(items.map((m: any) => m.source_model_id as number).filter(Boolean))
      setPublishedModelIds(ids)
    } catch {
      // 静默处理：发布状态获取失败不影响主流程
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await modelApi.deleteModel(id)
      message.success('删除成功')
      fetchModels()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleClone = async (model: UserModel) => {
    try {
      const result: any = await modelApi.cloneModel(model.id, `${model.name}_副本`)
      if (result.success) {
        message.success('克隆成功')
        fetchModels()
      }
    } catch (error) {
      message.error('克隆失败')
    }
  }

  const getEstimatedTime = (modelType: string) => {
    const deepLearningTypes = ['lstm', 'gru']
    const treeTypes = ['xgboost', 'lightgbm', 'randomforest']
    const lower = modelType.toLowerCase()
    if (deepLearningTypes.includes(lower)) return '深度学习模型通常需要 3-15 分钟'
    if (lower === 'mlp') return 'MLP模型通常需要 2-10 分钟'
    if (treeTypes.includes(lower)) return '树模型通常需要 1-5 分钟'
    return '训练通常需要 1-15 分钟'
  }

  const handleTrain = (model: UserModel) => {
    Modal.confirm({
      title: '确认开始训练',
      content: (
        <div>
          <p>即将训练模型：<strong>{model.name}</strong></p>
          <p>预估训练时间：{getEstimatedTime(model.model_type)}</p>
          <p style={{ color: '#999', fontSize: 12 }}>训练期间请勿关闭页面</p>
        </div>
      ),
      okText: '开始训练',
      cancelText: '取消',
      onOk: async () => {
        try {
          await trainingApi.createTask({
            model_id: model.id,
            config: {},
          })
          message.success('训练任务已创建')
          navigate('/training')
        } catch (error) {
          message.error('创建训练任务失败')
        }
      },
    })
  }

  const handlePin = async (model: UserModel) => {
    try {
      if (model.is_pinned) {
        await modelApi.unpinModel(model.id)
        message.success('已取消置顶')
      } else {
        await modelApi.pinModel(model.id)
        message.success('已置顶')
      }
      fetchModels()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleFavorite = async (model: UserModel) => {
    try {
      if (model.is_favorited) {
        await modelApi.unfavoriteModel(model.id)
        message.success('已取消收藏')
      } else {
        await modelApi.favoriteModel(model.id)
        message.success('已收藏')
      }
      fetchModels()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const openPublishModal = (model: UserModel) => {
    setPublishingModel(model)
    setPublishDescription(model.description || '')
    setPublishVisibility('public')
    setPublishModalVisible(true)
  }

  const handlePublish = async () => {
    if (!publishingModel) return
    setPublishing(true)
    try {
      await communityApi.publishModel({
        model_id: publishingModel.id,
        description: publishDescription,
        visibility: publishVisibility,
      })
      message.success('发布到社区成功，+10积分')
      setPublishModalVisible(false)
      fetchModels()
      fetchPublishedModelIds()
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      if (detail) {
        message.error(detail)
      } else {
        message.error('发布失败')
      }
    } finally {
      setPublishing(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { status: string; text: string }> = {
      draft: { status: 'default', text: '草稿' },
      trained: { status: 'success', text: '已训练' },
      deployed: { status: 'processing', text: '已部署' },
    }
    const config = statusMap[status] || { status: 'default', text: status }
    return <Badge status={config.status as any} text={config.text} />
  }

  const getModelTypeTag = (type: string) => {
    const colors: Record<string, string> = {
      lstm: 'blue',
      gru: 'cyan',
      xgboost: 'green',
      lightgbm: 'lime',
      randomforest: 'orange',
      mlp: 'purple',
    }
    return <Tag color={colors[type] || 'default'}>{type.toUpperCase()}</Tag>
  }

  const filteredModels = models.filter((m) => {
    if (filter === '收藏') return m.is_favorited
    if (filter === '置顶') return m.is_pinned
    return true
  })

  const columns = [
    {
      title: '',
      key: 'actions_quick',
      width: 80,
      render: (_: any, record: UserModel) => (
        <Space size={0}>
          <Tooltip title={record.is_pinned ? '取消置顶' : '置顶'}>
            <Button
              type="text"
              size="small"
              icon={record.is_pinned ? <PushpinFilled style={{ color: '#1890ff' }} /> : <PushpinOutlined />}
              onClick={() => handlePin(record)}
            />
          </Tooltip>
          <Tooltip title={record.is_favorited ? '取消收藏' : '收藏'}>
            <Button
              type="text"
              size="small"
              icon={record.is_favorited ? <HeartFilled style={{ color: '#eb2f96' }} /> : <HeartOutlined />}
              onClick={() => handleFavorite(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '模型名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: UserModel) => (
        <div>
          <div style={{ fontWeight: 500 }}>
            {record.is_pinned && <PushpinFilled style={{ color: '#1890ff', marginRight: 4 }} />}
            {name}
          </div>
          <div style={{ fontSize: 12, color: '#999' }}>
            {record.description || '暂无描述'}
          </div>
        </div>
      ),
    },
    {
      title: '模型类型',
      dataIndex: 'model_type',
      key: 'model_type',
      render: (type: string) => getModelTypeTag(type),
    },
    {
      title: '特征数',
      dataIndex: 'features',
      key: 'features',
      render: (features: string[]) => (
        <Tooltip title={features.join(', ')}>
          <Tag>{features.length}个特征</Tag>
        </Tooltip>
      ),
    },
    {
      title: '预测目标',
      dataIndex: 'target',
      key: 'target',
      width: 120,
      render: (target: string) => {
        const targetMap: Record<string, string> = {
          'next_day_direction': '次日涨跌',
          'next_day_return': '次日收益率',
          'next_day_ohlc': '次日OHLC',
          'price_change_5d': '5日变化',
          'trend_30d': '30日趋势',
          'trend_60d': '60日趋势',
          'trend_90d': '90日趋势',
          'time_to_gain_pct': '涨幅时间',
          'multi_feature_next_day': '多维数据',
        }
        return <Tag color="blue">{targetMap[target] || target}</Tag>
      },
    },
    {
      title: '训练股票',
      dataIndex: 'stock_codes',
      key: 'stock_codes',
      width: 150,
      render: (codes: string[]) => {
        if (!codes || codes.length === 0) return '-'
        const display = codes.length > 2 ? `${codes.slice(0, 2).join(', ')} +${codes.length - 2}` : codes.join(', ')
        return <span>{display}</span>
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusBadge(status),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: UserModel) => (
        <Space>
          <Tooltip title="编辑">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => navigate(`/models/build/${record.id}`)}
            />
          </Tooltip>
          <Tooltip title="克隆">
            <Button
              type="text"
              icon={<CopyOutlined />}
              onClick={() => handleClone(record)}
            />
          </Tooltip>
          <Tooltip title="训练">
            <Button
              type="text"
              icon={<PlayCircleOutlined />}
              onClick={() => handleTrain(record)}
            />
          </Tooltip>
          {record.status === 'trained' && (
            publishedModelIds.has(record.id) ? (
              <Tag color="green" style={{ marginLeft: 4 }}>已发布</Tag>
            ) : (
              <Tooltip title="发布到社区">
                <Button
                  type="text"
                  icon={<SendOutlined />}
                  onClick={() => openPublishModal(record)}
                />
              </Tooltip>
            )
          )}
          <Popconfirm
            title="确认删除"
            description="删除后无法恢复，是否继续？"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const draftCount = models.filter((m) => m.status === 'draft').length
  const trainedCount = models.filter((m) => m.status === 'trained').length
  const deployedCount = models.filter((m) => m.status === 'deployed').length

  return (
    <div>
      <h1 className="page-title">模型管理</h1>
      <p className="page-description">
        管理您的预测模型，创建新模型或编辑现有模型配置。
      </p>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="草稿模型"
              value={draftCount}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="已训练模型"
              value={trainedCount}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="已部署模型"
              value={deployedCount}
              prefix={<RobotOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="模型列表"
        extra={
          <Space>
            <Segmented
              options={['全部', '收藏', '置顶']}
              value={filter}
              onChange={(v) => setFilter(v as string)}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/models/build')}
            >
              创建模型
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredModels}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{
            emptyText: (
              <div style={{ padding: '24px 0' }}>
                <MascotBull mood="chill" size="medium" message="还没有模型？牛牛等你来创建" />
              </div>
            ),
          }}
        />
      </Card>

      {/* 发布到社区弹窗 */}
      <Modal
        title="发布到社区"
        open={publishModalVisible}
        onCancel={() => setPublishModalVisible(false)}
        onOk={handlePublish}
        confirmLoading={publishing}
        okText="发布"
        width={480}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>模型名称</div>
            <div style={{ color: '#999' }}>{publishingModel?.name}</div>
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>描述（可选）</div>
            <Input.TextArea
              rows={3}
              value={publishDescription}
              onChange={(e) => setPublishDescription(e.target.value)}
              placeholder="为你的模型添加描述..."
            />
          </div>
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>可见性</div>
            <Radio.Group
              value={publishVisibility}
              onChange={(e) => setPublishVisibility(e.target.value)}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="public">
                <Space>
                  <GlobalOutlined />
                  公开
                </Space>
              </Radio.Button>
              <Radio.Button value="link">
                <Space>
                  <LinkOutlined />
                  链接可见
                </Space>
              </Radio.Button>
              <Radio.Button value="private">
                <Space>
                  <LockOutlined />
                  私密
                </Space>
              </Radio.Button>
            </Radio.Group>
            <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
              {publishVisibility === 'public' && '所有人都可以在社区广场看到你的模型'}
              {publishVisibility === 'link' && '模型不会出现在广场列表，但通过链接可以访问'}
              {publishVisibility === 'private' && '仅自己可见，适合暂存或测试'}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ModelList
