import React, { useEffect, useState } from 'react'
import {
  Card,
  Row,
  Col,
  Avatar,
  Tag,
  Button,
  Tabs,
  Form,
  Input,
  Table,
  Empty,
  Spin,
  message,
  Descriptions,
  Statistic,
  List,
  Space,
  Modal,
} from 'antd'
import {
  LockOutlined,
  StarOutlined,
  TrophyOutlined,
  GlobalOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  LockFilled,
  ThunderboltOutlined,
  EditOutlined,
  TeamOutlined,
  UserOutlined,
  BellOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/store'
import { authApi, pointsApi, communityApi, socialApi } from '@/services/api'
import api from '@/services/api'
import { PointTransaction, AchievementBadge, CommunityModel, FollowUser, FollowingUpdate } from '@/types'

const BADGE_ICON_MAP: Record<string, { icon: React.ReactNode; color: string }> = {
  first_model: { icon: <GlobalOutlined />, color: '#13c2c2' },
  first_training: { icon: <ThunderboltOutlined />, color: '#52c41a' },
  first_publish: { icon: <GlobalOutlined />, color: '#1890ff' },
  first_pk: { icon: <ThunderboltOutlined />, color: '#faad14' },
  pk_winner_1: { icon: <TrophyOutlined />, color: '#fa8c16' },
  pk_winner_10: { icon: <TrophyOutlined />, color: '#f5222d' },
  popular_10: { icon: <StarOutlined />, color: '#eb2f96' },
  popular_100: { icon: <StarOutlined />, color: '#722ed1' },
  signal_master: { icon: <GlobalOutlined />, color: '#2f54eb' },
  daily_7: { icon: <CalendarOutlined />, color: '#faad14' },
  daily_30: { icon: <CalendarOutlined />, color: '#f5222d' },
  points_100: { icon: <StarOutlined />, color: '#52c41a' },
  points_1000: { icon: <StarOutlined />, color: '#722ed1' },
}

const MODEL_TYPE_COLORS: Record<string, string> = {
  lstm: 'blue',
  gru: 'cyan',
  xgboost: 'green',
  lightgbm: 'lime',
  randomforest: 'orange',
  mlp: 'purple',
}

const UPDATE_TYPE_LABELS: Record<string, string> = {
  new_model: '发布了新模型',
  new_signal: '发布了新信号',
}

const Profile: React.FC = () => {
  const { user, setUser } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [balance, setBalance] = useState<number>(0)
  const [level, setLevel] = useState<number>(1)
  const [checkedIn, setCheckedIn] = useState(false)
  const [checkinLoading, setCheckinLoading] = useState(false)
  const [transactions, setTransactions] = useState<PointTransaction[]>([])
  const [transactionsLoading, setTransactionsLoading] = useState(false)
  const [achievements, setAchievements] = useState<AchievementBadge[]>([])
  const [achievementsLoading, setAchievementsLoading] = useState(false)
  const [myModels, setMyModels] = useState<CommunityModel[]>([])
  const [myModelsLoading, setMyModelsLoading] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('password')

  const [nicknameEditing, setNicknameEditing] = useState(false)
  const [nicknameValue, setNicknameValue] = useState('')
  const [nicknameLoading, setNicknameLoading] = useState(false)

  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [followers, setFollowers] = useState<FollowUser[]>([])
  const [following, setFollowing] = useState<FollowUser[]>([])
  const [followersLoading, setFollowersLoading] = useState(false)
  const [followingLoading, setFollowingLoading] = useState(false)
  const [followersModalOpen, setFollowersModalOpen] = useState(false)
  const [followingModalOpen, setFollowingModalOpen] = useState(false)

  const [followingUpdates, setFollowingUpdates] = useState<FollowingUpdate[]>([])
  const [followingUpdatesLoading, setFollowingUpdatesLoading] = useState(false)

  useEffect(() => {
    fetchBalance()
    fetchSocialCounts()
  }, [])

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && tab !== activeTab) {
      setActiveTab(tab)
      if (tab === 'following-updates') fetchFollowingUpdates()
    }
  }, [searchParams])

  const fetchBalance = async () => {
    try {
      const data = await pointsApi.getBalance()
      setBalance((data as any)?.total_points ?? 0)
      setLevel((data as any)?.level ?? 1)
    } catch {
      message.error('获取积分信息失败')
    }
  }

  const fetchSocialCounts = async () => {
    if (!user?.id) return
    try {
      const data = await socialApi.getUserProfile(user.id)
      setFollowersCount((data as any)?.followers_count ?? 0)
      setFollowingCount((data as any)?.following_count ?? 0)
    } catch {}
  }

  const handleNicknameEdit = () => {
    setNicknameValue((user as any)?.nickname || '')
    setNicknameEditing(true)
  }

  const handleNicknameSave = async () => {
    setNicknameLoading(true)
    try {
      await api.put('/auth/me', { nickname: nicknameValue })
      const freshUser = await authApi.getMe()
      setUser(freshUser as any)
      setNicknameEditing(false)
      message.success('昵称更新成功')
    } catch (error: any) {
      const detail = error?.response?.data?.detail || '昵称更新失败'
      message.error(typeof detail === 'string' ? detail : '昵称更新失败')
    } finally {
      setNicknameLoading(false)
    }
  }

  const handleNicknameCancel = () => {
    setNicknameEditing(false)
  }

  const handleCheckin = async () => {
    setCheckinLoading(true)
    try {
      await pointsApi.dailyCheckin()
      message.success('签到成功！')
      setCheckedIn(true)
      fetchBalance()
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message || '签到失败'
      if (typeof detail === 'string' && detail.includes('already')) {
        message.info('今日已签到')
        setCheckedIn(true)
      } else {
        message.error(typeof detail === 'string' ? detail : '签到失败')
      }
    } finally {
      setCheckinLoading(false)
    }
  }

  const fetchTransactions = async () => {
    setTransactionsLoading(true)
    try {
      const data = await pointsApi.getTransactions()
      setTransactions((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch {
      message.error('获取积分记录失败')
    } finally {
      setTransactionsLoading(false)
    }
  }

  const fetchAchievements = async () => {
    setAchievementsLoading(true)
    try {
      await pointsApi.checkAchievements()
      const data = await pointsApi.getAllAchievements()
      setAchievements(data as any)
    } catch {
      message.error('获取成就列表失败')
    } finally {
      setAchievementsLoading(false)
    }
  }

  const fetchMyModels = async () => {
    if (!user?.id) return
    setMyModelsLoading(true)
    try {
      const data = await communityApi.getModels({ user_id: user.id })
      setMyModels((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch {
      message.error('获取我的发布失败')
    } finally {
      setMyModelsLoading(false)
    }
  }

  const fetchFollowers = async () => {
    if (!user?.id) return
    setFollowersLoading(true)
    try {
      const data = await socialApi.getFollowers(user.id, { page_size: 50 })
      setFollowers((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch {
      message.error('获取粉丝列表失败')
    } finally {
      setFollowersLoading(false)
    }
  }

  const fetchFollowing = async () => {
    if (!user?.id) return
    setFollowingLoading(true)
    try {
      const data = await socialApi.getFollowing(user.id, { page_size: 50 })
      setFollowing((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch {
      message.error('获取关注列表失败')
    } finally {
      setFollowingLoading(false)
    }
  }

  const fetchFollowingUpdates = async () => {
    setFollowingUpdatesLoading(true)
    try {
      const data = await socialApi.getFollowingUpdates()
      setFollowingUpdates((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch {
      message.error('获取关注动态失败')
    } finally {
      setFollowingUpdatesLoading(false)
    }
  }

  const handleFollowToggle = async (targetUserId: number, isFollowing: boolean) => {
    try {
      if (isFollowing) {
        await socialApi.unfollowUser(targetUserId)
      } else {
        await socialApi.followUser(targetUserId)
      }
      fetchSocialCounts()
      if (followersModalOpen) fetchFollowers()
      if (followingModalOpen) fetchFollowing()
    } catch {
      message.error('操作失败')
    }
  }

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    if (key === 'transactions' && transactions.length === 0) fetchTransactions()
    if (key === 'achievements' && achievements.length === 0) fetchAchievements()
    if (key === 'models' && myModels.length === 0) fetchMyModels()
    if (key === 'following-updates' && followingUpdates.length === 0) fetchFollowingUpdates()
  }

  const handlePasswordSubmit = async (values: { old_password: string; new_password: string }) => {
    setPasswordLoading(true)
    try {
      await authApi.changePassword({
        old_password: values.old_password,
        new_password: values.new_password,
      })
      message.success('密码修改成功')
      passwordForm.resetFields()
    } catch (error: any) {
      const detail = error?.response?.data?.detail || '密码修改失败'
      message.error(typeof detail === 'string' ? detail : '密码修改失败')
    } finally {
      setPasswordLoading(false)
    }
  }

  const [passwordForm] = Form.useForm()

  const renderFollowUserItem = (item: FollowUser) => (
    <List.Item
      actions={[
        user?.id !== item.id ? (
          <Button
            size="small"
            type={item.is_following ? 'default' : 'primary'}
            onClick={() => handleFollowToggle(item.id, !!item.is_following)}
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
            onClick={() => {
              setFollowersModalOpen(false)
              setFollowingModalOpen(false)
              navigate(`/user/${item.id}`)
            }}
          >
            {(item.nickname || item.username)?.[0]?.toUpperCase() || '?'}
          </Avatar>
        }
        title={
          <a
            onClick={() => {
              setFollowersModalOpen(false)
              setFollowingModalOpen(false)
              navigate(`/user/${item.id}`)
            }}
          >
            {item.nickname || item.username}
          </a>
        }
        description={item.nickname ? `@${item.username}` : undefined}
      />
    </List.Item>
  )

  const transactionColumns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: '类型',
      dataIndex: 'action',
      key: 'action',
      render: (action: string) => {
        const actionLabels: Record<string, string> = {
          daily_checkin: '每日签到',
          create_model: '创建模型',
          training_complete: '训练完成',
          publish_model: '发布模型',
          pk_win: 'PK获胜',
          achievement_bonus: '成就奖励',
          daily_challenge: '每日挑战',
        }
        return actionLabels[action] || action
      },
    },
    {
      title: '积分变动',
      dataIndex: 'points',
      key: 'points',
      render: (points: number) => (
        <span style={{ color: points > 0 ? '#52c41a' : '#f5222d', fontWeight: 600 }}>
          {points > 0 ? `+${points}` : points}
        </span>
      ),
    },
    {
      title: '说明',
      dataIndex: 'description',
      key: 'description',
      render: (v: string) => v || '-',
    },
  ]

  const earnedCount = achievements.filter((a) => a.earned).length

  const tabItems = [
    {
      key: 'password',
      label: (
        <span>
          <LockOutlined /> 修改密码
        </span>
      ),
      children: (
        <Card style={{ maxWidth: 480 }}>
          <Form
            form={passwordForm}
            layout="vertical"
            onFinish={handlePasswordSubmit}
            autoComplete="off"
          >
            <Form.Item
              name="old_password"
              label="旧密码"
              rules={[{ required: true, message: '请输入旧密码' }]}
            >
              <Input.Password placeholder="请输入旧密码" />
            </Form.Item>
            <Form.Item
              name="new_password"
              label="新密码"
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 6, message: '密码至少6位' },
              ]}
            >
              <Input.Password placeholder="请输入新密码" />
            </Form.Item>
            <Form.Item
              name="confirm_password"
              label="确认新密码"
              dependencies={['new_password']}
              rules={[
                { required: true, message: '请确认新密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('new_password') === value) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'))
                  },
                }),
              ]}
            >
              <Input.Password placeholder="请再次输入新密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={passwordLoading}>
                修改密码
              </Button>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
    {
      key: 'transactions',
      label: (
        <span>
          <StarOutlined /> 积分记录
        </span>
      ),
      children: (
        <Table
          columns={transactionColumns}
          dataSource={transactions}
          rowKey="id"
          loading={transactionsLoading}
          pagination={{ pageSize: 10 }}
        />
      ),
    },
    {
      key: 'achievements',
      label: (
        <span>
          <TrophyOutlined /> 我的成就 ({earnedCount}/{achievements.length})
        </span>
      ),
      children: (
        <Spin spinning={achievementsLoading}>
          {achievements.length === 0 && !achievementsLoading ? (
            <Empty description="暂无成就数据">
              <Button type="primary" onClick={fetchAchievements}>
                检查新成就
              </Button>
            </Empty>
          ) : (
            <>
              <div
                style={{
                  marginBottom: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ color: '#999' }}>
                  已解锁 {earnedCount}/{achievements.length} 个成就
                </span>
                <Button
                  type="primary"
                  icon={<TrophyOutlined />}
                  onClick={fetchAchievements}
                  loading={achievementsLoading}
                >
                  检查新成就
                </Button>
              </div>
              <Row gutter={[16, 16]}>
                {achievements.map((badge) => {
                  const config = BADGE_ICON_MAP[badge.badge_type] || {
                    icon: <StarOutlined />,
                    color: '#999',
                  }
                  return (
                    <Col xs={12} sm={8} md={6} key={badge.badge_type}>
                      <Card
                        hoverable
                        style={{
                          textAlign: 'center',
                          opacity: badge.earned ? 1 : 0.5,
                          borderColor: badge.earned ? config.color : '#d9d9d9',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 36,
                            color: badge.earned ? config.color : '#d9d9d9',
                            marginBottom: 8,
                          }}
                        >
                          {badge.earned ? config.icon : <LockFilled />}
                        </div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{badge.badge_name}</div>
                        <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
                          {badge.description}
                        </div>
                        <Tag color={badge.earned ? config.color : 'default'}>
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
            </>
          )}
        </Spin>
      ),
    },
    {
      key: 'models',
      label: (
        <span>
          <GlobalOutlined /> 我的发布
        </span>
      ),
      children: (
        <Spin spinning={myModelsLoading}>
          {myModels.length === 0 && !myModelsLoading ? (
            <Empty description="暂未发布任何社区模型" />
          ) : (
            <Row gutter={[16, 16]}>
              {myModels.map((model) => (
                <Col xs={24} sm={12} lg={8} key={model.id}>
                  <Card hoverable style={{ height: '100%' }}>
                    <div style={{ marginBottom: 12 }}>
                      <Tag color={MODEL_TYPE_COLORS[model.model_type] || 'default'}>
                        {model.model_type.toUpperCase()}
                      </Tag>
                      {model.metrics && model.metrics.accuracy !== undefined && (
                        <Tag color="blue">
                          准确率 {(model.metrics.accuracy * 100).toFixed(1)}%
                        </Tag>
                      )}
                    </div>
                    <h3 style={{ marginBottom: 8 }}>{model.name}</h3>
                    <p style={{ color: '#999', fontSize: 13, marginBottom: 12, minHeight: 40 }}>
                      {model.description || '暂无描述'}
                    </p>
                    <Row justify="space-between" align="middle">
                      <Col>
                        <span style={{ color: '#eb2f96', fontSize: 13 }}>
                          ❤ {model.likes_count}
                        </span>
                      </Col>
                      <Col>
                        <span style={{ color: '#999', fontSize: 13 }}>
                          📋 {model.clones_count} 次克隆
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
      key: 'following-updates',
      label: (
        <span>
          <BellOutlined /> 关注动态
        </span>
      ),
      children: (
        <Spin spinning={followingUpdatesLoading}>
          {followingUpdates.length === 0 && !followingUpdatesLoading ? (
            <Empty description="暂无关注动态" />
          ) : (
            <List
              dataSource={followingUpdates}
              renderItem={(item) => (
                <List.Item
                  actions={
                    item.target_id && item.type === 'new_model'
                      ? [
                          <Button
                            key="view"
                            size="small"
                            type="link"
                            onClick={() => navigate(`/community/model/${item.target_id}`)}
                          >
                            查看模型
                          </Button>,
                        ]
                      : undefined
                  }
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        size="small"
                        style={{ backgroundColor: '#1890ff', cursor: 'pointer' }}
                        onClick={() => navigate(`/user/${item.user_id}`)}
                      >
                        {(item.nickname || item.username)?.[0]?.toUpperCase() || '?'}
                      </Avatar>
                    }
                    title={
                      <a onClick={() => navigate(`/user/${item.user_id}`)}>
                        {item.nickname || item.username}
                      </a>
                    }
                    description={
                      <span>
                        {UPDATE_TYPE_LABELS[item.type] || item.type}
                        {item.description ? ` - ${item.description}` : ''}
                        <span style={{ marginLeft: 8, color: '#bbb', fontSize: 12 }}>
                          {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                        </span>
                      </span>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Spin>
      ),
    },
  ]

  const firstChar = ((user as any)?.nickname || user?.username)?.[0]?.toUpperCase() || '?'
  const displayName = (user as any)?.nickname || user?.username || ''
  const roleLabel = user?.is_admin ? '管理员' : '普通用户'
  const roleColor = user?.is_admin ? 'red' : 'blue'

  return (
    <div>
      <h1 className="page-title">个人中心</h1>
      <p className="page-description">查看和管理您的个人信息、积分、成就与发布内容。</p>

      <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={16}>
          <Card>
            <Row align="middle" gutter={24}>
              <Col>
                <Avatar
                  size={72}
                  style={{
                    backgroundColor: '#1890ff',
                    fontSize: 32,
                    fontWeight: 600,
                  }}
                >
                  {firstChar}
                </Avatar>
              </Col>
              <Col flex="auto">
                <Descriptions column={{ xs: 1, sm: 2 }} size="middle">
                  <Descriptions.Item label="昵称">
                    {nicknameEditing ? (
                      <Space>
                        <Input
                          size="small"
                          value={nicknameValue}
                          onChange={(e) => setNicknameValue(e.target.value)}
                          onPressEnter={handleNicknameSave}
                          style={{ width: 160 }}
                          maxLength={20}
                          placeholder="输入昵称"
                        />
                        <Button size="small" type="primary" loading={nicknameLoading} onClick={handleNicknameSave}>
                          保存
                        </Button>
                        <Button size="small" onClick={handleNicknameCancel}>
                          取消
                        </Button>
                      </Space>
                    ) : (
                      <Space>
                        <span style={{ fontSize: 18, fontWeight: 600 }}>{displayName}</span>
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={handleNicknameEdit}
                        />
                      </Space>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="用户名">
                    <span style={{ fontSize: 14, color: '#666' }}>@{user?.username}</span>
                  </Descriptions.Item>
                  <Descriptions.Item label="角色">
                    <Tag color={roleColor}>{roleLabel}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="邮箱">
                    {user?.email || '未设置'}
                  </Descriptions.Item>
                  <Descriptions.Item label="关注">
                    <a
                      onClick={() => {
                        fetchFollowing()
                        setFollowingModalOpen(true)
                      }}
                      style={{ fontWeight: 600, fontSize: 16 }}
                    >
                      <TeamOutlined style={{ marginRight: 4 }} />
                      {followingCount}
                    </a>
                  </Descriptions.Item>
                  <Descriptions.Item label="粉丝">
                    <a
                      onClick={() => {
                        fetchFollowers()
                        setFollowersModalOpen(true)
                      }}
                      style={{ fontWeight: 600, fontSize: 16 }}
                    >
                      <UserOutlined style={{ marginRight: 4 }} />
                      {followersCount}
                    </a>
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color={user?.is_active ? 'green' : 'red'}>
                      {user?.is_active ? '正常' : '已禁用'}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card>
            <Row gutter={16} align="middle" style={{ marginBottom: 16 }}>
              <Col span={12}>
                <Statistic
                  title="当前积分"
                  value={balance}
                  prefix={<StarOutlined style={{ color: '#faad14' }} />}
                  valueStyle={{ color: '#faad14' }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="当前等级"
                  value={level}
                  prefix={<TrophyOutlined style={{ color: '#1890ff' }} />}
                  valueStyle={{ color: '#1890ff' }}
                  suffix="级"
                />
              </Col>
            </Row>
            <Button
              type="primary"
              icon={<CalendarOutlined />}
              onClick={handleCheckin}
              loading={checkinLoading}
              disabled={checkedIn}
              block
            >
              {checkedIn ? '今日已签到' : '每日签到'}
            </Button>
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs activeKey={activeTab} onChange={handleTabChange} items={tabItems} />
      </Card>

      <Modal
        title="我的关注"
        open={followingModalOpen}
        onCancel={() => setFollowingModalOpen(false)}
        footer={null}
        width={480}
      >
        <Spin spinning={followingLoading}>
          {following.length === 0 && !followingLoading ? (
            <Empty description="暂无关注" />
          ) : (
            <List
              dataSource={following}
              renderItem={renderFollowUserItem}
              locale={{ emptyText: '暂无关注' }}
            />
          )}
        </Spin>
      </Modal>

      <Modal
        title="我的粉丝"
        open={followersModalOpen}
        onCancel={() => setFollowersModalOpen(false)}
        footer={null}
        width={480}
      >
        <Spin spinning={followersLoading}>
          {followers.length === 0 && !followersLoading ? (
            <Empty description="暂无粉丝" />
          ) : (
            <List
              dataSource={followers}
              renderItem={renderFollowUserItem}
              locale={{ emptyText: '暂无粉丝' }}
            />
          )}
        </Spin>
      </Modal>
    </div>
  )
}

export default Profile
