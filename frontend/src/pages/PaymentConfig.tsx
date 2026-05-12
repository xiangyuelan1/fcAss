import React, { useEffect, useState } from 'react'
import {
  Card,
  Form,
  Input,
  Button,
  message,
  Switch,
  InputNumber,
  Select,
  Table,
  Space,
  Tag,
} from 'antd'
import {
  SettingOutlined,
  PayCircleOutlined,
} from '@ant-design/icons'
import { paymentApi } from '@/services/api'

const PaymentConfigPage: React.FC = () => {
  const [configs, setConfigs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const res: any = await paymentApi.getConfig()
      if (res.success && res.data) {
        setConfigs(res.data)
        const active = res.data.find((c: any) => c.is_active)
        if (active) {
          form.setFieldsValue({
            name: active.name,
            gateway_url: active.gateway_url,
            pid: active.pid,
            secret_key: '',
            register_fee: active.register_fee,
            pay_type: active.pay_type,
            is_active: true,
          })
        }
      }
    } catch {
      message.error('加载支付配置失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (values: any) => {
    setSaving(true)
    try {
      const res: any = await paymentApi.saveConfig(values)
      if (res.success) {
        message.success('支付配置已保存')
        loadConfig()
      } else {
        message.error(res.message || '保存失败')
      }
    } catch {
      message.error('保存支付配置失败')
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '网关地址',
      dataIndex: 'gateway_url',
      key: 'gateway_url',
      render: (url: string) => <span style={{ fontSize: 12 }}>{url}</span>,
    },
    {
      title: '商户ID',
      dataIndex: 'pid',
      key: 'pid',
    },
    {
      title: '密钥',
      dataIndex: 'secret_key',
      key: 'secret_key',
      render: (key: string) => <Tag>{key}</Tag>,
    },
    {
      title: '注册费',
      dataIndex: 'register_fee',
      key: 'register_fee',
      render: (fee: number) => `¥${fee}`,
    },
    {
      title: '支付方式',
      dataIndex: 'pay_type',
      key: 'pay_type',
      render: (type: string) => {
        const map: Record<string, string> = { alipay: '支付宝', wxpay: '微信支付', qqpay: 'QQ钱包' }
        return map[type] || type
      },
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => active ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>,
    },
  ]

  return (
    <div>
      <h1 className="page-title">支付配置</h1>
      <p className="page-description">
        配置易支付聚合支付渠道，启用后用户注册需付费。
      </p>

      <Card
        title={
          <Space>
            <SettingOutlined />
            <span>支付渠道配置</span>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{
            name: '易支付',
            gateway_url: 'https://pay.space-xboard.ggff.net/',
            pid: '1002',
            secret_key: '',
            register_fee: 1.00,
            pay_type: 'alipay',
            is_active: true,
          }}
        >
          <Form.Item name="name" label="配置名称" rules={[{ required: true }]}>
            <Input placeholder="如：易支付" />
          </Form.Item>

          <Form.Item name="gateway_url" label="支付网关地址" rules={[{ required: true }]}>
            <Input placeholder="https://pay.example.com/" />
          </Form.Item>

          <Form.Item name="pid" label="商户ID (PID)" rules={[{ required: true }]}>
            <Input placeholder="1001" />
          </Form.Item>

          <Form.Item name="secret_key" label="商户密钥 (Key)" rules={[{ required: true, message: '请输入商户密钥' }]}>
            <Input.Password placeholder="输入商户密钥" />
          </Form.Item>

          <Form.Item name="register_fee" label="注册费用（元）" rules={[{ required: true }]}>
            <InputNumber min={0.01} step={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="pay_type" label="默认支付方式" rules={[{ required: true }]}>
            <Select options={[
              { label: '支付宝', value: 'alipay' },
              { label: '微信支付', value: 'wxpay' },
              { label: 'QQ钱包', value: 'qqpay' },
            ]} />
          </Form.Item>

          <Form.Item name="is_active" label="启用付费注册" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving} icon={<PayCircleOutlined />}>
              保存配置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="已有配置">
        <Table
          columns={columns}
          dataSource={configs}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>
    </div>
  )
}

export default PaymentConfigPage
