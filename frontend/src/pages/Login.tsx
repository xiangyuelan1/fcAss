import React, { useState, useEffect, useRef } from 'react'
import {
  Card,
  Form,
  Input,
  Button,
  Tabs,
  message,
  Space,
  Typography,
  Radio,
  Alert,
  Modal,
  QRCode,
  Spin,
} from 'antd'
import {
  UserOutlined,
  LockOutlined,
  MailOutlined,
  AlipayCircleOutlined,
  WechatOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/store'
import { paymentApi } from '@/services/api'

const { Text, Title } = Typography

const LoginPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('login')
  const [loginLoading, setLoginLoading] = useState(false)
  const [registerLoading, setRegisterLoading] = useState(false)
  const { login } = useAuthStore()

  const [paymentEnabled, setPaymentEnabled] = useState(false)
  const [registerFee, setRegisterFee] = useState(1)
  const [payType, setPayType] = useState('alipay')

  const [payModalVisible, setPayModalVisible] = useState(false)
  const [payOrderNo, setPayOrderNo] = useState('')
  const [payQrcode, setPayQrcode] = useState('')
  const [payUrl, setPayUrl] = useState('')
  const [payLoading, setPayLoading] = useState(false)
  const [pollingStatus, setPollingStatus] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    loadRegisterInfo()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const loadRegisterInfo = async () => {
    try {
      const res: any = await paymentApi.getRegisterInfo()
      if (res.success && res.data) {
        setPaymentEnabled(res.data.enabled)
        setRegisterFee(res.data.fee)
        setPayType(res.data.pay_type || 'alipay')
      }
    } catch {
      // 支付接口不可用时，回退到免费注册
      setPaymentEnabled(false)
    }
  }

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

  const handlePaidRegister = async (values: { username: string; email?: string; password: string; pay_type: string }) => {
    setRegisterLoading(true)
    try {
      // 1. 创建订单
      const orderRes: any = await paymentApi.createOrder({
        username: values.username,
        email: values.email,
        password: values.password,
        pay_type: values.pay_type || payType,
      })

      if (!orderRes.success) {
        message.error(orderRes.message || '创建订单失败')
        return
      }

      const outTradeNo = orderRes.data.out_trade_no
      setPayOrderNo(outTradeNo)

      // 2. 获取二维码
      setPayLoading(true)
      setPayModalVisible(true)
      const qrcodeRes: any = await paymentApi.getQrcode(outTradeNo)

      if (qrcodeRes.success && qrcodeRes.data) {
        setPayQrcode(qrcodeRes.data.qrcode_url || '')
        setPayUrl(qrcodeRes.data.pay_url || '')

        // 3. 开始轮询支付状态
        startPolling(outTradeNo)
      } else {
        message.error(qrcodeRes.message || '获取支付二维码失败')
        setPayModalVisible(false)
      }
    } catch (error: any) {
      message.error(error?.response?.data?.message || '操作失败')
      setPayModalVisible(false)
    } finally {
      setRegisterLoading(false)
      setPayLoading(false)
    }
  }

  const startPolling = (orderNo: string) => {
    setPollingStatus(true)
    if (pollRef.current) clearInterval(pollRef.current)

    pollRef.current = setInterval(async () => {
      try {
        const res: any = await paymentApi.queryOrderStatus(orderNo)
        if (res.success && res.data?.status === 'paid') {
          if (pollRef.current) clearInterval(pollRef.current)
          setPollingStatus(false)
          setPayModalVisible(false)
          message.success('支付成功！账号已创建，请登录')

          // 自动登录
          try {
            // 需要从表单获取密码，这里使用 store 中的方式
            await login(res.data.username, '')
          } catch {
            // 自动登录失败，手动登录
          }
          setActiveTab('login')
        }
      } catch {
        // 轮询失败，继续
      }
    }, 3000)
  }

  const handlePayModalClose = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    setPollingStatus(false)
    setPayModalVisible(false)
  }

  const openPayUrl = () => {
    if (payUrl) {
      window.open(payUrl, '_blank')
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

        <Tabs activeKey={activeTab} onChange={setActiveTab} centered>
          <Tabs.TabPane tab="登录" key="login">
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
          </Tabs.TabPane>

          <Tabs.TabPane tab={`注册${paymentEnabled ? ` (¥${registerFee})` : ''}`} key="register">
            {paymentEnabled ? (
              <Form onFinish={handlePaidRegister} size="large" initialValues={{ pay_type: payType }}>
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
                <Form.Item name="pay_type" label="支付方式">
                  <Radio.Group>
                    <Radio.Button value="alipay"><AlipayCircleOutlined /> 支付宝</Radio.Button>
                    <Radio.Button value="wxpay"><WechatOutlined /> 微信</Radio.Button>
                  </Radio.Group>
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={registerLoading} block>
                    支付 ¥{registerFee} 并注册
                  </Button>
                </Form.Item>
                <Alert
                  message={`注册需支付 ¥${registerFee}，支付成功后账号自动创建`}
                  type="info"
                  showIcon
                  style={{ marginTop: -8 }}
                />
              </Form>
            ) : (
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
            )}
          </Tabs.TabPane>
        </Tabs>
      </Card>

      {/* 支付二维码弹窗 */}
      <Modal
        title="扫码支付"
        open={payModalVisible}
        onCancel={handlePayModalClose}
        footer={null}
        width={400}
        centered
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          {payLoading ? (
            <Spin size="large" tip="正在获取支付二维码..." />
          ) : (
            <>
              {payQrcode ? (
                <div>
                  <QRCode
                    value={payQrcode}
                    size={256}
                    style={{ marginBottom: 16 }}
                  />
                  <div>
                    <Text type="secondary">请使用{payType === 'alipay' ? '支付宝' : '微信'}扫描二维码支付</Text>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Text strong style={{ fontSize: 18, color: '#f5222d' }}>¥{registerFee}</Text>
                  </div>
                </div>
              ) : payUrl ? (
                <div>
                  <Button type="primary" size="large" onClick={openPayUrl}>
                    前往支付
                  </Button>
                  <div style={{ marginTop: 12 }}>
                    <Text type="secondary">点击按钮跳转到支付页面</Text>
                  </div>
                </div>
              ) : (
                <Alert message="未获取到支付信息，请重试" type="error" />
              )}

              {pollingStatus && (
                <div style={{ marginTop: 16 }}>
                  <Spin size="small" />
                  <Text type="secondary" style={{ marginLeft: 8 }}>等待支付确认中...</Text>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default LoginPage
