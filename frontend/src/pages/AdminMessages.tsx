import React, { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Tag,
  Badge,
  Space,
  Typography,
  Select,
  message as antMessage,
} from 'antd'
import {
  MessageOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { messageApi } from '@/services/api'
import type { Message } from '@/types'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

const AdminMessages: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [filterRead, setFilterRead] = useState<boolean | undefined>(undefined)
  const [replyVisible, setReplyVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [replying, setReplying] = useState(false)
  const [replyForm] = Form.useForm()

  const PAGE_SIZE = 15

  const fetchMessages = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { page, page_size: PAGE_SIZE }
      if (filterRead !== undefined) {
        params.is_read = filterRead
      }
      const res: any = await messageApi.adminGetAll(params)
      setMessages(res.items || [])
      setTotal(res.total || 0)
    } catch {
      antMessage.error('获取消息列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, filterRead])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  const handleReply = async (values: { content: string }) => {
    if (!selectedMessage) return
    setReplying(true)
    try {
      await messageApi.adminReply(selectedMessage.id, values.content)
      antMessage.success('回复已发送')
      setReplyVisible(false)
      replyForm.resetFields()
      fetchMessages()
    } catch {
      antMessage.error('回复失败，请重试')
    } finally {
      setReplying(false)
    }
  }

  const handleMarkRead = async (msg: Message) => {
    try {
      await messageApi.adminMarkRead(msg.id)
      antMessage.success('已标记为已读')
      fetchMessages()
    } catch {
      antMessage.error('操作失败')
    }
  }

  const openReply = (msg: Message) => {
    setSelectedMessage(msg)
    setReplyVisible(true)
  }

  const openDetail = (msg: Message) => {
    setSelectedMessage(msg)
    setDetailVisible(true)
  }

  const renderReplies = (replies: Message[]) => {
    if (!replies || replies.length === 0) return <Text type="secondary">暂无回复</Text>
    return (
      <div style={{ marginTop: 8 }}>
        {replies.map((reply) => (
          <div key={reply.id} style={{ marginBottom: 8, paddingLeft: 12, borderLeft: '2px solid #1890ff' }}>
            <Space>
              <Tag color="blue">{reply.sender_name || '管理员'}</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>{reply.created_at}</Text>
            </Space>
            <Paragraph style={{ marginTop: 4, marginBottom: 0 }}>{reply.content}</Paragraph>
          </div>
        ))}
      </div>
    )
  }

  const columns = [
    {
      title: '状态',
      dataIndex: 'is_read',
      key: 'is_read',
      width: 80,
      render: (isRead: boolean) =>
        isRead ? <Tag>已读</Tag> : <Tag color="red">未读</Tag>,
    },
    {
      title: '发送者',
      dataIndex: 'sender_name',
      key: 'sender_name',
      width: 120,
    },
    {
      title: '主题',
      dataIndex: 'subject',
      key: 'subject',
      ellipsis: true,
    },
    {
      title: '内容预览',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      render: (text: string) => text.length > 50 ? text.slice(0, 50) + '...' : text,
    },
    {
      title: '回复数',
      key: 'reply_count',
      width: 80,
      render: (_: any, record: Message) => record.replies?.length || 0,
    },
    {
      title: '发送时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: Message) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => openDetail(record)}
          >
            查看
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<MessageOutlined />}
            onClick={() => openReply(record)}
          >
            回复
          </Button>
          {!record.is_read && (
            <Button
              size="small"
              onClick={() => handleMarkRead(record)}
            >
              已读
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Space>
            <Title level={4} style={{ margin: 0 }}>站内信管理</Title>
            <Badge
              count={messages.filter((m) => !m.is_read).length}
              style={{ backgroundColor: '#f5222d' }}
            />
          </Space>
          <Space>
            <Text>筛选：</Text>
            <Select
              value={filterRead}
              onChange={(val) => { setFilterRead(val); setPage(1) }}
              style={{ width: 120 }}
              options={[
                { label: '全部', value: undefined },
                { label: '未读', value: false },
                { label: '已读', value: true },
              ]}
              allowClear={false}
            />
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={messages}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            onChange: (p) => setPage(p),
            showTotal: (t) => `共 ${t} 条`,
          }}
          scroll={{ x: 900 }}
        />
      </Card>

      {/* 回复弹窗 */}
      <Modal
        title={
          <Space>
            <MessageOutlined />
            <span>回复消息</span>
          </Space>
        }
        open={replyVisible}
        onCancel={() => { setReplyVisible(false); replyForm.resetFields() }}
        footer={null}
        width={560}
      >
        {selectedMessage && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 6 }}>
            <Space>
              <Tag>{selectedMessage.sender_name}</Tag>
              <Text type="secondary">{selectedMessage.created_at}</Text>
            </Space>
            <Title level={5} style={{ marginTop: 8, marginBottom: 4 }}>{selectedMessage.subject}</Title>
            <Paragraph style={{ marginBottom: 0 }}>{selectedMessage.content}</Paragraph>
          </div>
        )}
        <Form form={replyForm} layout="vertical" onFinish={handleReply}>
          <Form.Item
            name="content"
            label="回复内容"
            rules={[{ required: true, message: '请输入回复内容' }]}
          >
            <TextArea rows={4} placeholder="请输入回复内容..." maxLength={5000} showCount />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setReplyVisible(false); replyForm.resetFields() }}>取消</Button>
              <Button type="primary" htmlType="submit" loading={replying} icon={<MessageOutlined />}>
                发送回复
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        title="消息详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={
          selectedMessage && !selectedMessage.is_read ? (
            <Space>
              <Button onClick={() => setDetailVisible(false)}>关闭</Button>
              <Button
                type="primary"
                onClick={async () => {
                  if (selectedMessage) {
                    await handleMarkRead(selectedMessage)
                    setDetailVisible(false)
                  }
                }}
              >
                标记已读
              </Button>
            </Space>
          ) : null
        }
        width={640}
      >
        {selectedMessage && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Space>
                <Tag>{selectedMessage.sender_name}</Tag>
                <Text type="secondary">{selectedMessage.created_at}</Text>
                {!selectedMessage.is_read && <Tag color="red">未读</Tag>}
              </Space>
              <Title level={5} style={{ marginTop: 8, marginBottom: 4 }}>{selectedMessage.subject}</Title>
              <Paragraph>{selectedMessage.content}</Paragraph>
            </div>
            <div>
              <Text strong>回复记录：</Text>
              {renderReplies(selectedMessage.replies || [])}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default AdminMessages
