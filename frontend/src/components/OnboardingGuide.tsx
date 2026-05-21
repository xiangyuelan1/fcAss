import React, { useState } from 'react'
import { Modal, Steps, Button, Typography, Result } from 'antd'
import {
  HomeOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
  StarOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

const { Title, Paragraph } = Typography

const ONBOARDING_KEY = 'onboarding_completed'

interface OnboardingStep {
  icon: React.ReactNode
  title: string
  description: string
  path?: string
  pathText?: string
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    icon: <HomeOutlined style={{ fontSize: 48, color: '#1890ff' }} />,
    title: '🏠 我的工作台',
    description: '你的个人工作台，在这里查看预测结果、追踪模型训练进度。牛牛🐂会帮你管理一切！',
    path: '/',
    pathText: '进入工作台',
  },
  {
    icon: <RobotOutlined style={{ fontSize: 48, color: '#722ed1' }} />,
    title: '🤖 创建你的第一个模型',
    description: '选择算法（MLP/XGBoost/LSTM等）→ 选择训练股票 → 配置特征指标 → 设置预测目标（次日方向/价格/趋势）→ 一键训练！',
    path: '/models/build',
    pathText: '试试创建模型',
  },
  {
    icon: <ThunderboltOutlined style={{ fontSize: 48, color: '#52c41a' }} />,
    title: '📈 训练与预测',
    description: '训练完成后，选择模型即可自动预测所有训练股票。支持批量预测、回测验证，还可以分享预测到社区！',
    path: '/train-predict',
    pathText: '去训练预测',
  },
  {
    icon: <GlobalOutlined style={{ fontSize: 48, color: '#faad14' }} />,
    title: '🌍 社区',
    description: '浏览模型广场、查看他人预测、参与每日一猜、发起PK挑战。好模型值得分享！',
    path: '/community',
    pathText: '逛逛社区',
  },
  {
    icon: <StarOutlined style={{ fontSize: 48, color: '#eb2f96' }} />,
    title: '⭐ 自选股',
    description: '创建自选股列表，方便在训练和预测时快速选择。支持按板块分类、批量操作。',
    path: '/watchlist',
    pathText: '管理自选股',
  },
]

export const isOnboardingCompleted = (): boolean => {
  return localStorage.getItem(ONBOARDING_KEY) === 'true'
}

export const markOnboardingCompleted = (): void => {
  localStorage.setItem(ONBOARDING_KEY, 'true')
}

export const resetOnboarding = (): void => {
  localStorage.removeItem(ONBOARDING_KEY)
}

interface OnboardingGuideProps {
  open: boolean
  onClose: () => void
}

const OnboardingGuide: React.FC<OnboardingGuideProps> = ({ open, onClose }) => {
  const isMobile = window.innerWidth < 768
  const [currentStep, setCurrentStep] = useState(0)
  const navigate = useNavigate()

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSkip = () => {
    markOnboardingCompleted()
    onClose()
  }

  const handleFinish = () => {
    markOnboardingCompleted()
    onClose()
  }

  const handleNavigate = (path: string) => {
    markOnboardingCompleted()
    onClose()
    navigate(path)
  }

  const step = ONBOARDING_STEPS[currentStep]
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1

  return (
    <Modal
      open={open}
      onCancel={handleSkip}
      footer={null}
      width={isMobile ? '100%' : 560}
      centered
      closable
      closeIcon={null}
      maskClosable={false}
      styles={{ body: { padding: isMobile ? '16px 20px' : '24px 32px' } }}
    >
      <Steps
        current={currentStep}
        size="small"
        style={{ marginBottom: 32 }}
        items={ONBOARDING_STEPS.map((s) => ({ title: s.title }))}
      />

      {isLastStep && currentStep === ONBOARDING_STEPS.length - 1 ? (
        <Result
          icon={<StarOutlined style={{ color: '#52c41a' }} />}
          title="准备好了！"
          subTitle={'你已经了解了平台的核心功能，现在开始探索吧！牛牛祝你投资顺利！'}
          extra={
            <Button type="primary" size="large" onClick={handleFinish}>
              开始使用
            </Button>
          }
        />
      ) : (
        <div style={{ textAlign: 'center', minHeight: 200 }}>
          <div style={{ marginBottom: 24 }}>{step.icon}</div>
          <Title level={4} style={{ marginBottom: 12 }}>{step.title}</Title>
          <Paragraph
            style={{ fontSize: 15, color: '#666', maxWidth: 420, margin: '0 auto 24px', lineHeight: 1.8 }}
          >
            {step.description}
          </Paragraph>
          {step.path && (
            <Button
              type="link"
              icon={<ArrowRightOutlined />}
              onClick={() => handleNavigate(step.path!)}
              style={{ marginBottom: 16 }}
            >
              {step.pathText}
            </Button>
          )}
        </div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        borderTop: '1px solid #f0f0f0',
        paddingTop: 16,
        marginTop: 16,
      }}>
        <div>
          {!isFirstStep && (
            <Button onClick={handlePrev}>上一步</Button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={handleSkip}>跳过</Button>
          {!isLastStep && (
            <Button type="primary" onClick={handleNext}>
              下一步
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default OnboardingGuide
