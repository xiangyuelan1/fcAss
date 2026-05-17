import React, { useEffect, useState } from 'react'
import {
  Card,
  Row,
  Col,
  Tag,
  Button,
  Space,
  List,
  Modal,
  Form,
  Input,
  Select,
  Avatar,
  message,
  Empty,
} from 'antd'
import {
  ThunderboltOutlined,
  TrophyOutlined,
  CrownOutlined,
  SwapOutlined,
  LineChartOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { pkApi, modelApi, communityApi } from '@/services/api'
import { PKChallenge, UserModel } from '@/types'

const PK_MODE_MAP: Record<string, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
  direction: {
    label: '涨跌方向',
    color: 'blue',
    icon: <SwapOutlined />,
    desc: '预测指定日期股票涨跌方向，方向正确者获胜',
  },
  multi_price: {
    label: '多维价格',
    color: 'green',
    icon: <LineChartOutlined />,
    desc: '预测开盘价、收盘价、最高价、最低价，综合误差最小者获胜',
  },
  trend_5d: {
    label: '5日趋势',
    color: 'orange',
    icon: <ThunderboltOutlined />,
    desc: '预测未来5日价格走势，趋势吻合度最高者获胜',
  },
  custom: {
    label: '自定义',
    color: 'purple',
    icon: <SettingOutlined />,
    desc: '自定义PK规则和评判标准，由发起者设定',
  },
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  open: { label: '等待应战', color: 'blue' },
  accepted: { label: '已接受', color: 'green' },
  evaluating: { label: '待评估', color: 'orange' },
  completed: { label: '已完成', color: 'default' },
  cancelled: { label: '已取消', color: 'red' },
}

