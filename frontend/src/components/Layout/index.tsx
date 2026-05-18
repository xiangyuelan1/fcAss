import React, { useState, useEffect } from 'react'
import { Layout, Menu, Button, Modal, theme, Dropdown, Avatar, Space, Badge } from 'antd'
import {
  DashboardOutlined,
  ToolOutlined,
  RobotOutlined,
  PlayCircleOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  AppstoreOutlined,
  LogoutOutlined,
  UserOutlined,
  PayCircleOutlined,
  ThunderboltOutlined,
  TeamOutlined,
  SettingOutlined,
  CrownOutlined,
  GlobalOutlined,
  TrophyOutlined,
  ProfileOutlined,
  MailOutlined,
  CustomerServiceOutlined,
  QuestionCircleOutlined,
  StarOutlined,
  BellOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store'
import { authApi, messageApi } from '@/services/api'
import OnboardingGuide from '@/components/OnboardingGuide'

const { Header, Sider, Content } = Layout

interface AppLayoutProps {
  children: React.ReactNode
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [onboardingVisible, setOnboardingVisible] = useState(false)
  const [disclaimerVisible, setDisclaimerVisible] = useState(false)
  const [onlineCount, setOnlineCount] = useState<number>(0)
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

  // 首次登录免责声明弹窗
  useEffect(() => {
    if (!localStorage.getItem('disclaimer_accepted')) {
      setDisclaimerVisible(true)
    }
  }, [])

  // 检测是否为移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth < 768) {
        setCollapsed(true)
      }
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 路由切换时关闭移动端抽屉
  useEffect(() => {
  }, [location.pathname])

  // 心跳上报与在线人数轮询、未读消息计数轮询
  useEffect(() => {
    const sendHeartbeat = async () => {
      try {
        await authApi.heartbeat()
      } catch {}
    }
    const fetchOnlineCount = async () => {
      try {
        const res: any = await authApi.getOnlineCount()
        setOnlineCount(res.online_count || 0)
      } catch {}
    }
    const fetchUnreadCount = async () => {
      try {
        const res: any = await messageApi.getUnreadCount()
        setUnreadCount(res.unread_count || 0)
      } catch {}
    }
    sendHeartbeat()
    fetchOnlineCount()
    fetchUnreadCount()
    const heartbeatInterval = setInterval(sendHeartbeat, 120000)
    const countInterval = setInterval(fetchOnlineCount, 60000)
    const unreadInterval = setInterval(fetchUnreadCount, 60000)
    return () => {
      clearInterval(heartbeatInterval)
      clearInterval(countInterval)
      clearInterval(unreadInterval)
    }
  }, [])

  const isAdmin = user?.is_admin

  const menuItems = [
    {
      key: 'community-group',
      icon: <GlobalOutlined />,
      label: '社区',
      children: [
        { key: '/community', icon: <GlobalOutlined />, label: '模型广场' },
        { key: '/community/pk', icon: <TrophyOutlined />, label: 'PK竞技' },
        { key: '/community/leaderboard', icon: <TrophyOutlined />, label: '排行榜' },
      ],
    },
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '我的工作台',
    },
    {
      key: 'model-group',
      icon: <RobotOutlined />,
      label: '模型管理',
      children: [
        { key: '/models', icon: <RobotOutlined />, label: '我的模型' },
        { key: '/watchlist', icon: <StarOutlined />, label: '自选股' },
        { key: '/features', icon: <ToolOutlined />, label: '特征工程' },
      ],
    },
    {
      key: '/training',
      icon: <PlayCircleOutlined />,
      label: '训练与回测',
    },
    {
      key: '/prediction',
      icon: <ThunderboltOutlined />,
      label: '智能预测',
    },
    {
      key: '/contact',
      icon: <CustomerServiceOutlined />,
      label: '联系开发团队',
    },
    {
      key: '__onboarding__',
      icon: <QuestionCircleOutlined />,
      label: '新手引导',
    },
    ...(isAdmin ? [
      { type: 'divider' as const },
      {
        key: 'admin-group',
        icon: <CrownOutlined />,
        label: '管理员',
        children: [
          {
            key: '/admin/users',
            icon: <TeamOutlined />,
            label: '用户管理',
          },
          {
            key: '/admin/config',
            icon: <SettingOutlined />,
            label: '系统配置',
          },
          {
            key: '/admin/messages',
            icon: <MailOutlined />,
            label: '站内信管理',
          },
          {
            key: '/payment-config',
            icon: <PayCircleOutlined />,
            label: '支付配置',
          },
        ],
      },
    ] : []),
  ]

  // 移动端底部导航栏（选择最核心的5个功能入口）
  const bottomNavItems = [
    { key: '/community', icon: <GlobalOutlined />, label: '社区' },
    { key: '/', icon: <DashboardOutlined />, label: '工作台' },
    { key: '/models', icon: <RobotOutlined />, label: '模型' },
    { key: '/prediction', icon: <ThunderboltOutlined />, label: '预测' },
    { key: '/training', icon: <PlayCircleOutlined />, label: '训练回测' },
  ]

  const handleMenuClick = (key: string) => {
    if (key === '__onboarding__') {
      setOnboardingVisible(true)
      return
    }
    navigate(key)
  }

  // 移动端布局
  if (isMobile) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        {/* 顶部标题栏 */}
        <Header style={{
          padding: '0 16px',
          background: colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,21,41,.08)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          height: 48,
          lineHeight: '48px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AppstoreOutlined style={{ fontSize: 20, color: '#1890ff' }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1890ff' }}>AI量化训练</span>
            <span style={{ fontSize: 11, color: '#52c41a', marginLeft: 8 }}>
              {onlineCount}人在线
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge count={unreadCount} size="small" offset={[2, -2]}>
              <Button
                type="text"
                icon={<BellOutlined style={{ fontSize: 18 }} />}
                onClick={() => navigate('/contact')}
                style={{ padding: '4px 8px' }}
              />
            </Badge>
            <Button
              type="text"
              icon={<MenuUnfoldOutlined />}
              onClick={() => setCollapsed(false)}
              style={{ fontSize: '18px' }}
            />
          </div>
        </Header>

        {/* 主内容区域 */}
        <Content
          style={{
            margin: '8px',
            padding: 12,
            minHeight: 'calc(100vh - 48px - 56px)',
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            marginBottom: 56, // 底部导航栏高度
            // iOS 安全区域适配
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {children}
        </Content>

        {/* 底部导航栏 */}
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 56,
          background: '#fff',
          borderTop: '1px solid #f0f0f0',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          zIndex: 100,
          // iOS 安全区域适配
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
          {bottomNavItems.map((item) => {
            const isActive = location.pathname === item.key
            return (
              <div
                key={item.key}
                onClick={() => handleMenuClick(item.key)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px 0',
                  cursor: 'pointer',
                  minWidth: 50,
                  transition: 'all 0.2s',
                }}
              >
                <span style={{
                  fontSize: 20,
                  color: isActive ? '#1890ff' : '#999',
                  transition: 'color 0.2s',
                }}>
                  {item.icon}
                </span>
                <span style={{
                  fontSize: 10,
                  color: isActive ? '#1890ff' : '#999',
                  marginTop: 2,
                  fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.2s',
                }}>
                  {item.label}
                </span>
              </div>
            )
          })}
        </div>
        {/* 免责声明 */}
        <div style={{
          background: '#fffbe6',
          borderTop: '1px solid #ffe58f',
          padding: '2px 8px',
          fontSize: 10,
          color: '#ad6800',
          textAlign: 'center',
          lineHeight: '16px',
          position: 'fixed',
          bottom: 56,
          left: 0,
          right: 0,
          zIndex: 99,
        }}>
          ⚠️ 仅供参考，不构成投资建议。基于日K线数据，投资有风险。
        </div>
        <OnboardingGuide
          open={onboardingVisible}
          onClose={() => setOnboardingVisible(false)}
        />
        <Modal
          title="⚠️ 免责声明"
          open={disclaimerVisible}
          closable={false}
          maskClosable={false}
          footer={[
            <Button key="ok" type="primary" onClick={() => {
              localStorage.setItem('disclaimer_accepted', 'true')
              setDisclaimerVisible(false)
            }}>
              我已知晓，继续使用
            </Button>,
          ]}
        >
          <div style={{ lineHeight: 2 }}>
            <p>1. 本平台所有数据和分析结果<strong>仅供参考</strong>，不构成任何投资建议。</p>
            <p>2. 所有预测基于<strong>日K线历史数据</strong>，过去的表现不代表未来收益。</p>
            <p>3. 投资有风险，入市需谨慎。用户应根据自身情况独立做出投资决策。</p>
            <p>4. 本平台不对因使用本平台数据或分析结果造成的任何损失承担责任。</p>
          </div>
        </Modal>
      </Layout>
    )
  }

  // 桌面端布局
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="light">
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #f0f0f0'
        }}>
          <h1 style={{
            margin: 0,
            fontSize: collapsed ? 14 : 18,
            fontWeight: 600,
            color: '#1890ff'
          }}>
            {collapsed ? 'AI' : 'A股预测平台'}
          </h1>
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => handleMenuClick(key)}
        />
      </Sider>
      <Layout style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Header style={{
          padding: '0 24px',
          background: colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,21,41,.08)',
          flexShrink: 0,
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: '16px' }}
          />
          <div style={{ fontSize: 16, fontWeight: 500 }}>
            A股预测训练平台
            <span style={{ fontSize: 12, color: '#52c41a', marginLeft: 12 }}>
              <TeamOutlined style={{ marginRight: 4 }} />
              {onlineCount} 人在线
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Badge count={unreadCount} size="small" offset={[2, -2]}>
              <Button
                type="text"
                icon={<BellOutlined style={{ fontSize: 18 }} />}
                onClick={() => navigate('/contact')}
                style={{ padding: '4px 8px' }}
              />
            </Badge>
            <Dropdown
            menu={{
              items: [
                {
                  key: 'user',
                  label: user?.username || '用户',
                  disabled: true,
                  icon: <UserOutlined />,
                },
                { type: 'divider' },
                {
                  key: 'profile',
                  label: '个人中心',
                  icon: <ProfileOutlined />,
                  onClick: () => navigate('/profile'),
                },
                {
                  key: 'logout',
                  label: '退出登录',
                  icon: <LogoutOutlined />,
                  onClick: () => {
                    logout()
                    navigate('/login')
                  },
                },
              ],
            }}
          >
            <Space style={{ cursor: 'pointer' }}>
              <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
              <span>{user?.username}</span>
            </Space>
          </Dropdown>
          </div>
        </Header>
        <Content
          style={{
            margin: '24px',
            padding: 24,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            flex: 1,
            overflow: 'auto',
          }}
        >
          {children}
        </Content>
        {/* 免责声明 */}
        <div style={{
          background: '#fffbe6',
          borderTop: '1px solid #ffe58f',
          padding: '4px 24px',
          fontSize: 11,
          color: '#ad6800',
          textAlign: 'center',
          lineHeight: '18px',
          flexShrink: 0,
        }}>
          ⚠️ 免责声明：本平台所有数据和分析结果仅供参考，不构成任何投资建议。所有预测基于日K线历史数据，过去的表现不代表未来收益。投资有风险，入市需谨慎。
        </div>
      </Layout>
      <OnboardingGuide
        open={onboardingVisible}
        onClose={() => setOnboardingVisible(false)}
      />
      <Modal
        title="⚠️ 免责声明"
        open={disclaimerVisible}
        closable={false}
        maskClosable={false}
        footer={[
          <Button key="ok" type="primary" onClick={() => {
            localStorage.setItem('disclaimer_accepted', 'true')
            setDisclaimerVisible(false)
          }}>
            我已知晓，继续使用
          </Button>,
        ]}
      >
        <div style={{ lineHeight: 2 }}>
          <p>1. 本平台所有数据和分析结果<strong>仅供参考</strong>，不构成任何投资建议。</p>
          <p>2. 所有预测基于<strong>日K线历史数据</strong>，过去的表现不代表未来收益。</p>
          <p>3. 投资有风险，入市需谨慎。用户应根据自身情况独立做出投资决策。</p>
          <p>4. 本平台不对因使用本平台数据或分析结果造成的任何损失承担责任。</p>
        </div>
      </Modal>
    </Layout>
  )
}

export default AppLayout
