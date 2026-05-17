import React, { useEffect, useState } from 'react'
import { Button, Modal, Typography, Space, Tag } from 'antd'
import {
  MobileOutlined,
  DownloadOutlined,
  ChromeOutlined,
  AppleOutlined,
  AndroidOutlined,
} from '@ant-design/icons'

const { Text, Paragraph } = Typography

/**
 * PWA 安装提示组件
 * 当浏览器检测到可以安装PWA时，自动弹出安装引导
 */
const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showModal, setShowModal] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // 检查是否已安装
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    if (isStandalone) {
      setIsInstalled(true)
      return
    }

    // 监听 beforeinstallprompt 事件
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      // 延迟显示，避免打扰用户
      setTimeout(() => setShowModal(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // 检查是否已经安装
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setShowModal(false)
      setDeferredPrompt(null)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // 如果没有 deferredPrompt，显示手动安装指引
      setShowInstallGuide(true)
      return
    }

    try {
      await (deferredPrompt as any).prompt()
      const { outcome } = await (deferredPrompt as any).userChoice

      if (outcome === 'accepted') {
        console.log('用户同意安装PWA')
      }
      setDeferredPrompt(null)
      setShowModal(false)
    } catch (error) {
      console.error('安装失败:', error)
    }
  }

  const [showInstallGuide, setShowInstallGuide] = useState(false)

  const getBrowserType = () => {
    const ua = navigator.userAgent.toLowerCase()
    if (/iphone|ipad|ipod/.test(ua)) return 'ios'
    if (/android/.test(ua)) return 'android'
    if (/chrome/.test(ua)) return 'chrome'
    return 'other'
  }

  const browserType = getBrowserType()

  const renderInstallGuide = () => {
    if (browserType === 'ios') {
      return (
        <div style={{ textAlign: 'left' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <AppleOutlined style={{ fontSize: 24, color: '#333' }} />
              <Text strong style={{ fontSize: 16 }}>iOS / Safari 安装方法</Text>
            </div>
            <div style={{ background: '#f6f8fa', borderRadius: 8, padding: 16 }}>
              <Space direction="vertical" size="middle">
                <div>
                  <Tag color="blue">步骤 1</Tag>
                  <Text>点击底部 <Text strong>分享按钮</Text> <Text code>⬆️</Text></Text>
                </div>
                <div>
                  <Tag color="blue">步骤 2</Tag>
                  <Text>在弹出菜单中找到 <Text strong>"添加到主屏幕"</Text></Text>
                </div>
                <div>
                  <Tag color="blue">步骤 3</Tag>
                  <Text>点击 <Text strong>"添加"</Text> 即可</Text>
                </div>
              </Space>
            </div>
          </Space>
        </div>
      )
    }

    if (browserType === 'android') {
      return (
        <div style={{ textAlign: 'left' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <AndroidOutlined style={{ fontSize: 24, color: '#3DDC84' }} />
              <Text strong style={{ fontSize: 16 }}>Android / Chrome 安装方法</Text>
            </div>
            <div style={{ background: '#f6f8fa', borderRadius: 8, padding: 16 }}>
              <Space direction="vertical" size="middle">
                <div>
                  <Tag color="green">步骤 1</Tag>
                  <Text>点击浏览器右上角 <Text strong>菜单 ⋮</Text></Text>
                </div>
                <div>
                  <Tag color="green">步骤 2</Tag>
                  <Text>选择 <Text strong>"添加到主屏幕"</Text> 或 <Text strong>"安装应用"</Text></Text>
                </div>
                <div>
                  <Tag color="green">步骤 3</Tag>
                  <Text>点击 <Text strong>"安装"</Text> 即可</Text>
                </div>
              </Space>
            </div>
          </Space>
        </div>
      )
    }

    return (
      <div style={{ textAlign: 'left' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ChromeOutlined style={{ fontSize: 24, color: '#4285F4' }} />
            <Text strong style={{ fontSize: 16 }}>Chrome 安装方法</Text>
          </div>
          <div style={{ background: '#f6f8fa', borderRadius: 8, padding: 16 }}>
            <Space direction="vertical" size="middle">
              <div>
                <Tag color="blue">步骤 1</Tag>
                <Text>点击地址栏右侧的 <Text strong>安装图标 ⊕</Text></Text>
              </div>
              <div>
                <Tag color="blue">步骤 2</Tag>
                <Text>点击 <Text strong>"安装"</Text> 按钮</Text>
              </div>
            </Space>
          </div>
        </Space>
      </div>
    )
  }

  if (isInstalled) return null

  return (
    <>
      <Modal
        title={
          <Space>
            <MobileOutlined style={{ color: '#1890ff' }} />
            <span>安装到手机桌面</span>
          </Space>
        }
        open={showModal && !showInstallGuide}
        onCancel={() => setShowModal(false)}
        footer={[
          <Button key="later" onClick={() => setShowModal(false)}>
            以后再说
          </Button>,
          <Button
            key="guide"
            onClick={() => {
              setShowInstallGuide(true)
            }}
          >
            查看安装方法
          </Button>,
          deferredPrompt && (
            <Button key="install" type="primary" icon={<DownloadOutlined />} onClick={handleInstall}>
              立即安装
            </Button>
          ),
        ].filter(Boolean)}
        width={420}
        centered
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <span style={{ fontSize: 32, color: 'white', fontWeight: 'bold' }}>AI</span>
          </div>
          <Paragraph style={{ fontSize: 16, marginBottom: 8 }}>
            将 <Text strong>A股预测训练平台</Text> 添加到主屏幕
          </Paragraph>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            像原生App一样使用，支持离线访问、消息推送
          </Paragraph>
        </div>
      </Modal>

      <Modal
        title="安装指引"
        open={showInstallGuide}
        onCancel={() => {
          setShowInstallGuide(false)
          setShowModal(false)
        }}
        footer={[
          <Button key="close" type="primary" onClick={() => {
            setShowInstallGuide(false)
            setShowModal(false)
          }}>
            我知道了
          </Button>,
        ]}
        width={440}
        centered
      >
        {renderInstallGuide()}
      </Modal>
    </>
  )
}

export default PWAInstallPrompt
