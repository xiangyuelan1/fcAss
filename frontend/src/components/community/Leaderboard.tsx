/**
 * 排行榜 Tab 内容
 * 包含模型排行和用户排行，支持时间范围切换
 */
import React, { useEffect, useState } from 'react'
import { List, Tag, Space, Avatar, Spin, Empty, Select, Row, Col, message } from 'antd'
import { leaderboardApi } from '@/services/api'
import { ModelLeaderboardItem, UserLeaderboardItem } from '@/types'
import { MODEL_TYPE_COLORS, LEADERBOARD_PERIOD_OPTIONS, getRankColor } from './utils'

const Leaderboard: React.FC = () => {
  const [modelLeaderboard, setModelLeaderboard] = useState<ModelLeaderboardItem[]>([])
  const [userLeaderboard, setUserLeaderboard] = useState<UserLeaderboardItem[]>([])
  const [leaderboardPeriod, setLeaderboardPeriod] = useState('week')
  const [leaderboardType, setLeaderboardType] = useState<'model' | 'user'>('model')
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)

  /** 获取模型排行榜 */
  const fetchModelLeaderboard = async (period: string) => {
    setLeaderboardLoading(true)
    try {
      const data = await leaderboardApi.getModelLeaderboard({ period, limit: 20 })
      setModelLeaderboard((data as any)?.leaderboard || [])
    } catch {
      message.error('获取模型排行榜失败')
    } finally {
      setLeaderboardLoading(false)
    }
  }

  /** 获取用户排行榜 */
  const fetchUserLeaderboard = async (period: string) => {
    setLeaderboardLoading(true)
    try {
      const data = await leaderboardApi.getUserLeaderboard({ period, limit: 20 })
      setUserLeaderboard((data as any)?.leaderboard || [])
    } catch {
      message.error('获取用户排行榜失败')
    } finally {
      setLeaderboardLoading(false)
    }
  }

  useEffect(() => {
    if (leaderboardType === 'model') {
      fetchModelLeaderboard(leaderboardPeriod)
    } else {
      fetchUserLeaderboard(leaderboardPeriod)
    }
  }, [leaderboardPeriod, leaderboardType])

  return (
    <div>
      <Row gutter={[16, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}>
          <Select
            style={{ width: '100%' }}
            options={[
              { label: '模型排行', value: 'model' },
              { label: '用户排行', value: 'user' },
            ]}
            value={leaderboardType}
            onChange={setLeaderboardType}
          />
        </Col>
        <Col xs={12} sm={8}>
          <Select
            style={{ width: '100%' }}
            options={LEADERBOARD_PERIOD_OPTIONS}
            value={leaderboardPeriod}
            onChange={setLeaderboardPeriod}
          />
        </Col>
      </Row>

      <Spin spinning={leaderboardLoading}>
        {leaderboardType === 'model' ? (
          modelLeaderboard.length === 0 && !leaderboardLoading ? (
            <Empty description="暂无模型排行数据" />
          ) : (
            <List
              dataSource={modelLeaderboard}
              renderItem={(item, index) => (
                <List.Item style={{ padding: '12px 0' }}>
                  <List.Item.Meta
                    avatar={<Avatar size="small" style={{ backgroundColor: getRankColor(index) }}>{index + 1}</Avatar>}
                    title={
                      <Space>
                        <span style={{ fontSize: 14 }}>{item.model_name || `模型#${item.model_id}`}</span>
                        {item.model_type && (
                          <Tag color={MODEL_TYPE_COLORS[item.model_type] || 'default'} style={{ fontSize: 11 }}>
                            {item.model_type.toUpperCase()}
                          </Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Space size={8}>
                        <span style={{ fontSize: 12, color: '#999' }}>作者: {item.nickname}</span>
                        <span style={{ fontSize: 12, color: '#999' }}>预测 {item.total} 次</span>
                      </Space>
                    }
                  />
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 18, color: '#1890ff' }}>
                      {(item.accuracy * 100).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 11, color: '#999' }}>准确率</div>
                  </div>
                </List.Item>
              )}
            />
          )
        ) : (
          userLeaderboard.length === 0 && !leaderboardLoading ? (
            <Empty description="暂无用户排行数据" />
          ) : (
            <List
              dataSource={userLeaderboard}
              renderItem={(item, index) => (
                <List.Item style={{ padding: '12px 0' }}>
                  <List.Item.Meta
                    avatar={<Avatar size="small" style={{ backgroundColor: getRankColor(index) }}>{index + 1}</Avatar>}
                    title={<span style={{ fontSize: 14 }}>{item.nickname}</span>}
                    description={
                      <Space size={8}>
                        <span style={{ fontSize: 12, color: '#999' }}>预测 {item.total_predictions} 次</span>
                        <span style={{ fontSize: 12, color: '#999' }}>模型 {item.total_models} 个</span>
                      </Space>
                    }
                  />
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 18, color: '#faad14' }}>
                      {item.score}
                    </div>
                    <div style={{ fontSize: 11, color: '#999' }}>综合评分</div>
                  </div>
                </List.Item>
              )}
            />
          )
        )}
      </Spin>
    </div>
  )
}

export default Leaderboard
