import React, { useEffect, useState } from 'react'
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  message,
  Modal,
  Form,
  Input,
  Descriptions,
  Popconfirm,
  Tooltip,
  Statistic,
  Row,
  Col,
  List,
  Spin,
  Tabs,
  Empty,
} from 'antd'
import {
  UserOutlined,
  LockOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CrownOutlined,
  ReloadOutlined,
  EyeOutlined,
  KeyOutlined,
  StopOutlined,
  CheckOutlined,
  RiseOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  StarOutlined,
  HistoryOutlined,
  GlobalOutlined,
  MailOutlined,
} from '@ant-design/icons'
import { adminApi } from '@/services/api'
import { AdminUser, AdminStats, ActivityItem } from '@/types'

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [resetModalVisible, setResetModalVisible] = useState(false)
  const [resetUserId, setResetUserId] = useState<number | null>(null)
  const [resetForm] = Form.useForm()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [userDetail, setUserDetail] = useState<any>(null)
  const [userDetailLoading, setUserDetailLoading] = useState(false)
  const [userStats, setUserStats] = useState<any>(null)

  useEffect(() => {
    fetchUsers()
    fetchStats()
    fetchActivity()
    fetchUserStats()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const data = await adminApi.listUsers()
      setUsers(data)
    } catch (error: any) {
      if (error?.response?.status === 403) {
        message.error('需要管理员权限')
      } else {
        message.error('获取用户列表失败')
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const data = await adminApi.getStats()
      setStats(data as any)
    } catch {
      message.error('获取统计信息失败')
    }
  }

  const fetchActivity = async () => {
    setActivityLoading(true)
    try {
      const data = await adminApi.getActivity({ limit: 20 })
      setActivities(data as any)
    } catch {
      message.error('获取活动日志失败')
    } finally {
      setActivityLoading(false)
    }
  }

  const fetchUserStats = async () => {
    try {
      const data = await adminApi.getUserStats()
      setUserStats(data as any)
    } catch {
      // 静默失败，不影响主流程
    }
  }

  const handleViewDetail = async (userId: number) => {
    setDetailModalVisible(true)
    setUserDetailLoading(true)
    try {
      const data = await adminApi.getUserDetail(userId)
      setUserDetail(data as any)
    } catch {
      message.error('获取用户详情失败')
    } finally {
      setUserDetailLoading(false)
    }
  }

  const handleResetPassword = async (values: { new_password: string }) => {
    if (!resetUserId) return
    try {
      const result = await adminApi.resetUserPassword(resetUserId, values)
      message.success(result.message || '密码重置成功')
      setResetModalVisible(false)
      resetForm.resetFields()
      fetchUsers()
    } catch (error) {
      message.error('密码重置失败')
    }
  }

  const handleToggleActive = async (userId: number) => {
    try {
      const result = await adminApi.toggleUserActive(userId)
      message.success(result.message || '操作成功')
      fetchUsers()
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '操作失败')
    }
  }

  const openResetModal = (userId: number) => {
    setResetUserId(userId)
    setResetModalVisible(true)
  }

  const getActivityIcon = (type: string) => {
    const icons: Record<string, React.ReactNode> = {
      user_register: <UserOutlined style={{ color: '#1890ff' }} />,
      model_publish: <RobotOutlined style={{ color: '#52c41a' }} />,
      pk_result: <ThunderboltOutlined style={{ color: '#faad14' }} />,
      points_change: <StarOutlined style={{ color: '#722ed1' }} />,
    }
    return icons[type] || <HistoryOutlined />
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (username: string, record: AdminUser) => (
        <Space>
          <UserOutlined />
          <strong>{username}</strong>
          {record.is_admin && <Tag icon={<CrownOutlined />} color="gold">管理员</Tag>}
        </Space>
      ),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      render: (email: string | null) => email || <Tag>未设置</Tag>,
    },
    {
      title: '状态',
      key: 'status',
      width: 120,
      render: (_: any, record: AdminUser) => (
        <Space direction="vertical" size={2}>
          <Tag icon={record.is_active ? <CheckCircleOutlined /> : <CloseCircleOutlined />} color={record.is_active ? 'success' : 'error'}>
            {record.is_active ? '活跃' : '禁用'}
          </Tag>
          {record.is_online && (
            <Tag icon={<GlobalOutlined />} color="processing" style={{ fontSize: 11 }}>
              在线
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: '最后登录',
      key: 'last_login',
      width: 160,
      render: (_: any, record: AdminUser) => (
        <div>
          <div style={{ fontSize: 12 }}>
            {record.last_login_at ? new Date(record.last_login_at).toLocaleString() : '-'}
          </div>
          {record.last_login_ip && (
            <div style={{ fontSize: 11, color: '#999' }}>IP: {record.last_login_ip}</div>
          )}
        </div>
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string | null) => date ? new Date(date).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: AdminUser) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record.id)}
            />
          </Tooltip>
          {!record.is_admin && (
            <>
              <Tooltip title="重置密码">
                <Button
                  type="text"
                  icon={<KeyOutlined />}
                  onClick={() => openResetModal(record.id)}
                />
              </Tooltip>
              <Popconfirm
                title={record.is_active ? '确认禁用该用户？' : '确认启用该用户？'}
                onConfirm={() => handleToggleActive(record.id)}
              >
                <Tooltip title={record.is_active ? '禁用用户' : '启用用户'}>
                  <Button
                    type="text"
                    danger={record.is_active}
                    icon={record.is_active ? <StopOutlined /> : <CheckOutlined />}
                  />
                </Tooltip>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ]

  const activeCount = users.filter(u => u.is_active).length
  const adminCount = users.filter(u => u.is_admin).length

  return (
    <div>
      <h1 className="page-title">用户管理</h1>
      <p className="page-description">
        管理系统用户账户，查看用户详情、重置密码、启用/禁用账户。
      </p>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="总用户数"
              value={stats?.users.total ?? users.length}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="活跃用户"
              value={stats?.users.active ?? activeCount}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="管理员"
              value={stats?.users.admins ?? adminCount}
              prefix={<CrownOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="今日新增"
              value={stats?.users.new_today ?? 0}
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {stats && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="模型总数"
                value={stats.models.total}
                prefix={<RobotOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
                已训练 {stats.models.trained} · 社区发布 {stats.models.community_published}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="训练任务"
                value={stats.training.total_tasks}
                prefix={<ThunderboltOutlined />}
                valueStyle={{ color: '#faad14' }}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
                完成 {stats.training.completed} · 运行中 {stats.training.running} · 失败 {stats.training.failed}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="股票数据"
                value={stats.data.stocks}
                prefix={<DatabaseOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
                价格记录 {stats.data.price_records.toLocaleString()}
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="积分发放总量"
                value={stats.points.total_distributed}
                prefix={<StarOutlined />}
                valueStyle={{ color: '#722ed1' }}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
                社区模型 {stats.community.models} · 信号 {stats.community.signals} · PK {stats.community.pk_challenges}
              </div>
            </Card>
          </Col>
        </Row>
      )}

      {userStats && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="当前在线"
                value={(userStats as any).online?.count ?? 0}
                prefix={<GlobalOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={14}>
          <Card
            title="用户列表"
            extra={
              <Button icon={<ReloadOutlined />} onClick={() => { fetchUsers(); fetchStats(); fetchActivity(); }}>
                刷新
              </Button>
            }
          >
            <Table
              columns={columns}
              dataSource={users}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="最近活动" extra={<HistoryOutlined />}>
            <Spin spinning={activityLoading}>
              <List
                dataSource={activities}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={getActivityIcon(item.type)}
                      title={item.description}
                      description={item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                    />
                  </List.Item>
                )}
                locale={{ emptyText: '暂无活动记录' }}
                style={{ maxHeight: 500, overflow: 'auto' }}
              />
            </Spin>
          </Card>
        </Col>
      </Row>

      <Modal
        title={`用户详情 - ${userDetail?.username || ''}`}
        open={detailModalVisible}
        onCancel={() => { setDetailModalVisible(false); setUserDetail(null) }}
        footer={null}
        width={900}
      >
        <Spin spinning={userDetailLoading}>
          {userDetail && (
            <Tabs defaultActiveKey="info" items={[
              {
                key: 'info',
                label: '基本信息',
                children: (
                  <Descriptions bordered column={2}>
                    <Descriptions.Item label="用户ID">{userDetail.id}</Descriptions.Item>
                    <Descriptions.Item label="用户名">{userDetail.username}</Descriptions.Item>
                    <Descriptions.Item label="邮箱">{userDetail.email || '未设置'}</Descriptions.Item>
                    <Descriptions.Item label="状态">
                      <Space>
                        <Tag icon={userDetail.is_active ? <CheckCircleOutlined /> : <CloseCircleOutlined />} color={userDetail.is_active ? 'success' : 'error'}>
                          {userDetail.is_active ? '活跃' : '禁用'}
                        </Tag>
                        {userDetail.is_online && <Tag icon={<GlobalOutlined />} color="processing">在线</Tag>}
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="角色">
                      {userDetail.is_admin ? <Tag icon={<CrownOutlined />} color="gold">管理员</Tag> : <Tag>普通用户</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label="积分/等级">
                      {userDetail.stats?.total_points || 0} 分 / Lv.{userDetail.stats?.level || 0}
                    </Descriptions.Item>
                    <Descriptions.Item label="注册时间">
                      {userDetail.created_at ? new Date(userDetail.created_at).toLocaleString() : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="最后登录">
                      {userDetail.last_login_at ? new Date(userDetail.last_login_at).toLocaleString() : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="登录IP">
                      {userDetail.last_login_ip || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="最后心跳">
                      {userDetail.last_heartbeat ? new Date(userDetail.last_heartbeat).toLocaleString() : '-'}
                    </Descriptions.Item>
                  </Descriptions>
                ),
              },
              {
                key: 'stats',
                label: '使用统计',
                children: (
                  <Row gutter={[16, 16]}>
                    <Col span={6}><Card size="small"><Statistic title="模型数" value={userDetail.stats?.model_count || 0} prefix={<RobotOutlined />} /></Card></Col>
                    <Col span={6}><Card size="small"><Statistic title="已训练" value={userDetail.stats?.trained_count || 0} valueStyle={{ color: '#52c41a' }} /></Card></Col>
                    <Col span={6}><Card size="small"><Statistic title="训练任务" value={userDetail.stats?.training_count || 0} prefix={<ThunderboltOutlined />} /></Card></Col>
                    <Col span={6}><Card size="small"><Statistic title="训练完成" value={userDetail.stats?.training_completed || 0} valueStyle={{ color: '#52c41a' }} /></Card></Col>
                    <Col span={6}><Card size="small"><Statistic title="社区模型" value={userDetail.stats?.community_models || 0} prefix={<GlobalOutlined />} /></Card></Col>
                    <Col span={6}><Card size="small"><Statistic title="预测信号" value={userDetail.stats?.community_signals || 0} /></Card></Col>
                    <Col span={6}><Card size="small"><Statistic title="站内信" value={userDetail.stats?.messages_sent || 0} prefix={<MailOutlined />} /></Card></Col>
                    <Col span={6}><Card size="small"><Statistic title="积分" value={userDetail.stats?.total_points || 0} prefix={<StarOutlined />} /></Card></Col>
                  </Row>
                ),
              },
              {
                key: 'models',
                label: '模型列表',
                children: userDetail.models && userDetail.models.length > 0 ? (
                  <List
                    size="small"
                    dataSource={userDetail.models}
                    renderItem={(model: any) => (
                      <List.Item>
                        <List.Item.Meta
                          title={`${model.name} (ID: ${model.id})`}
                          description={`类型: ${model.model_type} | 状态: ${model.status} | 创建: ${model.created_at ? new Date(model.created_at).toLocaleString() : '-'}`}
                        />
                      </List.Item>
                    )}
                  />
                ) : <Empty description="暂无模型" />,
              },
              {
                key: 'trainings',
                label: '训练记录',
                children: userDetail.recent_trainings && userDetail.recent_trainings.length > 0 ? (
                  <List
                    size="small"
                    dataSource={userDetail.recent_trainings}
                    renderItem={(training: any) => (
                      <List.Item>
                        <List.Item.Meta
                          title={`训练任务 #${training.id}`}
                          description={`状态: ${training.status} | 开始: ${training.start_time ? new Date(training.start_time).toLocaleString() : '-'} | 结束: ${training.end_time ? new Date(training.end_time).toLocaleString() : '-'}`}
                        />
                      </List.Item>
                    )}
                  />
                ) : <Empty description="暂无训练记录" />,
              },
            ]} />
          )}
        </Spin>
      </Modal>

      <Modal
        title="重置密码"
        open={resetModalVisible}
        onCancel={() => { setResetModalVisible(false); resetForm.resetFields() }}
        onOk={() => resetForm.submit()}
      >
        <Form form={resetForm} onFinish={handleResetPassword} layout="vertical">
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default AdminUsers
