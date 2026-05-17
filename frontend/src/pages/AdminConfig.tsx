import React, { useEffect, useState } from 'react'
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  message,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  InputNumber,
  Popconfirm,
  Tooltip,
  Tabs,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SettingOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
  AppstoreOutlined,
  CopyOutlined,
} from '@ant-design/icons'
import { adminApi } from '@/services/api'
import { SystemConfigItem } from '@/types'

const { TextArea } = Input

const AdminConfig: React.FC = () => {
  const [configs, setConfigs] = useState<SystemConfigItem[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingConfig, setEditingConfig] = useState<SystemConfigItem | null>(null)
  const [form] = Form.useForm()
  const [activeTab, setActiveTab] = useState('model_type')

  useEffect(() => {
    fetchConfigs()
  }, [])

  const fetchConfigs = async () => {
    setLoading(true)
    try {
      const data = await adminApi.listConfigs()
      setConfigs(data)
    } catch (error: any) {
      if (error?.response?.status === 403) {
        message.error('需要管理员权限')
      } else {
        message.error('获取配置列表失败')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingConfig(null)
    form.resetFields()
    form.setFieldsValue({
      category: activeTab,
      is_active: true,
      sort_order: 0,
      value: '{}',
    })
    setModalVisible(true)
  }

  const handleEdit = (config: SystemConfigItem) => {
    setEditingConfig(config)
    form.setFieldsValue({
      category: config.category,
      name: config.name,
      key: config.key,
      description: config.description,
      value: JSON.stringify(config.value, null, 2),
      is_active: config.is_active,
      sort_order: config.sort_order,
    })
    setModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      let parsedValue
      try {
        parsedValue = JSON.parse(values.value)
      } catch {
        message.error('配置内容必须是有效的JSON格式')
        return
      }

      if (editingConfig) {
        await adminApi.updateConfig(editingConfig.id, {
          category: values.category,
          name: values.name,
          description: values.description,
          value: parsedValue,
          is_active: values.is_active,
          sort_order: values.sort_order,
        })
        message.success('配置更新成功')
      } else {
        await adminApi.createConfig({
          category: values.category,
          name: values.name,
          key: values.key,
          description: values.description,
          value: parsedValue,
          is_active: values.is_active,
          sort_order: values.sort_order,
        })
        message.success('配置创建成功')
      }
      setModalVisible(false)
      fetchConfigs()
    } catch (error: any) {
      if (error?.response?.data?.detail) {
        message.error(error.response.data.detail)
      }
    }
  }

  const handleDelete = async (configId: number) => {
    try {
      await adminApi.deleteConfig(configId)
      message.success('配置删除成功')
      fetchConfigs()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'model_type': return <ExperimentOutlined />
      case 'algorithm': return <ThunderboltOutlined />
      case 'param_template': return <AppstoreOutlined />
      default: return <SettingOutlined />
    }
  }

  const getCategoryName = (category: string) => {
    switch (category) {
      case 'model_type': return '模型类型'
      case 'algorithm': return '算法配置'
      case 'param_template': return '参数模板'
      default: return category
    }
  }

  const getColumns = () => [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: SystemConfigItem) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          <div style={{ fontSize: 12, color: '#999' }}>{record.key}</div>
        </div>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (desc: string | null) => desc || <Tag>无描述</Tag>,
    },
    {
      title: '配置内容',
      dataIndex: 'value',
      key: 'value',
      width: 300,
      render: (value: Record<string, any>, record: SystemConfigItem) => (
        <Tooltip title={<pre style={{ margin: 0, fontSize: 11 }}>{JSON.stringify(value, null, 2)}</pre>}>
          <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4, fontSize: 12, maxWidth: 280, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {JSON.stringify(value)}
          </code>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'success' : 'default'}>
          {isActive ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '排序',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 80,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: SystemConfigItem) => (
        <Space>
          <Tooltip title="编辑">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确认删除此配置？"
            onConfirm={() => handleDelete(record.id)}
          >
            <Tooltip title="删除">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const filteredConfigs = configs.filter(c => c.category === activeTab)

  return (
    <div>
      <h1 className="page-title">系统配置</h1>
      <p className="page-description">
        管理系统提供的模型类型、算法配置和参数模板。配置后普通用户可使用。
      </p>

      <Card
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchConfigs}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              新增配置
            </Button>
          </Space>
        }
      >
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          {
            key: 'model_type',
            label: <Space><ExperimentOutlined />模型类型</Space>,
          },
          {
            key: 'algorithm',
            label: <Space><ThunderboltOutlined />算法配置</Space>,
          },
          {
            key: 'param_template',
            label: <Space><AppstoreOutlined />参数模板</Space>,
          },
        ]} />

        <Table
          columns={getColumns()}
          dataSource={filteredConfigs}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      <Modal
        title={editingConfig ? '编辑配置' : '新增配置'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="category"
            label="分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select>
              <Select.Option value="model_type">模型类型</Select.Option>
              <Select.Option value="algorithm">算法配置</Select.Option>
              <Select.Option value="param_template">参数模板</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="name"
            label="配置名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：LSTM、XGBoost" />
          </Form.Item>
          {!editingConfig && (
            <Form.Item
              name="key"
              label="配置键（唯一标识）"
              rules={[{ required: true, message: '请输入配置键' }]}
            >
              <Input placeholder="如：lstm、xgboost_default" />
            </Form.Item>
          )}
          <Form.Item name="description" label="描述">
            <Input placeholder="配置描述（可选）" />
          </Form.Item>
          <Form.Item
            name="value"
            label="配置内容（JSON格式）"
            rules={[{ required: true, message: '请输入配置内容' }]}
            extra={
              <div style={{ marginTop: 4, color: '#999', fontSize: 12 }}>
                模型类型示例: {"{ \"framework\": \"pytorch\", \"default_params\": {\"hidden_size\": 64, \"num_layers\": 2} }"}
                <br />
                参数模板示例: {"{ \"learning_rate\": 0.001, \"batch_size\": 32, \"epochs\": 50 }"}
              </div>
            }
          >
            <TextArea rows={6} placeholder='{"key": "value"}' style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Space>
            <Form.Item name="is_active" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="sort_order" label="排序权重">
              <InputNumber min={0} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}

export default AdminConfig
