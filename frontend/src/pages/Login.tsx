import React, { useState } from 'react'
import {
  Form,
  Input,
  Button,
  Tabs,
  message,
  Typography,
  Divider,
} from 'antd'
import {
  UserOutlined,
  LockOutlined,
  MailOutlined,
  RocketOutlined,
  ThunderboltOutlined,
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
      message.success('🐂 登录成功，欢迎回来！')
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
      message.success('🐂 注册成功，开始你的量化之旅！')
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
      background: 'linear-gradient(135deg, #0c1445 0%, #1a0a3e 40%, #2d1b69 70%, #1a0a3e 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* 动态背景动画关键帧与装饰元素样式 */}
      <style>{`
        @keyframes float1 { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-20px) rotate(5deg); } }
        @keyframes float2 { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-30px) rotate(-5deg); } }
        @keyframes float3 { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-15px) scale(1.1); } }
        @keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 0.6; } }
        @keyframes gradientMove { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .login-bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          animation: pulse 6s ease-in-out infinite;
        }
        .login-float-emoji {
          position: absolute;
          font-size: 32px;
          opacity: 0.15;
          animation: float1 8s ease-in-out infinite;
        }
      `}</style>

      {/* 背景光球：营造深空氛围 */}
      <div className="login-bg-orb" style={{ width: 400, height: 400, background: 'rgba(24,144,255,0.15)', top: '-10%', right: '-5%', animationDelay: '0s' }} />
      <div className="login-bg-orb" style={{ width: 300, height: 300, background: 'rgba(114,46,209,0.15)', bottom: '-5%', left: '-5%', animationDelay: '2s' }} />
      <div className="login-bg-orb" style={{ width: 200, height: 200, background: 'rgba(82,196,26,0.1)', top: '40%', left: '20%', animationDelay: '4s' }} />

      {/* 浮动牛牛与金融主题 emoji */}
      <div className="login-float-emoji" style={{ top: '10%', left: '8%', animationDelay: '0s' }}>🐂</div>
      <div className="login-float-emoji" style={{ top: '25%', right: '12%', animationDelay: '2s', fontSize: 24 }}>📈</div>
      <div className="login-float-emoji" style={{ bottom: '20%', left: '15%', animationDelay: '4s', fontSize: 28 }}>💰</div>
      <div className="login-float-emoji" style={{ bottom: '10%', right: '8%', animationDelay: '1s' }}>🚀</div>
      <div className="login-float-emoji" style={{ top: '50%', left: '5%', animationDelay: '3s', fontSize: 24 }}>📊</div>

      {/* 登录卡片 */}
      <div style={{
        width: '100%',
        maxWidth: 440,
        margin: '0 16px',
        position: 'relative',
        zIndex: 10,
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: 20,
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
          padding: '40px 32px',
        }}>
          {/* Logo 区域：牛牛吉祥物 + 品牌标语 */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 56, marginBottom: 8, lineHeight: 1 }}>🐂</div>
            <Title level={3} style={{ color: '#fff', marginBottom: 4, fontWeight: 700, letterSpacing: 1 }}>
              AI量化训练
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
              让每个人都能DIY自己的预测模型
            </Text>
          </div>

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            centered
            style={{ marginBottom: 8 }}
            items={[
              {
                key: 'login',
                label: <span style={{ color: activeTab === 'login' ? '#fff' : 'rgba(255,255,255,0.4)' }}>登录</span>,
                children: (
                  <Form onFinish={handleLogin} size="large">
                    <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                      <Input
                        prefix={<UserOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
                        placeholder="用户名"
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 10,
                          color: '#fff',
                        }}
                      />
                    </Form.Item>
                    <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
                      <Input.Password
                        prefix={<LockOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
                        placeholder="密码"
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 10,
                          color: '#fff',
                        }}
                      />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0 }}>
                      <Button
                        type="primary"
                        htmlType="submit"
                        loading={loginLoading}
                        block
                        style={{
                          height: 44,
                          borderRadius: 10,
                          background: 'linear-gradient(135deg, #1890ff 0%, #722ed1 100%)',
                          border: 'none',
                          fontWeight: 600,
                          fontSize: 15,
                          boxShadow: '0 4px 16px rgba(24,144,255,0.4)',
                        }}
                      >
                        <RocketOutlined style={{ marginRight: 6 }} />
                        登录
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
              {
                key: 'register',
                label: <span style={{ color: activeTab === 'register' ? '#fff' : 'rgba(255,255,255,0.4)' }}>注册</span>,
                children: (
                  <Form onFinish={handleFreeRegister} size="large">
                    <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                      <Input
                        prefix={<UserOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
                        placeholder="用户名"
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 10,
                          color: '#fff',
                        }}
                      />
                    </Form.Item>
                    <Form.Item name="email">
                      <Input
                        prefix={<MailOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
                        placeholder="邮箱（选填）"
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 10,
                          color: '#fff',
                        }}
                      />
                    </Form.Item>
                    <Form.Item name="password" rules={[
                      { required: true, message: '请输入密码' },
                      { min: 6, message: '密码至少6位' },
                    ]}>
                      <Input.Password
                        prefix={<LockOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
                        placeholder="密码"
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 10,
                          color: '#fff',
                        }}
                      />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0 }}>
                      <Button
                        type="primary"
                        htmlType="submit"
                        loading={registerLoading}
                        block
                        style={{
                          height: 44,
                          borderRadius: 10,
                          background: 'linear-gradient(135deg, #52c41a 0%, #1890ff 100%)',
                          border: 'none',
                          fontWeight: 600,
                          fontSize: 15,
                          boxShadow: '0 4px 16px rgba(82,196,26,0.4)',
                        }}
                      >
                        <ThunderboltOutlined style={{ marginRight: 6 }} />
                        注册
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
            ]}
          />

          <Divider style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '16px 0' }} />

          <div style={{ textAlign: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>
              🐂 仅供参考，牛牛不对投资决策负责
            </Text>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
