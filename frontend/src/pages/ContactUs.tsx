import React, { useState, useEffect, useCallback } from 'react'
import {
  Card,
  List,
  Button,
  Modal,
  Form,
  Input,
  Badge,
  Typography,
  Space,
  Tag,
  Empty,
  message as antMessage,
  Spin,
} from 'antd'
import {
  SendOutlined,
  MailOutlined,
  MessageOutlined,
} from '@ant-design/icons'
import { messageApi } from '@/services/api'
import type { Message } from '@/types'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

const ContactUs: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [composeVisible, setComposeVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [sending, setSending] = useState(false)
  const [form] = Form.useForm()

  const PAGE_SIZE = 10

  const fetchMessages = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await messageApi.getMessages({ page, page_size: PAGE_SIZE })
      setMessages(res.items || [])
      setTotal(res.total || 0)
    } catch {
      antMessage.error('获取消息列表失败')
    } finally {
      setLoading(false)
    }
  }, [page])

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res: any = await messageApi.getUnreadCount()
      setUnreadCount(res.unread_count || 0)
    } catch {
      /* 静默处理未读计数获取失败 */
    }
  }, [])

  useEffect(() => {
    fetchMessages()
    fetchUnreadCount()
  }, [fetchMessages, fetchUnreadCount])

  const handleSend = async (values: { subject: string; content: string }) => {
    setSending(true)
    try {
      await messageApi.sendMessage(values)
      antMessage.success('消息已发送')
      setComposeVisible(false)
      form.resetFields()
      fetchMessages()
    } catch {
      antMessage.error('发送失败，请重试')
    } finally {
      setSending(false)
    }
  }

  const handleViewDetail = async (msg: Message) => {
    setSelectedMessage(msg)
    setDetailVisible(true)
    if (!msg.is_read && msg.receiver_id !== 0) {
      try {
        await messageApi.markRead(msg.id)
        fetchMessages()
        fetchUnreadCount()
      } catch {
        /* 标记已读失败不影响查看 */
      }
    }
  }

  const renderReplies = (replies: Message[]) => {
    if (!replies || replies.length === 0) return null
    return (
      <div style={{ marginLeft: 24, marginTop: 12, paddingLeft: 16, borderLeft: '2px solid #1890ff' }}>
        {replies.map((reply) => (
          <div key={reply.id} style={{ marginBottom: 12 }}>
            <Space>
              <Tag color={reply.sender_id === 0 ? 'blue' : 'green'}>
                {reply.sender_name || '开发团队'}
              </Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>{reply.created_at}</Text>
            </Space>
            <Paragraph style={{ marginTop: 4, marginBottom: 0 }}>{reply.content}</Paragraph>
          </div>
        ))}
      </div>
    )
  }

  const hasUnreadReplies = (msg: Message): boolean => {
    if (!msg.replies) return false
    return msg.replies.some((r) => !r.is_read)
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Space>
            <Title level={4} style={{ margin: 0 }}>联系开发团队</Title>
            {unreadCount > 0 && (
              <Badge count={unreadCount} style={{ marginLeft: 8 }} />
            )}
          </Space>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => setComposeVisible(true)}
          >
            发送消息
          </Button>
        </div>

        <Spin spinning={loading}>
          {messages.length === 0 && !loading ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无消息记录"
            />
          ) : (
            <List
              dataSource={messages}
              pagination={{
                current: page,
                pageSize: PAGE_SIZE,
                total,
                onChange: (p) => setPage(p),
                showTotal: (t) => `共 ${t} 条`,
              }}
              renderItem={(msg) => (
                <List.Item
                  style={{ cursor: 'pointer', padding: '12px 16px' }}
                  onClick={() => handleViewDetail(msg)}
                >
                  <List.Item.Meta
                    avatar={
                      <Badge dot={hasUnreadReplies(msg)} offset={[-4, 4]}>
                        <MessageOutlined style={{ fontSize: 20, color: '#1890ff' }} />
                      </Badge>
                    }
                    title={
                      <Space>
                        <span>{msg.subject}</span>
                        {!msg.is_read && msg.receiver_id !== 0 && (
                          <Tag color="red" style={{ fontSize: 11 }}>新回复</Tag>
                        )}
                        {hasUnreadReplies(msg) && (
                          <Tag color="blue" style={{ fontSize: 11 }}>有未读回复</Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={4}>
                        <Text type="secondary" ellipsis style={{ maxWidth: 500 }}>
                          {msg.content.length > 80 ? msg.content.slice(0, 80) + '...' : msg.content}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{msg.created_at}</Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Spin>
      </Card>

      {/* 发送消息弹窗 */}
      <Modal
        title="发送消息给开发团队"
        open={composeVisible}
        onCancel={() => { setComposeVisible(false); form.resetFields() }}
        footer={null}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleSend}>
          <Form.Item
            name="subject"
            label="主题"
            rules={[{ required: true, message: '请输入消息主题' }]}
          >
            <Input placeholder="请简要描述您的问题或建议" maxLength={200} showCount />
          </Form.Item>
          <Form.Item
            name="content"
            label="内容"
            rules={[{ required: true, message: '请输入消息内容' }]}
          >
            <TextArea
              placeholder="请详细描述您的问题、建议或反馈..."
              rows={6}
              maxLength={5000}
              showCount
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setComposeVisible(false); form.resetFields() }}>取消</Button>
              <Button type="primary" htmlType="submit" loading={sending} icon={<SendOutlined />}>
                发送
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 消息详情弹窗 */}
      <Modal
        title={
          <Space>
            <MailOutlined />
            <span>消息详情</span>
          </Space>
        }
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={640}
      >
        {selectedMessage && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Title level={5} style={{ marginBottom: 8 }}>{selectedMessage.subject}</Title>
              <Space>
                <Tag>{selectedMessage.sender_name || '我'}</Tag>
                <Text type="secondary">{selectedMessage.created_at}</Text>
              </Space>
              <Paragraph style={{ marginTop: 12 }}>{selectedMessage.content}</Paragraph>
            </div>
            {renderReplies(selectedMessage.replies || [])}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default ContactUs
