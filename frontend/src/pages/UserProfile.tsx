import React, { useEffect, useState } from 'react'
import {
  Card,
  Row,
  Col,
  Avatar,
  Tag,
  Button,
  Tabs,
  List,
  Spin,
  Empty,
  message,
  Statistic,
  Space,
} from 'antd'
import {
  UserOutlined,
  CalendarOutlined,
  TeamOutlined,
  HeartOutlined,
  CopyOutlined,
  GlobalOutlined,
} from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store'
import { socialApi } from '@/services/api'
import { UserProfile as UserProfileType, FollowUser, CommunityModel } from '@/types'

const MODEL_TYPE_COLORS: Record<string, string> = {
  lstm: 'blue',
  gru: 'cyan',
  xgboost: 'green',
  lightgbm: 'lime',
  randomforest: 'orange',
  mlp: 'purple',
}

const UserProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user: currentUser } = useAuthStore()
  const userId = Number(id)

  const [profile, setProfile] = useState<UserProfileType | null>(null)
  const [loading, setLoading] = useState(true)
  const [followLoading, setFollowLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('models')
  const [followers, setFollowers] = useState<FollowUser[]>([])
  const [following, setFollowing] = useState<FollowUser[]>([])
  const [followersLoading, setFollowersLoading] = useState(false)
  const [followingLoading, setFollowingLoading] = useState(false)

  const isSelf = currentUser?.id === userId

  useEffect(() => {
    if (userId) {
      fetchProfile()
    }
  }, [userId])

  const fetchProfile = async () => {
    setLoading(true)
    try {
      const data = await socialApi.getUserProfile(userId)
      setProfile(data as any)
    } catch {
      message.error('获取用户信息失败')
    } finally {
      setLoading(false)
    }
  }

  const handleFollow = async () => {
    if (!profile) return
    setFollowLoading(true)
    try {
      if (profile.is_following) {
        await socialApi.unfollowUser(userId)
        message.success('已取消关注')
      } else {
        await socialApi.followUser(userId)
        message.success('关注成功')
      }
      fetchProfile()
      if (activeTab === 'followers') fetchFollowers()
      if (activeTab === 'following') fetchFollowing()
    } catch {
      message.error('操作失败')
    } finally {
      setFollowLoading(false)
    }
  }

  const fetchFollowers = async () => {
    setFollowersLoading(true)
    try {
      const data = await socialApi.getFollowers(userId, { page_size: 50 })
      setFollowers((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch {
      message.error('获取粉丝列表失败')
    } finally {
      setFollowersLoading(false)
    }
  }

  const fetchFollowing = async () => {
    setFollowingLoading(true)
    try {
      const data = await socialApi.getFollowing(userId, { page_size: 50 })
      setFollowing((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch {
      message.error('获取关注列表失败')
    } finally {
      setFollowingLoading(false)
    }
  }

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    if (key === 'followers' && followers.length === 0) fetchFollowers()
    if (key === 'following' && following.length === 0) fetchFollowing()
  }

  const renderUserItem = (item: FollowUser) => (
    <List.Item
      actions={[
        currentUser && currentUser.id !== item.id ? (
          <Button
            size="small"
            type={item.is_following ? 'default' : 'primary'}
            onClick={async () => {
              try {
                if (item.is_following) {
                  await socialApi.unfollowUser(item.id)
                } else {
                  await socialApi.followUser(item.id)
                }
                if (activeTab === 'followers') fetchFollowers()
                if (activeTab === 'following') fetchFollowing()
                fetchProfile()
              } catch {
                message.error('操作失败')
              }
            }}
          >
            {item.is_following ? '已关注' : '关注'}
          </Button>
        ) : null,
      ]}
    >
      <List.Item.Meta
        avatar={
          <Avatar
            size="small"
            style={{ backgroundColor: '#1890ff', cursor: 'pointer' }}
            onClick={() => navigate(`/user/${item.id}`)}
          >
            {(item.nickname || item.username)?.[0]?.toUpperCase() || '?'}
          </Avatar>
        }
        title={
          <a onClick={() => navigate(`/user/${item.id}`)}>
            {item.nickname || item.username}
          </a>
        }
        description={item.nickname ? `@${item.username}` : undefined}
      />
    </List.Item>
  )

  const tabItems = [
    {
      key: 'models',
      label: `发布的模型 (${profile?.models_count ?? 0})`,
      children: (
        <Spin spinning={loading}>
          {!profile?.models || profile.models.length === 0 ? (
            <Empty description="暂无发布的模型" />
          ) : (
            <Row gutter={[16, 16]}>
              {profile.models.map((model: CommunityModel) => (
                <Col xs={24} sm={12} lg={8} key={model.id}>
                  <Card
                    hoverable
                    onClick={() => navigate(`/community/model/${model.id}`)}
                    style={{ height: '100%' }}
                  >
                    <div style={{ marginBottom: 12 }}>
                      <Space>
                        <Tag color={MODEL_TYPE_COLORS[model.model_type] || 'default'}>
                          {model.model_type.toUpperCase()}
                        </Tag>
                        {model.metrics && model.metrics.accuracy !== undefined && (
                          <Tag color="blue">
                            准确率 {(model.metrics.accuracy * 100).toFixed(1)}%
                          </Tag>
                        )}
                      </Space>
                    </div>
                    <h3 style={{ marginBottom: 8 }}>{model.name}</h3>
                    <p style={{ color: '#999', fontSize: 13, marginBottom: 12, minHeight: 40 }}>
                      {model.description || '暂无描述'}
                    </p>
                    <Row justify="space-between" align="middle">
                      <Col>
                        <span style={{ color: '#eb2f96', fontSize: 13 }}>
                          <HeartOutlined /> {model.likes_count}
                        </span>
                      </Col>
                      <Col>
                        <span style={{ color: '#999', fontSize: 13 }}>
                          <CopyOutlined /> {model.clones_count} 次克隆
                        </span>
                      </Col>
                    </Row>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </Spin>
      ),
    },
    {
      key: 'following',
      label: `关注 (${profile?.following_count ?? 0})`,
      children: (
        <Spin spinning={followingLoading}>
          {following.length === 0 && !followingLoading ? (
            <Empty description="暂无关注" />
          ) : (
            <List
              dataSource={following}
              renderItem={renderUserItem}
              locale={{ emptyText: '暂无关注' }}
            />
          )}
        </Spin>
      ),
    },
    {
      key: 'followers',
      label: `粉丝 (${profile?.followers_count ?? 0})`,
      children: (
        <Spin spinning={followersLoading}>
          {followers.length === 0 && !followersLoading ? (
            <Empty description="暂无粉丝" />
          ) : (
            <List
              dataSource={followers}
              renderItem={renderUserItem}
              locale={{ emptyText: '暂无粉丝' }}
            />
          )}
        </Spin>
      ),
    },
  ]

  if (loading && !profile) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    )
  }

  if (!profile) {
    return <Empty description="用户不存在" />
  }

  const displayName = profile.nickname || profile.username

  return (
    <div>
      <h1 className="page-title">用户主页</h1>
      <p className="page-description">查看用户信息、发布的模型及社交关系。</p>

      <Card style={{ marginBottom: 24 }}>
        <Row align="middle" gutter={24}>
          <Col>
            <Avatar
              size={80}
              style={{
                backgroundColor: '#1890ff',
                fontSize: 36,
                fontWeight: 600,
              }}
            >
              {displayName[0]?.toUpperCase() || '?'}
            </Avatar>
          </Col>
          <Col flex="auto">
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 600, marginRight: 12 }}>
                {displayName}
              </span>
              {profile.nickname && (
                <span style={{ fontSize: 14, color: '#999' }}>@{profile.username}</span>
              )}
            </div>
            <Space size={24} style={{ marginBottom: 12 }}>
              <span style={{ color: '#999', fontSize: 13 }}>
                <CalendarOutlined style={{ marginRight: 4 }} />
                注册于 {new Date(profile.created_at).toLocaleDateString()}
              </span>
            </Space>
            <Row gutter={32}>
              <Col>
                <Statistic
                  title="关注"
                  value={profile.following_count}
                  prefix={<TeamOutlined />}
                  valueStyle={{ fontSize: 18 }}
                />
              </Col>
              <Col>
                <Statistic
                  title="粉丝"
                  value={profile.followers_count}
                  prefix={<UserOutlined />}
                  valueStyle={{ fontSize: 18 }}
                />
              </Col>
              <Col>
                <Statistic
                  title="模型"
                  value={profile.models_count}
                  prefix={<GlobalOutlined />}
                  valueStyle={{ fontSize: 18 }}
                />
              </Col>
            </Row>
          </Col>
          <Col>
            {!isSelf && currentUser && (
              <Button
                type={profile.is_following ? 'default' : 'primary'}
                size="large"
                loading={followLoading}
                onClick={handleFollow}
              >
                {profile.is_following ? '已关注' : '关注'}
              </Button>
            )}
          </Col>
        </Row>
      </Card>

      <Card>
        <Tabs activeKey={activeTab} onChange={handleTabChange} items={tabItems} />
      </Card>
    </div>
  )
}

export default UserProfile
