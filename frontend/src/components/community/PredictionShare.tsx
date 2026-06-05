/**
 * 预测分享 Tab 内容
 * 包含预测分享列表、点赞、跟单订阅
 */
import React, { useEffect, useState, useCallback } from 'react'
import { Card, Row, Col, Tag, Space, Avatar, Spin, Empty, Select, message } from 'antd'
import { HeartOutlined, BellOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons'
import { predictionApi } from '@/services/api'
import { PredictionShareItem } from '@/types'
import { MODEL_TYPE_COLORS, PREDICTION_SORT_OPTIONS, getDirectionColor, getDirectionLabel, formatTime } from './utils'

/** 预测方向 → 图标 */
const getDirectionIcon = (direction: string) => {
  if (direction === 'up') return <RiseOutlined />
  if (direction === 'down') return <FallOutlined />
  return null
}

const PredictionShare: React.FC = () => {
  const [predictions, setPredictions] = useState<PredictionShareItem[]>([])
  const [predictionsLoading, setPredictionsLoading] = useState(false)
  const [predictionSortBy, setPredictionSortBy] = useState('newest')

  /** 获取预测分享列表 */
  const fetchPredictions = useCallback(async () => {
    setPredictionsLoading(true)
    try {
      const params: Record<string, any> = {}
      if (predictionSortBy) params.sort_by = predictionSortBy
      const data = await predictionApi.getCommunityPredictions(params)
      const items = (data as any)?.items || (Array.isArray(data) ? data : [])
      setPredictions(items)
    } catch {
      message.error('获取预测分享失败')
    } finally {
      setPredictionsLoading(false)
    }
  }, [predictionSortBy])

  useEffect(() => {
    fetchPredictions()
  }, [predictionSortBy, fetchPredictions])

  /** 点赞预测 */
  const handleLikePrediction = async (id: number) => {
    try {
      await predictionApi.likePrediction(id)
      fetchPredictions()
    } catch {
      message.error('操作失败')
    }
  }

  /** 跟单订阅 */
  const handleSubscribe = async (targetUserId: number) => {
    try {
      const data = await predictionApi.subscribeUser(targetUserId)
      const subscribed = (data as any)?.subscribed
      message.success(subscribed ? '订阅成功' : '已取消订阅')
    } catch {
      message.error('操作失败')
    }
  }

  return (
    <div>
      <Row gutter={[16, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Select
            style={{ width: '100%' }}
            options={PREDICTION_SORT_OPTIONS}
            value={predictionSortBy}
            onChange={setPredictionSortBy}
          />
        </Col>
      </Row>

      <Spin spinning={predictionsLoading}>
        {predictions.length === 0 && !predictionsLoading ? (
          <Empty description="暂无预测分享" />
        ) : (
          <Row gutter={[16, 16]}>
            {predictions.map((item) => (
              <Col xs={24} sm={12} key={item.id}>
                <Card style={{ height: '100%' }}>
                  <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
                    <Col>
                      <Space>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>
                          {item.stock_name || item.stock_code}
                        </span>
                        <Tag style={{ fontSize: 11 }}>{item.stock_code}</Tag>
                      </Space>
                    </Col>
                    <Col>
                      <Tag
                        color={getDirectionColor(item.direction ?? 'neutral')}
                        icon={getDirectionIcon(item.direction ?? 'neutral')}
                      >
                        {getDirectionLabel(item.direction ?? 'neutral')}
                      </Tag>
                    </Col>
                  </Row>

                  <Row gutter={16} style={{ marginBottom: 12 }}>
                    {item.confidence != null && (
                      <Col>
                        <div style={{ fontSize: 12, color: '#999' }}>置信度</div>
                        <div style={{ fontWeight: 600, color: '#1890ff' }}>
                          {(item.confidence * 100).toFixed(0)}%
                        </div>
                      </Col>
                    )}
                    {item.prediction_value != null && (
                      <Col>
                        <div style={{ fontSize: 12, color: '#999' }}>预测值</div>
                        <div style={{ fontWeight: 600 }}>
                          ¥{item.prediction_value.toFixed(2)}
                        </div>
                      </Col>
                    )}
                  </Row>

                  {(item.model_name || item.model_type) && (
                    <div style={{ marginBottom: 12 }}>
                      <Space>
                        {item.model_type && (
                          <Tag color={MODEL_TYPE_COLORS[item.model_type] || 'default'}>
                            {item.model_type.toUpperCase()}
                          </Tag>
                        )}
                        {item.model_name && (
                          <span style={{ fontSize: 13, color: '#666' }}>{item.model_name}</span>
                        )}
                      </Space>
                    </div>
                  )}

                  <Row justify="space-between" align="middle">
                    <Col>
                      <Space>
                        <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>
                          {item.author?.username?.[0] || '?'}
                        </Avatar>
                        <span style={{ fontSize: 13 }}>{item.author?.username || '匿名'}</span>
                        <span style={{ fontSize: 12, color: '#999' }}>
                          {formatTime(item.created_at)}
                        </span>
                      </Space>
                    </Col>
                    <Col>
                      <Space size={12}>
                        <span
                          style={{ cursor: 'pointer', color: item.is_liked ? '#eb2f96' : '#999' }}
                          onClick={() => handleLikePrediction(item.id)}
                        >
                          <HeartOutlined /> {item.likes_count}
                        </span>
                        {item.user_id && (
                          <span
                            style={{ cursor: 'pointer', color: '#1890ff' }}
                            onClick={() => handleSubscribe(item.user_id)}
                            title="跟单订阅"
                          >
                            <BellOutlined /> 跟单
                          </span>
                        )}
                      </Space>
                    </Col>
                  </Row>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Spin>
    </div>
  )
}

export default PredictionShare
