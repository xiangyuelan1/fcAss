import React, { useState } from 'react'
import { Modal, Steps, Button, Typography, Result } from 'antd'
import {
  SmileOutlined,
  GlobalOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
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
    icon: <SmileOutlined style={{ fontSize: 48, color: '#1890ff' }} />,
    title: '欢迎来到A股预测平台',
    description: '在这里，你可以看别人的预测、参与每日挑战、或者创建自己的AI模型来预测股票涨跌。不需要任何技术基础！',
  },
  {
    icon: <GlobalOutlined style={{ fontSize: 48, color: '#1890ff' }} />,
    title: '看看大家都在预测什么',
    description: '社区里有很多高手分享的预测信号和模型，你可以浏览、点赞、甚至一键克隆到自己的名下直接使用。',
    path: '/community',
    pathText: '逛逛社区',
  },
  {
    icon: <TrophyOutlined style={{ fontSize: 48, color: '#faad14' }} />,
    title: '参与每日挑战',
    description: '每天选一只股票，预测它明天涨还是跌。猜对了还能赢积分，上排行榜！完全免费，零门槛参与。',
    path: '/',
    pathText: '回到首页参与',
  },
  {
    icon: <ThunderboltOutlined style={{ fontSize: 48, color: '#52c41a' }} />,
    title: '想自己搞？用模板一键创建',
    description: '选一个模板，系统自动帮你配好参数和股票，点几下就能拥有自己的AI预测模型。就像搭积木一样简单！',
    path: '/models/build',
    pathText: '试试创建模型',
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
      width={560}
      centered
      closable
      closeIcon={null}
      maskClosable={false}
      styles={{ body: { padding: '24px 32px' } }}
    >
      <Steps
        current={currentStep}
        size="small"
        style={{ marginBottom: 32 }}
        items={ONBOARDING_STEPS.map((s) => ({ title: s.title }))}
      />

      {isLastStep && currentStep === ONBOARDING_STEPS.length - 1 ? (
        <Result
          icon={<SmileOutlined style={{ color: '#52c41a' }} />}
          title="准备好了！"
          subTitle="你已经了解了平台的基本玩法，现在开始探索吧！"
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
