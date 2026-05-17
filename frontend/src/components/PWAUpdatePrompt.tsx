import React, { useEffect, useState } from 'react'
import { Button, Modal, Typography, Space } from 'antd'
import { ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons'

const { Text, Paragraph } = Typography

/**
 * PWA 更新提示组件
 * 当检测到新版本的 Service Worker 时，提示用户刷新
 */
const PWAUpdatePrompt: React.FC = () => {
  const [showUpdate, setShowUpdate] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // 自动刷新
        window.location.reload()
      })
    }

    // vite-plugin-pwa 会触发自定义事件
    const handler = () => setShowUpdate(true)
    // @ts-ignore
    window.addEventListener('sw-update-found', handler)

    return () => {
      // @ts-ignore
      window.removeEventListener('sw-update-found', handler)
    }
  }, [])

  const handleUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' })
    }
    setShowUpdate(false)
    // 延迟刷新，等待新 SW 激活
    setTimeout(() => window.location.reload(), 1000)
  }

  return (
    <Modal
      title={
        <Space>
          <InfoCircleOutlined style={{ color: '#faad14' }} />
          <span>发现新版本</span>
        </Space>
      }
      open={showUpdate}
      onCancel={() => setShowUpdate(false)}
      footer={[
        <Button key="later" onClick={() => setShowUpdate(false)}>
          稍后更新
        </Button>,
        <Button key="update" type="primary" icon={<ReloadOutlined />} onClick={handleUpdate}>
          立即更新
        </Button>,
      ]}
      width={380}
      centered
    >
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <ReloadOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
        <Paragraph>
          平台已更新到最新版本
        </Paragraph>
        <Text type="secondary">
          点击"立即更新"获取最新功能和修复
        </Text>
      </div>
    </Modal>
  )
}

export default PWAUpdatePrompt
