import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Steps,
  Button,
  Input,
  Select,
  Space,
  message,
  Row,
  Col,
  InputNumber,
  Slider,
  DatePicker,
  Tag,
  Collapse,
  Alert,
  Tooltip,
  Divider,
} from 'antd'
import {
  LeftOutlined,
  RightOutlined,
  SaveOutlined,
  SettingOutlined,
  DatabaseOutlined,
  ToolOutlined,
  RobotOutlined,
  BulbOutlined,
  InfoCircleOutlined,
  ExperimentOutlined,
  PlusOutlined,
  MinusCircleOutlined,
  AppstoreOutlined,
  CheckCircleFilled,
} from '@ant-design/icons'
import { modelApi, dataApi, featureApi } from '@/services/api'
import { ModelType, Indicator, Stock } from '@/types'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

const REFERENCE_PARAMS: Record<string, Record<string, any>> = {
  lstm: { hidden_size: 64, num_layers: 2, dropout: 0.2, sequence_length: 20, learning_rate: 0.001, epochs: 50, batch_size: 32 },
  gru: { hidden_size: 64, num_layers: 2, dropout: 0.2, sequence_length: 20, learning_rate: 0.001, epochs: 50, batch_size: 32 },
  xgboost: { n_estimators: 100, max_depth: 6, learning_rate: 0.1, subsample: 0.8, colsample_bytree: 0.8, reg_alpha: 0.0, reg_lambda: 1.0 },
  lightgbm: { n_estimators: 100, max_depth: -1, learning_rate: 0.1, num_leaves: 31, subsample: 0.8, colsample_bytree: 0.8, reg_alpha: 0.0, reg_lambda: 0.0 },
  randomforest: { n_estimators: 100, max_depth: 10, min_samples_split: 2, min_samples_leaf: 1, max_features: 'sqrt' },
  mlp: { hidden_layers: [128, 64], dropout: 0.2, learning_rate: 0.001, epochs: 50, batch_size: 32, activation: 'relu' },
}

const MODEL_INFO: Record<string, { desc: string; layers: { label: string; color: string; editable?: boolean }[] }> = {
  lstm: {
    desc: 'LSTM通过"遗忘门"和"记忆门"选择性地记住重要信息，适合捕捉股价的中长期趋势',
    layers: [
      { label: '输入序列', color: '#1890ff' },
      { label: 'LSTM层', color: '#fa8c16', editable: true },
      { label: 'Dropout', color: '#eb2f96' },
      { label: '全连接→输出', color: '#52c41a' },
    ],
  },
  gru: {
    desc: 'GRU是LSTM的简化版，参数更少训练更快，适合数据量不大的场景',
    layers: [
      { label: '输入序列', color: '#1890ff' },
      { label: 'GRU层', color: '#fa8c16', editable: true },
      { label: 'Dropout', color: '#eb2f96' },
      { label: '全连接→输出', color: '#52c41a' },
    ],
  },
  xgboost: {
    desc: 'XGBoost通过逐步拟合残差构建强学习器，对表格数据效果优异，训练快',
    layers: [
      { label: '输入特征', color: '#1890ff' },
      { label: '决策树×N', color: '#fa8c16', editable: true },
      { label: '加权投票', color: '#722ed1' },
      { label: '输出', color: '#52c41a' },
    ],
  },
  lightgbm: {
    desc: 'LightGBM基于直方图加速，训练速度极快，适合大规模数据',
    layers: [
      { label: '输入特征', color: '#1890ff' },
      { label: '叶子分裂×N', color: '#fa8c16', editable: true },
      { label: '输出', color: '#52c41a' },
    ],
  },
  randomforest: {
    desc: '随机森林通过多棵树投票降低过拟合，是最稳定的基线模型，推荐新手使用',
    layers: [
      { label: '输入特征', color: '#1890ff' },
      { label: '决策树×N(随机子集)', color: '#fa8c16', editable: true },
      { label: '多数投票', color: '#722ed1' },
      { label: '输出', color: '#52c41a' },
    ],
  },
  mlp: {
    desc: 'MLP是经典的前馈神经网络，通过多层非线性变换拟合复杂关系，可自定义层数和宽度',
    layers: [
      { label: '输入特征', color: '#1890ff' },
      { label: '隐藏层(可编辑)', color: '#fa8c16', editable: true },
      { label: '输出', color: '#52c41a' },
    ],
  },
}

