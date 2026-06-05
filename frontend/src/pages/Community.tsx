/**
 * 社区页面 - 主布局
 * 仅负责 Tab 切换与侧边栏布局，各 Tab 内容由独立子组件管理
 */
import React, { useState } from 'react'
import { Card, Tabs, Row, Col, Space } from 'antd'
import { TrophyOutlined, FundOutlined, ShareAltOutlined, GlobalOutlined } from '@ant-design/icons'
import ModelSquare from '@/components/community/ModelSquare'
import PredictionShare from '@/components/community/PredictionShare'
import Leaderboard from '@/components/community/Leaderboard'
import PaperTrading from '@/components/community/PaperTrading'
import Sidebar from '@/components/community/Sidebar'

const Community: React.FC = () => {
  const [activeTab, setActiveTab] = useState('models')

  return (
    <div>
      <h1 className="page-title">社区</h1>
      <p className="page-description">
        浏览社区共享的预测模型与预测分享，发现优质策略，参与每日一猜。
      </p>
      <Row gutter={[24, 24]}>
        <Col xs={24} lg={17}>
          <Card>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={[
                { key: 'models', label: <Space><GlobalOutlined />模型广场</Space>, children: <ModelSquare /> },
                { key: 'predictions', label: <Space><ShareAltOutlined />预测分享</Space>, children: <PredictionShare /> },
                { key: 'leaderboard', label: <Space><TrophyOutlined />排行榜</Space>, children: <Leaderboard /> },
                { key: 'paper-trading', label: <Space><FundOutlined />模拟盘</Space>, children: <PaperTrading /> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={7}>
          <Sidebar />
        </Col>
      </Row>
    </div>
  )
}

export default Community
