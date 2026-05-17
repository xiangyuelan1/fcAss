import React, { useEffect, useState } from 'react'
import {
  Card,
  Table,
  Tag,
  Tabs,
  Avatar,
  message,
  Row,
  Col,
  Button,
  Empty,
} from 'antd'
import {
  TrophyOutlined,
  StarOutlined,
  ThunderboltOutlined,
  HeartOutlined,
  CrownOutlined,
  RocketOutlined,
  PlayCircleOutlined,
  GlobalOutlined,
  BulbOutlined,
  CalendarOutlined,
  FireOutlined,
  DollarOutlined,
  GoldOutlined,
  CheckCircleOutlined,
  LockOutlined,
} from '@ant-design/icons'
import { pointsApi, pkApi, communityApi } from '@/services/api'
import { AchievementBadge } from '@/types'

interface PointsRankItem {
  id: number
  user_id: number
  username?: string
  total_points: number
  level: number
}

interface PKRankItem {
  user_id: number
  username?: string
  wins: number
  total: number
  accuracy: number
}

interface PopularityRankItem {
  user_id: number
  username?: string
  total_likes: number
  model_count: number
}

const BADGE_ICON_MAP: Record<string, { icon: React.ReactNode; color: string }> = {
  first_model: { icon: <RocketOutlined />, color: '#1890ff' },
  first_training: { icon: <PlayCircleOutlined />, color: '#52c41a' },
  first_publish: { icon: <GlobalOutlined />, color: '#13c2c2' },
  first_pk: { icon: <ThunderboltOutlined />, color: '#faad14' },
  pk_winner_1: { icon: <TrophyOutlined />, color: '#fa8c16' },
  pk_winner_10: { icon: <CrownOutlined />, color: '#f5222d' },
  popular_10: { icon: <HeartOutlined />, color: '#eb2f96' },
  popular_100: { icon: <StarOutlined />, color: '#722ed1' },
  signal_master: { icon: <BulbOutlined />, color: '#2f54eb' },
  daily_7: { icon: <CalendarOutlined />, color: '#faad14' },
  daily_30: { icon: <FireOutlined />, color: '#f5222d' },
  points_100: { icon: <DollarOutlined />, color: '#52c41a' },
  points_1000: { icon: <GoldOutlined />, color: '#722ed1' },
}

const RANK_STYLES: Record<number, { color: string; icon: React.ReactNode }> = {
  0: { color: '#f5222d', icon: <CrownOutlined style={{ color: '#f5222d' }} /> },
  1: { color: '#faad14', icon: <CrownOutlined style={{ color: '#faad14' }} /> },
  2: { color: '#fa8c16', icon: <CrownOutlined style={{ color: '#fa8c16' }} /> },
}