const TARGET_TYPES = [
  { value: 'next_day_direction', label: '次日涨跌方向', desc: '预测明天涨还是跌（二分类）', type: '分类', tag: '推荐', color: 'green' },
  { value: 'next_day_return', label: '次日收益率', desc: '预测明天涨跌幅度（回归）', type: '回归', tag: '常用', color: 'blue' },
  { value: 'price_change_5d', label: '5日价格变化', desc: '预测未来5天累计变化率', type: '回归', tag: '', color: '' },
  { value: 'multi_feature_next_day', label: '次日多维数据', desc: '同时预测收益率+波动率+量变', type: '多维', tag: '高级', color: 'purple' },
]

const ModelBuilder: React.FC = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [modelTypes, setModelTypes] = useState<ModelType[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [aiOptimizing, setAiOptimizing] = useState(false)

  // 表单数据全部用state管理，不依赖ant Form的validateFields
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedModelType, setSelectedModelType] = useState<string>()
  const [modelConfig, setModelConfig] = useState<Record<string, any>>({})
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([])
  const [indicatorParams, setIndicatorParams] = useState<Record<string, Record<string, any>>>({})
  const [target, setTarget] = useState('next_day_direction')
  const [stockCodes, setStockCodes] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)

  useEffect(() => {
    fetchModelTypes()
    fetchIndicators()
    fetchStocks()
    if (id) fetchModelDetail()
  }, [id])

  const fetchModelTypes = async () => {
    try { const data: any = await modelApi.getModelTypes(); setModelTypes(data.types || []) } catch { message.error('获取模型类型失败') }
  }
  const fetchIndicators = async () => {
    try { const data: any = await featureApi.getIndicators(); setIndicators(data) } catch { message.error('获取指标列表失败') }
  }
  const fetchStocks = async () => {
    try { const data: any = await dataApi.getStocks(); setStocks(data) } catch { message.error('获取股票列表失败') }
  }
  const fetchModelDetail = async () => {
    try {
      const data: any = await modelApi.getModel(Number(id))
      setName(data.name || '')
      setDescription(data.description || '')
      setSelectedModelType(data.model_type)
      setModelConfig(data.model_config || data.model_params || {})
      setSelectedIndicators(data.features || [])
      setIndicatorParams(data.feature_config || {})
      setTarget(data.target || 'next_day_direction')
      setStockCodes(data.stock_codes || [])
      setDateRange(
        data.train_date_range
          ? [data.train_date_range.start ? dayjs(data.train_date_range.start) : null, data.train_date_range.end ? dayjs(data.train_date_range.end) : null]
          : null
      )
    } catch { message.error('获取模型详情失败') }
  }

  const handleSave = async () => {
    // 手动验证关键字段
    if (!name.trim()) { message.error('请输入模型名称'); setCurrentStep(0); return }
    if (!selectedModelType) { message.error('请选择模型类型'); setCurrentStep(1); return }
    if (selectedIndicators.length === 0) { message.error('请至少选择一个特征指标'); setCurrentStep(2); return }
    if (!target) { message.error('请选择预测目标'); setCurrentStep(3); return }
    if (stockCodes.length === 0) { message.error('请选择训练股票'); setCurrentStep(3); return }

    setSaving(true)
    try {
      const config = {
        name: name.trim(),
        description: description || '',
        config: {
          model_type: selectedModelType,
          model_params: modelConfig,
          features: selectedIndicators,
          feature_config: indicatorParams,
          target,
          target_config: {},
          stock_codes: stockCodes,
          train_date_range: dateRange
            ? { start: dateRange[0]?.format('YYYY-MM-DD'), end: dateRange[1]?.format('YYYY-MM-DD') }
            : undefined,
        },
      }

      if (id) {
        await modelApi.updateModel(Number(id), config)
      } else {
        await modelApi.createModel(config)
      }
      message.success(id ? '模型更新成功' : '模型创建成功')
      navigate('/models')
    } catch (error: any) {
      console.error('保存失败:', error)
      const detail = error?.response?.data?.detail
      if (Array.isArray(detail)) {
        message.error(detail.map((e: any) => e.msg).join('; '))
      } else if (typeof detail === 'string') {
        message.error(detail)
      } else {
        message.error('保存失败，请检查输入')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleIndicatorChange = (values: string[]) => {
    setSelectedIndicators(values)
    const newParams = { ...indicatorParams }
    values.forEach((key) => {
      const indicator = indicators.find((i: any) => (i as any).key === key || i.name === key)
      if (indicator && !newParams[key]) {
        newParams[key] = {}
        ;(indicator as any).params?.forEach((param: any) => { newParams[key][param.name] = param.default })
      }
    })
    Object.keys(newParams).forEach((key) => { if (!values.includes(key)) delete newParams[key] })
    setIndicatorParams(newParams)
  }

  const handleFillReferenceParams = () => {
    if (!selectedModelType) { message.warning('请先选择模型类型'); return }
    const refParams = REFERENCE_PARAMS[selectedModelType]
    if (refParams) { setModelConfig({ ...refParams }); message.success('已填入参考参数，确保模型可以正常运行') }
  }

  const handleAiOptimize = async () => {
    if (!selectedModelType) { message.warning('请先选择模型类型'); return }
    setAiOptimizing(true)
    try {
      const res: any = await modelApi.aiOptimizeParams({ model_type: selectedModelType, features: selectedIndicators, stock_codes: stockCodes })
      if (res.success && res.params) { setModelConfig(res.params); message.success('AI优化参数已应用') }
      else { message.warning(res.message || 'AI优化暂不可用') }
    } catch (error: any) {
      message.warning(typeof error?.response?.data?.detail === 'string' ? error.response.data.detail : 'AI优化暂不可用，请先配置AI接口')
    } finally { setAiOptimizing(false) }
  }

  const getIndicatorKey = (indicator: any): string => indicator.key || indicator.name.toLowerCase()
  const indicatorCategories = React.useMemo(() => {
    const cats: Record<string, Indicator[]> = {}
    indicators.forEach((ind: any) => { const cat = ind.category || '其他'; if (!cats[cat]) cats[cat] = []; cats[cat].push(ind) })
    return cats
  }, [indicators])

  const currentModelInfo = selectedModelType ? MODEL_INFO[selectedModelType] : null
  const currentModelTypeConfig = modelTypes.find((t: any) => (t as any).key === selectedModelType)

  // 步骤完成状态
  const stepStatus = [
    !!name.trim(),
    !!selectedModelType,
    selectedIndicators.length > 0,
    stockCodes.length > 0 && !!target,
  ]

  const steps = [
    {
      title: '基本信息',
      icon: stepStatus[0] ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : <SettingOutlined />,
      content: (
        <div style={{ maxWidth: 500, margin: '0 auto' }}>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontWeight: 600, fontSize: 16, display: 'block', marginBottom: 8 }}>
              给模型起个名字 <span style={{ color: '#f5222d' }}>*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：茅台趋势预测、大盘方向判断..."
              size="large"
              maxLength={50}
              showCount
            />
          </div>
          <div>
            <label style={{ fontWeight: 600, fontSize: 16, display: 'block', marginBottom: 8 }}>
              描述一下（可选）
            </label>
            <Input.TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="这个模型用来做什么？有什么特点？"
            />
          </div>
        </div>
      ),
    },
    {
      title: '选择模型',
      icon: stepStatus[1] ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : <RobotOutlined />,
      content: (
        <div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontWeight: 600, fontSize: 16, display: 'block', marginBottom: 8 }}>
              选择模型类型 <span style={{ color: '#f5222d' }}>*</span>
            </label>
            <Select
              value={selectedModelType}
              placeholder="点击选择模型类型"
              onChange={(val: string) => {
                setSelectedModelType(val)
                const refParams = REFERENCE_PARAMS[val]
                setModelConfig(refParams ? { ...refParams } : {})
              }}
              style={{ width: '100%' }}
              size="large"
              optionLabelProp="label"
            >
              {modelTypes.map((type: any) => (
                <Select.Option key={type.key} value={type.key} label={type.name}>
                  <div style={{ padding: '4px 0' }}>
                    <strong>{type.name}</strong>
                    <Tag style={{ marginLeft: 8 }}>{type.category}</Tag>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{type.description}</div>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </div>

          {selectedModelType && currentModelInfo && (
            <Card
              size="small"
              title={<Space><AppstoreOutlined /><span>模型结构</span></Space>}
              style={{ marginBottom: 16, background: '#fafafa' }}
            >
              <p style={{ color: '#666', marginBottom: 16, fontSize: 14 }}>{currentModelInfo.desc}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                {currentModelInfo.layers.map((layer, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <RightOutlined style={{ color: '#bbb' }} />}
                    <div
                      style={{
                        background: layer.color,
                        color: '#fff',
                        padding: '8px 16px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 500,
                        position: 'relative',
                      }}
                    >
                      {layer.label}
                      {layer.editable && (
                        <Tooltip title="此层参数可在下方调整">
                          <InfoCircleOutlined style={{ marginLeft: 4, fontSize: 11, opacity: 0.8 }} />
                        </Tooltip>
                      )}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </Card>
          )}

          {selectedModelType && (
            <Card
              title={<Space><SettingOutlined /><span>参数配置</span></Space>}
              size="small"
              extra={
                <Space>
                  <Tooltip title="一键填入基础参数，确保模型能跑">
                    <Button size="small" icon={<BulbOutlined />} onClick={handleFillReferenceParams} type="primary" ghost>
                      参考参数
                    </Button>
                  </Tooltip>
                  <Tooltip title="AI智能优化参数（需管理员配置AI接口）">
                    <Button size="small" icon={<ExperimentOutlined />} loading={aiOptimizing} onClick={handleAiOptimize}>
                      AI优化
                    </Button>
                  </Tooltip>
                </Space>
              }
            >
              {selectedModelType === 'mlp' ? (
                <MLPLayerEditor value={modelConfig} onChange={setModelConfig} />
              ) : currentModelTypeConfig?.param_schema ? (
                <ModelConfigForm paramSchema={currentModelTypeConfig.param_schema as any} value={modelConfig} onChange={setModelConfig} />
              ) : (
                <Alert message="此模型无需额外参数配置" type="info" />
              )}
            </Card>
          )}
        </div>
      ),
    },
    {
      title: '特征工程',
      icon: stepStatus[2] ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : <ToolOutlined />,
      content: (
        <div>
          <Alert
            message="特征指标是什么？"
            description={'特征指标就是模型用来判断涨跌的"线索"。比如均线(MA)反映趋势方向，RSI反映超买超卖，MACD反映动量变化。选的指标越有区分度，模型预测越准。建议选3~6个不同类型的指标。'}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <div style={{ marginBottom: 16, padding: 16, background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f' }}>
            <strong>已选 {selectedIndicators.length} 个指标：</strong>
            {selectedIndicators.length > 0 ? (
              <div style={{ marginTop: 8 }}>
                {selectedIndicators.map((key) => {
                  const ind = indicators.find((i: any) => getIndicatorKey(i) === key)
                  return ind ? (
                    <Tag key={key} closable onClose={() => handleIndicatorChange(selectedIndicators.filter((k) => k !== key))} color="blue" style={{ marginBottom: 4, fontSize: 14, padding: '4px 8px' }}>
                      {(ind as any).name || key}
                    </Tag>
                  ) : null
                })}
              </div>
            ) : (
              <span style={{ color: '#999', marginLeft: 8 }}>👇 从下方点击选择</span>
            )}
          </div>

          {Object.entries(indicatorCategories).map(([category, catIndicators]) => (
            <div key={category} style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#666', fontSize: 13 }}>{category}</div>
              <Space wrap>
                {catIndicators.map((ind: any) => {
                  const key = getIndicatorKey(ind)
                  const isSelected = selectedIndicators.includes(key)
                  return (
                    <Tag
                      key={key}
                      style={{
                        cursor: 'pointer',
                        padding: '6px 14px',
                        fontSize: 14,
                        userSelect: 'none',
                        borderRadius: 8,
                        border: isSelected ? '2px solid #1890ff' : '1px solid #d9d9d9',
                        background: isSelected ? '#e6f7ff' : '#fff',
                        fontWeight: isSelected ? 600 : 400,
                      }}
                      onClick={() => {
                        const newSelected = isSelected ? selectedIndicators.filter((k) => k !== key) : [...selectedIndicators, key]
                        handleIndicatorChange(newSelected)
                      }}
                    >
                      {isSelected ? '✓ ' : ''}{ind.name || key}
                    </Tag>
                  )
                })}
              </Space>
            </div>
          ))}

          {selectedIndicators.length > 0 && (
            <>
              <Divider orientation="left" style={{ fontSize: 13 }}>指标参数微调（可选）</Divider>
              <Collapse
                size="small"
                items={selectedIndicators
                  .map((key) => {
                    const indicator = indicators.find((i: any) => getIndicatorKey(i) === key)
                    if (!indicator || !(indicator as any).params?.length) return null
                    return {
                      key,
                      label: `${(indicator as any).name || key}`,
                      children: (
                        <Row gutter={[16, 8]}>
                          {(indicator as any).params.map((param: any) => (
                            <Col span={8} key={param.name}>
                              <div style={{ marginBottom: 4, fontSize: 12 }}>{param.name} ({param.min}~{param.max})</div>
                              <InputNumber
                                value={indicatorParams[key]?.[param.name] ?? param.default}
                                min={param.min} max={param.max} step={param.step}
                                onChange={(value) => {
                                  setIndicatorParams((prev) => ({
                                    ...prev,
                                    [key]: { ...prev[key], [param.name]: value },
                                  }))
                                }}
                                style={{ width: '100%' }}
                                size="small"
                              />
                            </Col>
                          ))}
                        </Row>
                      ),
                    }
                  })
                  .filter(Boolean) as any}
              />
            </>
          )}
        </div>
      ),
    },
    {
      title: '训练配置',
      icon: stepStatus[3] ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : <DatabaseOutlined />,
      content: (
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontWeight: 600, fontSize: 16, display: 'block', marginBottom: 8 }}>
              预测目标 <span style={{ color: '#f5222d' }}>*</span>
            </label>
            <Select value={target} onChange={setTarget} style={{ width: '100%' }} size="large">
              {TARGET_TYPES.map((t) => (
                <Select.Option key={t.value} value={t.value}>
                  <div>
                    <strong>{t.label}</strong>
                    {t.tag && <Tag color={t.color} style={{ marginLeft: 8 }}>{t.tag}</Tag>}
                    <span style={{ color: '#999', marginLeft: 8 }}>({t.type})</span>
                    <div style={{ fontSize: 12, color: '#999' }}>{t.desc}</div>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontWeight: 600, fontSize: 16, display: 'block', marginBottom: 8 }}>
              训练股票 <span style={{ color: '#f5222d' }}>*</span>
              <Tooltip title="选择多只股票时，模型将使用所有股票的数据进行训练，学到更通用的规律。预测时也可以对非训练股票预测。">
                <InfoCircleOutlined style={{ marginLeft: 8, color: '#1890ff', cursor: 'help' }} />
              </Tooltip>
            </label>
            <Select
              mode="multiple"
              value={stockCodes}
              onChange={setStockCodes}
              placeholder="选择训练股票（可多选）"
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              size="large"
            >
              {stocks.map((stock: any) => (
                <Select.Option key={stock.code} value={stock.code} label={`${stock.code} ${stock.name}`}>
                  {stock.code} - {stock.name}
                </Select.Option>
              ))}
            </Select>
            {stocks.length === 0 && (
              <Alert message="暂无股票数据，请先到数据管理页面获取" type="warning" showIcon style={{ marginTop: 8 }} />
            )}
          </div>

          <div>
            <label style={{ fontWeight: 600, fontSize: 16, display: 'block', marginBottom: 8 }}>
              训练日期范围
              <span style={{ fontWeight: 400, fontSize: 13, color: '#999', marginLeft: 8 }}>建议1~3年</span>
            </label>
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates as any)}
              style={{ width: '100%' }}
              size="large"
              presets={[
                { label: '近1年', value: [dayjs().subtract(1, 'year'), dayjs()] },
                { label: '近2年', value: [dayjs().subtract(2, 'year'), dayjs()] },
                { label: '近3年', value: [dayjs().subtract(3, 'year'), dayjs()] },
              ]}
            />
          </div>
        </div>
      ),
    },
  ]

  return (
    <div>
      <h1 className="page-title">{id ? '编辑模型' : '创建模型'}</h1>
      <p className="page-description">4步构建你的预测模型，每步完成后会出现 ✓ 标记</p>

      <Card>
        <Steps current={currentStep} style={{ marginBottom: 24 }} size="small">
          {steps.map((item, idx) => (
            <Steps.Step key={idx} title={item.title} icon={item.icon} />
          ))}
        </Steps>

        <div style={{ minHeight: 300, marginBottom: 24, padding: '8px 0' }}>{steps[currentStep].content}</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
          <Button disabled={currentStep === 0} onClick={() => setCurrentStep(currentStep - 1)} icon={<LeftOutlined />}>
            上一步
          </Button>
          <Space>
            {currentStep < steps.length - 1 && (
              <Button type="primary" onClick={() => setCurrentStep(currentStep + 1)} icon={<RightOutlined />}>
                下一步
              </Button>
            )}
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
            >
              保存模型
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  )
}

/** 参数配置表单（带说明） */
const ModelConfigForm: React.FC<{ paramSchema: Record<string, any>; value: Record<string, any>; onChange: (c: Record<string, any>) => void }> = ({ paramSchema, value, onChange }) => {
  if (!paramSchema) return null
  return (
    <Row gutter={[16, 16]}>
      {Object.entries(paramSchema).map(([key, schema]: [string, any]) => (
        <Col span={12} key={key}>
          <div style={{ marginBottom: 4, fontSize: 13 }}>
            <strong>{key}</strong>
            {schema.description && (
              <Tooltip title={schema.description}>
                <InfoCircleOutlined style={{ marginLeft: 4, color: '#1890ff', cursor: 'help' }} />
              </Tooltip>
            )}
          </div>
          {schema.type === 'int' || schema.type === 'float' ? (
            <div>
              <Slider min={schema.min} max={schema.max} step={schema.step} value={value[key] ?? schema.default ?? 0} onChange={(val) => onChange({ ...value, [key]: val })} />
              <InputNumber min={schema.min} max={schema.max} step={schema.step} value={value[key] ?? schema.default ?? 0} onChange={(val) => onChange({ ...value, [key]: val })} style={{ width: '100%' }} size="small" />
            </div>
          ) : schema.type === 'select' ? (
            <Select value={value[key] ?? schema.default} onChange={(val) => onChange({ ...value, [key]: val })} style={{ width: '100%' }} size="small">
              {schema.options?.map((opt: any) => <Select.Option key={String(opt)} value={opt}>{String(opt)}</Select.Option>)}
            </Select>
          ) : schema.type === 'array' ? (
            <Input
              value={Array.isArray(value[key]) ? JSON.stringify(value[key]) : JSON.stringify(schema.default || [])}
              onChange={(e) => { try { onChange({ ...value, [key]: JSON.parse(e.target.value) }) } catch {} }}
              placeholder="例如: [128, 64]"
              size="small"
            />
          ) : null}
          {schema.description && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{schema.description}</div>}
        </Col>
      ))}
    </Row>
  )
}

/** MLP可视化层结构编辑器 */
const MLPLayerEditor: React.FC<{ value: Record<string, any>; onChange: (c: Record<string, any>) => void }> = ({ value, onChange }) => {
  const hiddenLayers: number[] = Array.isArray(value.hidden_layers) ? value.hidden_layers : [128, 64]

  const updateLayers = (newLayers: number[]) => {
    const validated = newLayers.filter((s) => s >= 16 && s <= 512).slice(0, 4)
    onChange({ ...value, hidden_layers: validated.length > 0 ? validated : [64] })
  }

  return (
    <div>
      <Alert message="像搭积木一样调整网络结构" description="拖动滑块调整每层神经元数量。限制：1~4层，每层16~512。建议逐层递减（如256→128→64）。" type="info" showIcon style={{ marginBottom: 16 }} />

      {/* 可视化结构图 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ background: '#1890ff', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13 }}>输入层</div>
        <RightOutlined style={{ color: '#bbb' }} />
        {hiddenLayers.map((size, idx) => (
          <React.Fragment key={idx}>
            <div style={{ background: '#fa8c16', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13 }}>
              隐藏层{idx + 1}({size})
              <MinusCircleOutlined
                style={{ marginLeft: 6, cursor: hiddenLayers.length > 1 ? 'pointer' : 'not-allowed', opacity: hiddenLayers.length > 1 ? 1 : 0.3 }}
                onClick={() => { if (hiddenLayers.length > 1) updateLayers(hiddenLayers.filter((_, i) => i !== idx)) }}
              />
            </div>
            <RightOutlined style={{ color: '#bbb' }} />
          </React.Fragment>
        ))}
        <div style={{ background: '#52c41a', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13 }}>输出层</div>
      </div>

      {/* 层编辑器 */}
      {hiddenLayers.map((size, idx) => (
        <Row key={idx} gutter={16} align="middle" style={{ marginBottom: 8 }}>
          <Col span={4} style={{ textAlign: 'right', fontWeight: 500, fontSize: 13 }}>层 {idx + 1}</Col>
          <Col span={14}>
            <Slider min={16} max={512} step={16} value={size} onChange={(val) => { const n = [...hiddenLayers]; n[idx] = val; updateLayers(n) }} marks={{ 16: '16', 64: '64', 128: '128', 256: '256', 512: '512' }} />
          </Col>
          <Col span={4}>
            <InputNumber min={16} max={512} step={16} value={size} onChange={(val) => { if (val) { const n = [...hiddenLayers]; n[idx] = val; updateLayers(n) } }} style={{ width: '100%' }} size="small" />
          </Col>
        </Row>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={() => { if (hiddenLayers.length < 4) { const last = hiddenLayers[hiddenLayers.length - 1] || 64; updateLayers([...hiddenLayers, Math.max(16, Math.floor(last / 2))]) } }} disabled={hiddenLayers.length >= 4} block size="small">
        添加隐藏层 ({hiddenLayers.length}/4)
      </Button>

      <Divider style={{ margin: '16px 0' }}>其他参数</Divider>
      <Row gutter={[16, 12]}>
        <Col span={8}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>dropout <Tooltip title="防止过拟合"><InfoCircleOutlined style={{ color: '#1890ff' }} /></Tooltip></div>
          <Slider min={0} max={0.5} step={0.1} value={value.dropout ?? 0.2} onChange={(val) => onChange({ ...value, dropout: val })} />
        </Col>
        <Col span={8}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>learning_rate <Tooltip title="参数更新幅度"><InfoCircleOutlined style={{ color: '#1890ff' }} /></Tooltip></div>
          <InputNumber min={0.0001} max={0.01} step={0.0001} value={value.learning_rate ?? 0.001} onChange={(val) => val && onChange({ ...value, learning_rate: val })} style={{ width: '100%' }} size="small" />
        </Col>
        <Col span={8}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>epochs <Tooltip title="训练轮数"><InfoCircleOutlined style={{ color: '#1890ff' }} /></Tooltip></div>
          <InputNumber min={10} max={500} step={10} value={value.epochs ?? 50} onChange={(val) => val && onChange({ ...value, epochs: val })} style={{ width: '100%' }} size="small" />
        </Col>
      </Row>
    </div>
  )
}

export default ModelBuilder
