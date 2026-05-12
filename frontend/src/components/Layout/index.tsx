import React, { useState, useEffect } from 'react'
import { Layout, Menu, Button, theme, Dropdown, Avatar, Space } from 'antd'
import {
  DashboardOutlined,
  DatabaseOutlined,
  ToolOutlined,
  RobotOutlined,
  PlayCircleOutlined,
  LineChartOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  AppstoreOutlined,
  LogoutOutlined,
  UserOutlined,
  PayCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store'

const { Header, Sider, Content } = Layout

interface AppLayoutProps {
  children: React.ReactNode
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

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
    setDrawerVisible(false)
  }, [location.pathname])

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '概览',
    },
    {
      key: '/data',
      icon: <DatabaseOutlined />,
      label: '数据管理',
    },
    {
      key: '/features',
      icon: <ToolOutlined />,
      label: '特征工程',
    },
    {
      key: '/models',
      icon: <RobotOutlined />,
      label: '模型管理',
    },
    {
      key: '/training',
      icon: <PlayCircleOutlined />,
      label: '训练任务',
    },
    {
      key: '/backtest',
      icon: <LineChartOutlined />,
      label: '回测分析',
    },
    {
      key: '/prediction',
      icon: <ThunderboltOutlined />,
      label: '智能预测',
    },
    {
      key: '/payment-config',
      icon: <PayCircleOutlined />,
      label: '支付配置',
    },
  ]

  // 移动端底部导航栏（只显示前5个）
  const bottomNavItems = menuItems.slice(0, 5)

  const handleMenuClick = (key: string) => {
    navigate(key)
    if (isMobile) {
      setDrawerVisible(false)
    }
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
          </div>
          <Button
            type="text"
            icon={<MenuUnfoldOutlined />}
            onClick={() => setDrawerVisible(true)}
            style={{ fontSize: '18px' }}
          />
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
      </Layout>
    )
  }

  // 桌面端布局（保持原有设计）
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
      <Layout>
        <Header style={{
          padding: '0 24px',
          background: colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,21,41,.08)'
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: '16px' }}
          />
          <div style={{ fontSize: 16, fontWeight: 500 }}>
            A股预测训练平台
          </div>
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
        </Header>
        <Content
          style={{
            margin: '24px',
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}

export default AppLayout
