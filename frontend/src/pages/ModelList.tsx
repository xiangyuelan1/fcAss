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
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { modelApi, trainingApi } from '@/services/api'
import { UserModel } from '@/types'

const ModelList: React.FC = () => {
  const navigate = useNavigate()
  const [models, setModels] = useState<UserModel[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchModels()
  }, [])

  const fetchModels = async () => {
    setLoading(true)
    try {
      const data = await modelApi.getModels()
      setModels(data)
    } catch (error) {
      message.error('获取模型列表失败')
    } finally {
      setLoading(false)
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
      const result = await modelApi.cloneModel(model.id, `${model.name}_副本`)
      if (result.success) {
        message.success('克隆成功')
        fetchModels()
      }
    } catch (error) {
      message.error('克隆失败')
    }
  }

  const handleTrain = async (model: UserModel) => {
    try {
      const result = await trainingApi.createTask({
        model_id: model.id,
        config: {},
      })
      message.success('训练任务已创建')
      navigate('/training')
    } catch (error) {
      message.error('创建训练任务失败')
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

  const columns = [
    {
      title: '模型名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: UserModel) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
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
      title: '训练股票',
      dataIndex: 'stock_codes',
      key: 'stock_codes',
      render: (codes: string[]) => (
        <Tooltip title={codes.join(', ')}>
          <Tag>{codes.length}只股票</Tag>
        </Tooltip>
      ),
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
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/models/build')}
          >
            创建模型
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={models}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  )
}

export default ModelList
