/**
 * 模型广场 Tab 内容
 * 包含模型列表、搜索筛选、卡片内展开预测、策略回放弹窗
 */
import React, { useEffect, useState, useCallback } from 'react'
import { List, Tag, Button, Spin, Empty, Input, Select, Row, Col, Alert, Modal, Space, message } from 'antd'
import { SearchOutlined, ThunderboltOutlined, PlayCircleOutlined, CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { communityApi, predictionApi } from '@/services/api'
import { CommunityModel, ReplayItem, ReplaySummary } from '@/types'
import StockCodeInput from '@/components/StockCodeInput'
import FunPredictionResult from '@/components/FunPredictionResult'
import { MODEL_TYPE_COLORS, SORT_OPTIONS, TYPE_OPTIONS, getDirectionColor, getDirectionLabel } from './utils'

const ModelSquare: React.FC = () => {
  const navigate = useNavigate()

  // 模型列表与筛选
  const [models, setModels] = useState<CommunityModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [modelType, setModelType] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [stockFilter, setStockFilter] = useState('')

  // 卡片内展开预测
  const [expandedModelId, setExpandedModelId] = useState<number | null>(null)
  const [predictStockCode, setPredictStockCode] = useState('600519')
  const [predictingModelId, setPredictingModelId] = useState<number | null>(null)
  const [predictionResult, setPredictionResult] = useState<Record<number, any>>({})

  // 策略回放
  const [replayVisible, setReplayVisible] = useState(false)
  const [replayModelName, setReplayModelName] = useState('')
  const [replayItems, setReplayItems] = useState<ReplayItem[]>([])
  const [replaySummary, setReplaySummary] = useState<ReplaySummary | null>(null)
  const [replayLoading, setReplayLoading] = useState(false)

  /** 获取模型列表 */
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

  useEffect(() => {
    fetchModels()
  }, [searchText, modelType, sortBy, fetchModels])

  /** 点赞模型 */
  const handleLikeModel = async (id: number) => {
    try {
      await communityApi.likeModel(id)
      fetchModels()
    } catch {
      message.error('操作失败')
    }
  }

  /** 克隆模型 */
  const handleCloneModel = async (id: number) => {
    try {
      await communityApi.cloneModel(id)
      message.success('克隆成功，已添加到我的模型')
      fetchModels()
    } catch {
      message.error('克隆失败')
    }
  }

  /** 策略回放 */
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

  /** 卡片内预测 */
  const handleCommunityPredict = async (model: CommunityModel) => {
    if (!predictStockCode) {
      message.warning('请输入股票代码')
      return
    }
    setPredictingModelId(model.id)
    try {
      const data = await communityApi.predictWithModel(model.id, {
        stock_code: predictStockCode,
        days: 1,
      })
      setPredictionResult(prev => ({ ...prev, [model.id]: data }))
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      if (typeof detail === 'string' && detail.includes('dimension')) {
        const supportedCodes = model.stock_codes?.join(', ') || '未知'
        message.error(`该模型仅支持预测其训练股票：${supportedCodes}，请输入以上股票代码`)
      } else if (typeof detail === 'string') {
        message.error(detail)
      } else {
        message.error('预测失败')
      }
    } finally {
      setPredictingModelId(null)
    }
  }

  // 按股票代码筛选
  const filteredModels = models.filter(m => {
    if (stockFilter) {
      return m.stock_codes?.some((code: string) => code.includes(stockFilter))
    }
    return true
  })

  return (
    <div>
      {/* 搜索筛选栏 */}
      <Row gutter={[16, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={6}>
          <Input.Search
            placeholder="搜索模型名称或描述"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={() => fetchModels()}
            enterButton={<SearchOutlined />}
            allowClear
          />
        </Col>
        <Col xs={12} sm={6}>
          <StockCodeInput
            value={stockFilter}
            onChange={setStockFilter}
            placeholder="🔍 选择可预测股票"
            size="small"
          />
        </Col>
        <Col xs={6} sm={6}>
          <Select style={{ width: '100%' }} options={TYPE_OPTIONS} value={modelType} onChange={setModelType} />
        </Col>
        <Col xs={6} sm={6}>
          <Select style={{ width: '100%' }} options={SORT_OPTIONS} value={sortBy} onChange={setSortBy} />
        </Col>
      </Row>

      {/* 模型列表 */}
      <Spin spinning={modelsLoading}>
        {filteredModels.length === 0 && !modelsLoading ? (
          <Empty description={stockFilter ? '未找到可预测该股票的模型' : '暂无社区模型'} />
        ) : (
          <List
            dataSource={filteredModels}
            size="small"
            pagination={filteredModels.length > 20 ? { pageSize: 20, size: 'small' } : false}
            renderItem={(model: CommunityModel) => (
              <>
                <List.Item
                  style={{ padding: '8px 12px', cursor: 'default' }}
                  actions={[
                    <Button
                      key="predict"
                      type={expandedModelId === model.id ? 'default' : 'primary'}
                      size="small"
                      icon={<ThunderboltOutlined />}
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedModelId(expandedModelId === model.id ? null : model.id)
                      }}
                    >
                      {expandedModelId === model.id ? '收起' : '预测'}
                    </Button>,
                    <span
                      key="likes"
                      style={{ cursor: 'pointer', fontSize: 12, color: model.is_liked ? '#eb2f96' : '#999' }}
                      onClick={(e) => { e.stopPropagation(); handleLikeModel(model.id) }}
                    >
                      ❤️ {model.likes_count || 0}
                    </span>,
                    <span
                      key="clone"
                      style={{ cursor: 'pointer', fontSize: 12, color: '#999' }}
                      onClick={(e) => { e.stopPropagation(); handleCloneModel(model.id) }}
                      title="克隆模型"
                    >
                      📋 {model.clones_count || 0}
                    </span>,
                    <span
                      key="replay"
                      style={{ cursor: 'pointer', fontSize: 12, color: '#1890ff' }}
                      onClick={(e) => { e.stopPropagation(); handleReplay(model.source_model_id, model.name) }}
                      title="策略回放"
                    >
                      🔄
                    </span>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <Tag color={MODEL_TYPE_COLORS[model.model_type] || 'default'}>
                        {model.model_type?.toUpperCase()}
                      </Tag>
                    }
                    title={
                      <span
                        style={{ cursor: 'pointer', fontSize: 14 }}
                        onClick={() => navigate(`/community/model/${model.id}`)}
                      >
                        {model.name}
                      </span>
                    }
                    description={
                      <div style={{ fontSize: 12 }}>
                        <span style={{ color: '#999' }}>{model.author?.username || '匿名'}</span>
                        {model.stock_codes && model.stock_codes.length > 0 && (
                          <span style={{ marginLeft: 8 }}>
                            {model.stock_codes.slice(0, 3).map((code: string) => (
                              <Tag key={code} style={{ fontSize: 10, padding: '0 4px', margin: '0 2px' }} color="blue">{code}</Tag>
                            ))}
                            {model.stock_codes.length > 3 && (
                              <Tag style={{ fontSize: 10, padding: '0 4px' }}>+{model.stock_codes.length - 3}</Tag>
                            )}
                          </span>
                        )}
                      </div>
                    }
                  />
                </List.Item>
                {/* 展开的预测区域 */}
                {expandedModelId === model.id && (
                  <div
                    style={{ padding: '8px 12px 12px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', gap: 8 }}>
                      <StockCodeInput
                        value={predictStockCode}
                        onChange={setPredictStockCode}
                        placeholder="选择或输入股票代码"
                        size="small"
                        style={{ flex: 1 }}
                      />
                      <Button
                        type="primary"
                        size="small"
                        loading={predictingModelId === model.id}
                        onClick={() => handleCommunityPredict(model)}
                      >
                        预测！
                      </Button>
                    </div>
                    {model.stock_codes && !model.stock_codes.includes(predictStockCode) && predictStockCode && (
                      <Alert
                        style={{ marginTop: 8 }}
                        message="该模型未使用此股票训练，预测结果可能不准确"
                        type="warning"
                        showIcon
                      />
                    )}
                    {predictionResult[model.id] && (
                      <div style={{ marginTop: 12 }}>
                        <FunPredictionResult
                          direction={predictionResult[model.id].prediction_label || predictionResult[model.id].direction || 'flat'}
                          confidence={predictionResult[model.id].confidence}
                          stockCode={predictStockCode}
                          predictedPrice={predictionResult[model.id].predicted_close || predictionResult[model.id].predicted_price}
                          predictedChangePct={predictionResult[model.id].predicted_change_pct}
                          compact={true}
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          />
        )}
      </Spin>

      {/* 策略回放弹窗 */}
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
          <div style={{ marginBottom: 16, background: '#fafafa', padding: 16, borderRadius: 8 }}>
            <Row gutter={24} align="middle">
              <Col span={8}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>准确率</div>
                  <div style={{ fontWeight: 700, fontSize: 24, color: replaySummary.accuracy >= 0.6 ? '#52c41a' : replaySummary.accuracy >= 0.4 ? '#faad14' : '#f5222d' }}>
                    {(replaySummary.accuracy * 100).toFixed(1)}%
                  </div>
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
          </div>
        )}
        <List
          dataSource={replayItems}
          loading={replayLoading}
          size="small"
          pagination={{ pageSize: 10, size: 'small' }}
          renderItem={(item) => (
            <List.Item style={{ padding: '8px 0' }}>
              <List.Item.Meta
                title={
                  <Space>
                    <span>{item.stock_name || item.stock_code}</span>
                    <Tag style={{ fontSize: 10 }}>{item.stock_code}</Tag>
                  </Space>
                }
                description={
                  <Space size={8}>
                    <span>预测: <Tag color={getDirectionColor(item.direction ?? 'flat')} style={{ fontSize: 10 }}>{getDirectionLabel(item.direction ?? 'flat')}</Tag></span>
                    <span>实际: {item.actual_direction ? <Tag color={getDirectionColor(item.actual_direction)} style={{ fontSize: 10 }}>{getDirectionLabel(item.actual_direction)}</Tag> : '-'}</span>
                    {item.actual_change != null && (
                      <span style={{ color: item.actual_change > 0 ? '#f5222d' : item.actual_change < 0 ? '#52c41a' : '#999', fontWeight: 600 }}>
                        {item.actual_change > 0 ? '+' : ''}{item.actual_change}%
                      </span>
                    )}
                    {item.correct === true && <CheckCircleFilled style={{ color: '#52c41a' }} />}
                    {item.correct === false && <CloseCircleFilled style={{ color: '#f5222d' }} />}
                  </Space>
                }
              />
            </List.Item>
          )}
          locale={{ emptyText: '暂无回放数据' }}
        />
      </Modal>
    </div>
  )
}

export default ModelSquare