const PKArena: React.FC = () => {
  const [challenges, setChallenges] = useState<PKChallenge[]>([])
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [myModels, setMyModels] = useState<UserModel[]>([])
  const [communityModels, setCommunityModels] = useState<any[]>([])
  const [, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [acceptModalOpen, setAcceptModalOpen] = useState(false)
  const [acceptChallenge, setAcceptChallenge] = useState<PKChallenge | null>(null)
  const [defenderModelId, setDefenderModelId] = useState<number | null>(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    fetchChallenges()
    fetchLeaderboard()
    fetchMyModels()
    fetchCommunityModels()
  }, [])

  const fetchChallenges = async () => {
    setLoading(true)
    try {
      const data = await pkApi.getChallenges()
      setChallenges((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch (error) {
      message.error('获取PK列表失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchLeaderboard = async () => {
    try {
      const data = await pkApi.getLeaderboard({ type: 'pk_accuracy', page_size: 10 })
      setLeaderboard((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch (error) {
      message.error('获取PK排行榜失败')
    }
  }

  const fetchMyModels = async () => {
    try {
      const data = await modelApi.getModels()
      const models = (data as any)?.items || (Array.isArray(data) ? data : [])
      setMyModels(models.filter((m: UserModel) => m.status === 'trained'))
    } catch (error) {
      message.error('获取我的模型失败')
    }
  }

  const fetchCommunityModels = async () => {
    try {
      const data = await communityApi.getModels({ page_size: 100 })
      setCommunityModels((data as any)?.items || data || [])
    } catch (error) {
      message.error('获取社区模型失败')
    }
  }

  const handleCreateChallenge = async (values: any) => {
    setSubmitting(true)
    try {
      await pkApi.createChallenge(values)
      message.success('PK挑战已发起')
      setModalOpen(false)
      form.resetFields()
      fetchChallenges()
    } catch (error) {
      message.error('发起PK失败')
    } finally {
      setSubmitting(false)
    }
  }

  const openAcceptModal = (challenge: PKChallenge) => {
    setAcceptChallenge(challenge)
    setDefenderModelId(null)
    setAcceptModalOpen(true)
  }

  const handleAccept = async () => {
    if (!acceptChallenge || !defenderModelId) {
      message.warning('请选择应战模型')
      return
    }
    setAccepting(true)
    try {
      await pkApi.acceptChallenge(acceptChallenge.id, { defender_model_id: defenderModelId })
      message.success('已接受挑战')
      setAcceptModalOpen(false)
      setAcceptChallenge(null)
      setDefenderModelId(null)
      fetchChallenges()
    } catch (error) {
      message.error('接受挑战失败')
    } finally {
      setAccepting(false)
    }
  }

  const handleEvaluate = async (challenge: PKChallenge) => {
    try {
      await pkApi.evaluateChallenge(challenge.id)
      message.success('评估已触发')
      fetchChallenges()
    } catch (error) {
      message.error('评估失败')
    }
  }

  const activeChallenges = challenges.filter((c) => c.status !== 'completed' && c.status !== 'cancelled')
  const completedChallenges = challenges.filter((c) => c.status === 'completed')

  return (
    <div>
      <h1 className="page-title">PK竞技场</h1>
      <p className="page-description">
        与其他用户的模型进行PK对决，比拼预测能力，赢取积分和荣誉。
      </p>

      <Row justify="end" style={{ marginBottom: 24 }}>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={() => setModalOpen(true)}
          size="large"
        >
          发起PK
        </Button>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {Object.entries(PK_MODE_MAP).map(([key, mode]) => (
          <Col xs={24} sm={12} md={6} key={key}>
            <Card size="small" hoverable>
              <Space direction="vertical" size={4}>
                <Space>
                  <Tag color={mode.color} style={{ fontSize: 16 }}>{mode.icon}</Tag>
                  <span style={{ fontWeight: 500 }}>{mode.label}</span>
                </Space>
                <span style={{ fontSize: 12, color: '#999' }}>{mode.desc}</span>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="进行中的PK">
            {activeChallenges.length === 0 ? (
              <Empty description="暂无进行中的PK" />
            ) : (
              <List
                dataSource={activeChallenges}
                renderItem={(challenge) => {
                  const modeInfo = PK_MODE_MAP[challenge.pk_mode]
                  const statusInfo = STATUS_MAP[challenge.status]
                  return (
                    <List.Item
                      actions={[
                        challenge.status === 'open' && (
                          <Button
                            key="accept"
                            type="primary"
                            size="small"
                            onClick={() => openAcceptModal(challenge)}
                          >
                            应战
                          </Button>
                        ),
                        challenge.status === 'accepted' && (
                          <Button
                            key="evaluate"
                            size="small"
                            onClick={() => handleEvaluate(challenge)}
                          >
                            评估
                          </Button>
                        ),
                      ].filter(Boolean)}
                    >
                      <List.Item.Meta
                        avatar={
                          <Tag color={modeInfo?.color} style={{ fontSize: 18, padding: '4px 8px' }}>
                            {modeInfo?.icon}
                          </Tag>
                        }
                        title={
                          <Space>
                            <span>{challenge.challenger?.username || `用户${challenge.challenger_id}`}</span>
                            <SwapOutlined />
                            <span>{challenge.defender?.username || '等待应战'}</span>
                            <Tag color={statusInfo?.color}>{statusInfo?.label}</Tag>
                          </Space>
                        }
                        description={
                          <Space size={8}>
                            <Tag>{challenge.stock_code}</Tag>
                            <Tag>{modeInfo?.label}</Tag>
                            {challenge.prediction_date && (
                              <span style={{ fontSize: 12, color: '#999' }}>
                                预测日: {challenge.prediction_date}
                              </span>
                            )}
                          </Space>
                        }
                      />
                    </List.Item>
                  )
                }}
              />
            )}
          </Card>

          <Card title="已完成的PK" style={{ marginTop: 16 }}>
            {completedChallenges.length === 0 ? (
              <Empty description="暂无已完成的PK" />
            ) : (
              <List
                dataSource={completedChallenges}
                renderItem={(challenge) => {
                  const modeInfo = PK_MODE_MAP[challenge.pk_mode]
                  const isChallengerWin = challenge.winner_id === challenge.challenger_id
                  return (
                    <List.Item>
                      <List.Item.Meta
                        avatar={
                          <CrownOutlined
                            style={{
                              fontSize: 20,
                              color: '#faad14',
                            }}
                          />
                        }
                        title={
                          <Space>
                            <span style={{ color: isChallengerWin ? '#f5222d' : undefined, fontWeight: isChallengerWin ? 600 : 400 }}>
                              {challenge.challenger?.username || `用户${challenge.challenger_id}`}
                            </span>
                            <SwapOutlined />
                            <span style={{ color: !isChallengerWin ? '#f5222d' : undefined, fontWeight: !isChallengerWin ? 600 : 400 }}>
                              {challenge.defender?.username || `用户${challenge.defender_id}`}
                            </span>
                            <Tag color="gold">胜者: {isChallengerWin ? challenge.challenger?.username : challenge.defender?.username}</Tag>
                          </Space>
                        }
                        description={
                          <Space size={8}>
                            <Tag>{challenge.stock_code}</Tag>
                            <Tag>{modeInfo?.label}</Tag>
                            {challenge.evaluated_at && (
                              <span style={{ fontSize: 12, color: '#999' }}>
                                {new Date(challenge.evaluated_at).toLocaleDateString()}
                              </span>
                            )}
                          </Space>
                        }
                      />
                    </List.Item>
                  )
                }}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <TrophyOutlined style={{ color: '#faad14' }} />
                <span>PK排行榜</span>
              </Space>
            }
          >
            <List
              dataSource={leaderboard}
              renderItem={(user: any, index: number) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        size="small"
                        style={{
                          backgroundColor:
                            index === 0 ? '#f5222d' : index === 1 ? '#faad14' : index === 2 ? '#fa8c16' : '#1890ff',
                        }}
                      >
                        {index + 1}
                      </Avatar>
                    }
                    title={user.username || `用户${user.user_id}`}
                    description={
                      <Space>
                        <span>胜率 {((user.accuracy ?? 0) * 100).toFixed(0)}%</span>
                        <span>{user.wins ?? 0}胜 {(user.total ?? 0) - (user.wins ?? 0)}负</span>
                      </Space>
                    }
                  />
                </List.Item>
              )}
              locale={{ emptyText: '暂无排行数据' }}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title="发起PK挑战"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateChallenge}>
          <Form.Item
            name="challenger_model_id"
            label="我方模型"
            rules={[{ required: true, message: '请选择我方模型' }]}
          >
            <Select
              placeholder="选择我的已训练模型"
              options={myModels.map((m) => ({
                label: `${m.name} (${m.model_type.toUpperCase()})`,
                value: m.id,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="defender_model_id"
            label="对手模型"
          >
            <Select
              placeholder="选择对手（留空为公开挑战）"
              allowClear
              options={communityModels.map((m: any) => ({
                label: `${m.name} - ${m.author?.username || '匿名'} (${m.model_type?.toUpperCase()})`,
                value: m.id,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="stock_code"
            label="PK股票代码"
            rules={[{ required: true, message: '请输入股票代码' }]}
          >
            <Input placeholder="例如: 000001" />
          </Form.Item>
          <Form.Item
            name="pk_mode"
            label="PK模式"
            rules={[{ required: true, message: '请选择PK模式' }]}
          >
            <Select
              placeholder="选择PK模式"
              options={Object.entries(PK_MODE_MAP).map(([key, mode]) => ({
                label: mode.label,
                value: key,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="选择应战模型"
        open={acceptModalOpen}
        onCancel={() => {
          setAcceptModalOpen(false)
          setAcceptChallenge(null)
          setDefenderModelId(null)
        }}
        onOk={handleAccept}
        confirmLoading={accepting}
        okButtonProps={{ disabled: !defenderModelId }}
        okText="确认应战"
      >
        {myModels.length === 0 ? (
          <Empty description="暂无已训练模型，请先训练模型后再应战" />
        ) : (
          <div>
            <p style={{ marginBottom: 12, color: '#666' }}>
              选择一个已训练模型来应战此PK挑战：
            </p>
            <Select
              style={{ width: '100%' }}
              placeholder="请选择你的已训练模型"
              value={defenderModelId}
              onChange={setDefenderModelId}
              options={myModels.map((m) => ({
                label: `${m.name} (${m.model_type.toUpperCase()})`,
                value: m.id,
              }))}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}

export default PKArena
