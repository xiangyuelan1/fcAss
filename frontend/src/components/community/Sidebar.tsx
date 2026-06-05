/**
 * 社区侧边栏
 * 包含每日一猜、跟单预测、关注动态、积分排行（精简版）
 */
import React, { useEffect, useState } from 'react'
import { Card, List, Tag, Space, Avatar, Empty, Button, message } from 'antd'
import { BellOutlined, TeamOutlined, TrophyOutlined, StarOutlined } from '@ant-design/icons'
import { pointsApi, predictionApi, socialApi } from '@/services/api'
import { UserPoints, FollowingUpdate, SubscriptionItem } from '@/types'
import DailyGuess from '@/components/DailyGuess'
import { getDirectionColor, getDirectionLabel, getRankColor, formatTime } from './utils'

const Sidebar: React.FC = () => {
  const [leaderboard, setLeaderboard] = useState<UserPoints[]>([])
  const [followingUpdates, setFollowingUpdates] = useState<FollowingUpdate[]>([])
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([])

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchLeaderboard(), fetchFollowingUpdates(), fetchSubscriptions()])
    }
    init()
  }, [])

  /** 获取积分排行榜 */
  const fetchLeaderboard = async () => {
    try {
      const data = await pointsApi.getLeaderboard({ page_size: 10 })
      setLeaderboard((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch {
      // 静默失败
    }
  }

  /** 获取关注动态 */
  const fetchFollowingUpdates = async () => {
    try {
      const data = await socialApi.getFollowingUpdates()
      const items = (data as any)?.items || (Array.isArray(data) ? data : [])
      setFollowingUpdates(items.slice(0, 3))
    } catch {
      setFollowingUpdates([])
    }
  }

  /** 获取跟单订阅列表 */
  const fetchSubscriptions = async () => {
    try {
      const data = await predictionApi.getSubscriptions()
      setSubscriptions((data as any)?.subscriptions || [])
    } catch {
      setSubscriptions([])
    }
  }

  /** 取消订阅 */
  const handleSubscribe = async (targetUserId: number) => {
    try {
      const data = await predictionApi.subscribeUser(targetUserId)
      const subscribed = (data as any)?.subscribed
      message.success(subscribed ? '订阅成功' : '已取消订阅')
      fetchSubscriptions()
    } catch {
      message.error('操作失败')
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <DailyGuess compact />

      {/* 跟单预测 - 我订阅的用户 */}
      <Card
        title={
          <Space>
            <BellOutlined style={{ color: '#1890ff' }} />
            <span>跟单预测</span>
          </Space>
        }
        size="small"
      >
        {subscriptions.length === 0 ? (
          <Empty description="暂未订阅任何用户" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            size="small"
            dataSource={subscriptions}
            renderItem={(sub) => (
              <List.Item style={{ padding: '8px 0' }}>
                <List.Item.Meta
                  avatar={
                    <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>
                      {sub.nickname?.[0] || sub.username?.[0] || '?'}
                    </Avatar>
                  }
                  title={<span style={{ fontSize: 13 }}>{sub.nickname || sub.username}</span>}
                  description={
                    sub.latest_prediction ? (
                      <Space size={4}>
                        <Tag
                          color={getDirectionColor(sub.latest_prediction.direction ?? 'flat')}
                          style={{ fontSize: 10, lineHeight: '14px', padding: '0 3px' }}
                        >
                          {getDirectionLabel(sub.latest_prediction.direction ?? 'flat')}
                        </Tag>
                        <span style={{ fontSize: 11, color: '#999' }}>
                          {sub.latest_prediction.stock_name || sub.latest_prediction.stock_code}
                        </span>
                      </Space>
                    ) : (
                      <span style={{ fontSize: 12, color: '#bbb' }}>暂无预测</span>
                    )
                  }
                />
                <Button size="small" type="text" danger onClick={() => handleSubscribe(sub.user_id)}>
                  取消
                </Button>
              </List.Item>
            )}
          />
        )}
      </Card>

      {/* 关注动态 */}
      <Card
        title={
          <Space>
            <TeamOutlined style={{ color: '#1890ff' }} />
            <span>关注动态</span>
          </Space>
        }
        size="small"
      >
        {followingUpdates.length === 0 ? (
          <Empty description="暂无动态" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            size="small"
            dataSource={followingUpdates}
            renderItem={(update) => (
              <List.Item style={{ padding: '8px 0' }}>
                <List.Item.Meta
                  avatar={
                    <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>
                      {update.username?.[0] || '?'}
                    </Avatar>
                  }
                  title={<span style={{ fontSize: 13 }}>{update.nickname || update.username}</span>}
                  description={<span style={{ fontSize: 12, color: '#999' }}>{update.description}</span>}
                />
                <span style={{ fontSize: 11, color: '#bbb', whiteSpace: 'nowrap' }}>
                  {formatTime(update.created_at)}
                </span>
              </List.Item>
            )}
          />
        )}
      </Card>

      {/* 积分排行榜（精简版） */}
      <Card
        title={
          <Space>
            <TrophyOutlined style={{ color: '#faad14' }} />
            <span>积分排行榜</span>
          </Space>
        }
        size="small"
      >
        <List
          size="small"
          dataSource={leaderboard}
          renderItem={(user, index) => (
            <List.Item style={{ padding: '6px 0' }}>
              <List.Item.Meta
                avatar={<Avatar size="small" style={{ backgroundColor: getRankColor(index) }}>{index + 1}</Avatar>}
                title={<span style={{ fontSize: 13 }}>{user.username || `用户${user.user_id}`}</span>}
                description={
                  <Space size={4}>
                    <StarOutlined style={{ color: '#faad14', fontSize: 11 }} />
                    <span style={{ fontSize: 12 }}>{user.total_points} 积分</span>
                    <Tag style={{ fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>Lv.{user.level}</Tag>
                  </Space>
                }
              />
            </List.Item>
          )}
          locale={{ emptyText: '暂无排行数据' }}
        />
      </Card>
    </Space>
  )
}

export default Sidebar
