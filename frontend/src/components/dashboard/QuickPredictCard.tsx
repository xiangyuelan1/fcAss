import React, { useState } from 'react'
import { Row, Col, Card, Button, Select, message } from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { communityApi } from '@/services/api'
import { CommunityModel } from '@/types'
import FunPredictionResult, { FunPredictionResultProps } from '@/components/FunPredictionResult'
import StockCodeInput from '@/components/StockCodeInput'
import { QuickPredictCardProps, QuickPredictResult } from './types'

/**
 * 快速预测卡片
 * 使用社区模型对指定股票进行快速预测，内部管理模型选择、股票输入和预测结果。
 */
const QuickPredictCard: React.FC<QuickPredictCardProps> = ({
  communityModels,
  stockCode,
  onStockCodeChange,
  onPredictComplete,
}) => {
  const navigate = useNavigate()
  const [selectedModelId, setSelectedModelId] = useState<number | undefined>()
  const [predicting, setPredicting] = useState(false)
  const [result, setResult] = useState<QuickPredictResult | null>(null)

  const handlePredict = async () => {
    if (!selectedModelId) { message.warning('请选择社区模型'); return }
    if (!stockCode.trim()) { message.warning('请输入股票代码'); return }
    setPredicting(true)
    setResult(null)
    try {
      const res = (await communityApi.predictWithModel(selectedModelId, {
        stock_code: stockCode.trim(),
      })) as QuickPredictResult
      setResult(res)
      message.success('预测完成')
      onPredictComplete()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } }; message?: string })
        ?.response?.data?.detail
        || (err as Error)?.message
      message.error(detail || '预测失败')
    } finally {
      setPredicting(false)
    }
  }

  return (
    <Card
      title="🔮 快速预测"
      size="small"
      style={{ marginBottom: 16 }}
      extra={
        <Button type="link" size="small" onClick={() => navigate('/community')}>
          浏览更多模型
        </Button>
      }
    >
      <Row gutter={[8, 8]} align="middle">
        <Col xs={24} sm={10}>
          <Select
            placeholder="选择社区模型"
            value={selectedModelId}
            onChange={setSelectedModelId}
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            options={communityModels.map((m: CommunityModel) => ({
              value: m.id,
              label: `${m.name} (${m.model_type?.toUpperCase() || '未知'})`,
            }))}
          />
        </Col>
        <Col xs={24} sm={8}>
          <StockCodeInput
            value={stockCode}
            onChange={onStockCodeChange}
            placeholder="股票代码，如 000001"
          />
        </Col>
        <Col xs={24} sm={6}>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            loading={predicting}
            onClick={handlePredict}
            block
          >
            立即预测
          </Button>
        </Col>
      </Row>
      {result && (
        <div style={{ marginTop: 12 }}>
          <FunPredictionResult
            direction={(result.prediction_label || result.direction || 'flat') as FunPredictionResultProps['direction']}
            confidence={result.confidence}
            stockCode={stockCode}
            predictedPrice={result.predicted_close || result.predicted_price}
            predictedChangePct={result.predicted_change_pct}
            compact={true}
          />
        </div>
      )}
    </Card>
  )
}

export default QuickPredictCard
