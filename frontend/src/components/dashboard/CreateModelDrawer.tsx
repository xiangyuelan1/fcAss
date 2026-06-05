import React, { useState } from 'react'
import { Drawer, Form, Input, Select, Button, Space, Alert, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { modelApi, trainingApi } from '@/services/api'
import { CreateModelDrawerProps } from './types'

/* 预测目标选项 */
const TARGET_OPTIONS = [
  { label: '次日涨跌方向', value: 'next_day_direction' },
  { label: '次日收益率', value: 'next_day_return' },
  { label: '次日OHLC', value: 'next_day_ohlc' },
  { label: '5日价格变化', value: 'price_change_5d' },
  { label: '30日趋势', value: 'trend_30d' },
]

/* 模型算法选项 */
const MODEL_TYPE_OPTIONS = [
  { label: 'MLP', value: 'mlp' },
  { label: 'XGBoost', value: 'xgboost' },
  { label: 'LSTM', value: 'lstm' },
  { label: 'GRU', value: 'gru' },
  { label: 'LightGBM', value: 'lightgbm' },
  { label: 'RandomForest', value: 'randomforest' },
]

/**
 * 创建模型抽屉
 * 提供简化版表单用于快速创建模型并自动启动训练。
 */
const CreateModelDrawer: React.FC<CreateModelDrawerProps> = ({
  visible,
  onClose,
  onCreate,
}) => {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [creating, setCreating] = useState(false)

  const handleClose = () => {
    form.resetFields()
    onClose()
  }

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      setCreating(true)
      const stockCodes = values.stock_codes
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
      const modelData = (await modelApi.createModel({
        name: values.name,
        config: {
          model_type: values.model_type,
          features: ['close', 'volume', 'ma_5', 'ma_10', 'ma_20', 'rsi_14', 'macd'],
          target: values.target,
          stock_codes: stockCodes,
        },
      })) as unknown as { id: number }
      message.success('模型创建成功，正在启动训练...')
      form.resetFields()
      onClose()
      // 自动创建训练任务
      try {
        await trainingApi.createTask({ model_id: modelData.id })
        message.success('训练任务已创建')
      } catch {
        message.warning('训练任务创建失败，请手动启动训练')
      }
      onCreate()
    } catch (err: unknown) {
      const error = err as { errorFields?: unknown; response?: { data?: { detail?: string } }; message?: string }
      if (error?.errorFields) return
      const detail = error?.response?.data?.detail || error?.message
      message.error(detail || '创建模型失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Drawer
      title="创建新模型"
      open={visible}
      onClose={handleClose}
      width={420}
      extra={
        <Space>
          <Button onClick={handleClose}>取消</Button>
          <Button type="primary" loading={creating} onClick={handleCreate}>创建并训练</Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ model_type: 'xgboost', target: 'next_day_direction' }}
      >
        <Form.Item name="name" label="模型名称" rules={[{ required: true, message: '请输入模型名称' }]}>
          <Input placeholder="如：我的第一个预测模型" />
        </Form.Item>
        <Form.Item name="model_type" label="算法类型" rules={[{ required: true, message: '请选择算法类型' }]}>
          <Select options={MODEL_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item name="stock_codes" label="训练股票（逗号分隔）" rules={[{ required: true, message: '请输入至少一个股票代码' }]}>
          <Input placeholder="如：000001,600519,000858" />
        </Form.Item>
        <Form.Item name="target" label="预测目标" rules={[{ required: true, message: '请选择预测目标' }]}>
          <Select options={TARGET_OPTIONS} />
        </Form.Item>
      </Form>
      <Alert
        message="这是简化版创建表单，仅配置核心参数。如需完整配置（特征选择、参数调优等），请前往模型构建页面。"
        type="info"
        showIcon
        style={{ marginTop: 8 }}
      />
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Button type="link" onClick={() => { handleClose(); navigate('/models/build') }}>
          前往完整配置 →
        </Button>
      </div>
    </Drawer>
  )
}

export default CreateModelDrawer