const Leaderboard: React.FC = () => {
  const [pointsData, setPointsData] = useState<PointsRankItem[]>([])
  const [pkData, setPkData] = useState<PKRankItem[]>([])
  const [popularityData, setPopularityData] = useState<PopularityRankItem[]>([])
  const [achievements, setAchievements] = useState<AchievementBadge[]>([])
  const [loading, setLoading] = useState(false)
  const [achievementLoading, setAchievementLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('points')

  useEffect(() => {
    fetchPointsRank()
  }, [])

  const fetchPointsRank = async () => {
    setLoading(true)
    try {
      const data = await pointsApi.getLeaderboard({ page_size: 50 })
      setPointsData((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch (error) {
      message.error('获取积分排行失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchPKRank = async () => {
    setLoading(true)
    try {
      const data = await pkApi.getLeaderboard({ type: 'pk_accuracy', page_size: 50 })
      setPkData((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch (error) {
      message.error('获取PK排行失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchPopularityRank = async () => {
    setLoading(true)
    try {
      const data = await communityApi.getModels({ sort_by: 'likes', page_size: 50 })
      const models = (data as any)?.items || (Array.isArray(data) ? data : [])
      const userMap = new Map<number, PopularityRankItem>()
      models.forEach((m: any) => {
        const existing = userMap.get(m.user_id)
        if (existing) {
          existing.total_likes += m.likes_count || 0
          existing.model_count += 1
        } else {
          userMap.set(m.user_id, {
            user_id: m.user_id,
            username: m.author?.username,
            total_likes: m.likes_count || 0,
            model_count: 1,
          })
        }
      })
      setPopularityData(
        Array.from(userMap.values()).sort((a, b) => b.total_likes - a.total_likes)
      )
    } catch (error) {
      message.error('获取人气排行失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchAchievements = async () => {
    setAchievementLoading(true)
    try {
      await pointsApi.checkAchievements()
      const data = await pointsApi.getAllAchievements()
      setAchievements(data as any)
    } catch (error) {
      message.error('获取成就列表失败')
    } finally {
      setAchievementLoading(false)
    }
  }

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    if (key === 'points' && pointsData.length === 0) fetchPointsRank()
    if (key === 'pk' && pkData.length === 0) fetchPKRank()
    if (key === 'popularity' && popularityData.length === 0) fetchPopularityRank()
    if (key === 'achievements' && achievements.length === 0) fetchAchievements()
  }

  const getRankRender = (index: number) => {
    const style = RANK_STYLES[index]
    if (style) {
      return (
        <Avatar size="small" style={{ backgroundColor: style.color }}>
          {index + 1}
        </Avatar>
      )
    }
    return <span style={{ paddingLeft: 8 }}>{index + 1}</span>
  }

  const pointsColumns = [
    {
      title: '排名',
      key: 'rank',
      width: 80,
      render: (_: any, __: any, index: number) => getRankRender(index),
    },
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      render: (name: string, record: PointsRankItem) => name || `用户${record.user_id}`,
    },
    {
      title: '积分',
      dataIndex: 'total_points',
      key: 'total_points',
      sorter: (a: PointsRankItem, b: PointsRankItem) => a.total_points - b.total_points,
      render: (points: number) => (
        <span style={{ fontWeight: 600, color: '#faad14' }}>
          <StarOutlined style={{ marginRight: 4 }} />{points}
        </span>
      ),
    },
    {
      title: '等级',
      dataIndex: 'level',
      key: 'level',
      render: (level: number) => <Tag color="blue">Lv.{level}</Tag>,
    },
  ]

  const pkColumns = [
    {
      title: '排名',
      key: 'rank',
      width: 80,
      render: (_: any, __: any, index: number) => getRankRender(index),
    },
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      render: (name: string, record: PKRankItem) => name || `用户${record.user_id}`,
    },
    {
      title: '胜率',
      dataIndex: 'accuracy',
      key: 'accuracy',
      sorter: (a: PKRankItem, b: PKRankItem) => a.accuracy - b.accuracy,
      render: (rate: number) => (
        <span style={{ fontWeight: 600, color: '#52c41a' }}>
          <ThunderboltOutlined style={{ marginRight: 4 }} />{(rate * 100).toFixed(1)}%
        </span>
      ),
    },
    {
      title: '战绩',
      key: 'record',
      render: (_: any, record: PKRankItem) => (
        <span>
          <Tag color="green">{record.wins}胜</Tag>
          <Tag color="red">{record.total - record.wins}负</Tag>
        </span>
      ),
    },
  ]

  const popularityColumns = [
    {
      title: '排名',
      key: 'rank',
      width: 80,
      render: (_: any, __: any, index: number) => getRankRender(index),
    },
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      render: (name: string, record: PopularityRankItem) => name || `用户${record.user_id}`,
    },
    {
      title: '获赞总数',
      dataIndex: 'total_likes',
      key: 'total_likes',
      sorter: (a: PopularityRankItem, b: PopularityRankItem) => a.total_likes - b.total_likes,
      render: (likes: number) => (
        <span style={{ fontWeight: 600, color: '#eb2f96' }}>
          <HeartOutlined style={{ marginRight: 4 }} />{likes}
        </span>
      ),
    },
    {
      title: '模型数',
      dataIndex: 'model_count',
      key: 'model_count',
      render: (count: number) => <Tag>{count} 个模型</Tag>,
    },
  ]

  const earnedCount = achievements.filter(a => a.earned).length

  const tabItems = [
    {
      key: 'points',
      label: (
        <span>
          <StarOutlined /> 积分排行
        </span>
      ),
      children: (
        <Table
          columns={pointsColumns}
          dataSource={pointsData}
          rowKey="user_id"
          loading={loading}
          pagination={{ pageSize: 20 }}
        />
      ),
    },
    {
      key: 'pk',
      label: (
        <span>
          <ThunderboltOutlined /> PK胜率排行
        </span>
      ),
      children: (
        <Table
          columns={pkColumns}
          dataSource={pkData}
          rowKey="user_id"
          loading={loading}
          pagination={{ pageSize: 20 }}
        />
      ),
    },
    {
      key: 'popularity',
      label: (
        <span>
          <HeartOutlined /> 人气排行
        </span>
      ),
      children: (
        <Table
          columns={popularityColumns}
          dataSource={popularityData}
          rowKey="user_id"
          loading={loading}
          pagination={{ pageSize: 20 }}
        />
      ),
    },
    {
      key: 'achievements',
      label: (
        <span>
          <TrophyOutlined /> 成就 ({earnedCount}/{achievements.length})
        </span>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#999' }}>
              已解锁 {earnedCount}/{achievements.length} 个成就
            </span>
            <Button
              type="primary"
              icon={<TrophyOutlined />}
              onClick={fetchAchievements}
              loading={achievementLoading}
            >
              检查新成就
            </Button>
          </div>
          {achievements.length === 0 && !achievementLoading ? (
            <Empty description="暂无成就数据，点击检查新成就" />
          ) : (
            <Row gutter={[16, 16]}>
              {achievements.map((badge) => {
                const badgeConfig = BADGE_ICON_MAP[badge.badge_type] || { icon: <StarOutlined />, color: '#999' }
                return (
                  <Col xs={12} sm={8} md={6} key={badge.badge_type}>
                    <Card
                      hoverable
                      style={{
                        textAlign: 'center',
                        opacity: badge.earned ? 1 : 0.5,
                        borderColor: badge.earned ? badgeConfig.color : '#d9d9d9',
                      }}
                    >
                      <div style={{
                        fontSize: 36,
                        color: badge.earned ? badgeConfig.color : '#d9d9d9',
                        marginBottom: 8,
                      }}>
                        {badge.earned ? badgeConfig.icon : <LockOutlined />}
                      </div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {badge.badge_name}
                      </div>
                      <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
                        {badge.description}
                      </div>
                      <Tag color={badge.earned ? badgeConfig.color : 'default'}>
                        +{badge.bonus} 积分
                      </Tag>
                      {badge.earned ? (
                        <div style={{ marginTop: 8 }}>
                          <Tag icon={<CheckCircleOutlined />} color="success">
                            {badge.earned_at ? new Date(badge.earned_at).toLocaleDateString() : '已获得'}
                          </Tag>
                        </div>
                      ) : (
                        <div style={{ marginTop: 8 }}>
                          <Tag color="default">未解锁</Tag>
                        </div>
                      )}
                    </Card>
                  </Col>
                )
              })}
            </Row>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <h1 className="page-title">排行榜</h1>
      <p className="page-description">
        查看社区积分排行、PK胜率排行和人气排行，争夺荣誉榜首位。
      </p>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={tabItems}
        />
      </Card>
    </div>
  )
}

export default Leaderboard
