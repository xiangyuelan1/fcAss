import React, { useState } from 'react'
import {
  Card,
  Form,
  Input,
  Button,
  Tabs,
  message,
  Typography,
} from 'antd'
import {
  UserOutlined,
  LockOutlined,
  MailOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/store'

const { Text, Title } = Typography

const LoginPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('login')
  const [loginLoading, setLoginLoading] = useState(false)
  const [registerLoading, setRegisterLoading] = useState(false)
  const { login } = useAuthStore()

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoginLoading(true)
    try {
      await login(values.username, values.password)
      message.success('登录成功')
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      if (typeof detail === 'string') {
        message.error(detail)
      } else {
        message.error('登录失败，请检查用户名和密码')
      }
    } finally {
      setLoginLoading(false)
    }
  }

  const handleFreeRegister = async (values: { username: string; email?: string; password: string }) => {
    setRegisterLoading(true)
    try {
      const { register } = useAuthStore.getState()
      await register(values.username, values.email, values.password)
      message.success('注册成功')
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      if (typeof detail === 'string') {
        message.error(detail)
      } else if (Array.isArray(detail)) {
        message.error(detail.map((e: any) => e.msg).join(', '))
      } else {
        message.error('注册失败，请稍后重试')
      }
    } finally {
      setRegisterLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: 420, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ marginBottom: 4 }}>A股预测训练平台</Title>
          <Text type="secondary">让每个用户都可以DIY自己的训练模型</Text>
        </div>

        <Tabs activeKey={activeTab} onChange={setActiveTab} centered items={[
          {
            key: 'login',
            label: '登录',
            children: (
              <Form onFinish={handleLogin} size="large">
                <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                  <Input prefix={<UserOutlined />} placeholder="用户名" />
                </Form.Item>
                <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
                  <Input.Password prefix={<LockOutlined />} placeholder="密码" />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={loginLoading} block>
                    登录
                  </Button>
                </Form.Item>
              </Form>
            ),
          },
          {
            key: 'register',
            label: '注册',
            children: (
              <Form onFinish={handleFreeRegister} size="large">
                <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                  <Input prefix={<UserOutlined />} placeholder="用户名" />
                </Form.Item>
                <Form.Item name="email">
                  <Input prefix={<MailOutlined />} placeholder="邮箱（选填）" />
                </Form.Item>
                <Form.Item name="password" rules={[
                  { required: true, message: '请输入密码' },
                  { min: 6, message: '密码至少6位' },
                ]}>
                  <Input.Password prefix={<LockOutlined />} placeholder="密码" />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={registerLoading} block>
                    注册
                  </Button>
                </Form.Item>
              </Form>
            ),
          },
        ]} />
      </Card>
    </div>
  )
}

export default LoginPage
