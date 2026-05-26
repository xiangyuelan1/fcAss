import React, { useState, useEffect } from 'react'
import { Modal, Steps, Button, Typography, Result, Input, Tag, Spin, message, Card, Descriptions, List } from 'antd'
import {
  HomeOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
  StarOutlined,
  ArrowRightOutlined,
  LineChartOutlined,
  RiseOutlined,
  FallOutlined,
  MinusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { communityApi } from '@/services/api'

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
    icon: <LineChartOutlined style={{ fontSize: 48, color: '#13c2c2' }} />,
    title: '🔮 快速体验预测',
    description: '无需自己创建模型！直接使用社区中其他用户训练好的模型，输入股票代码即可获得预测结果，零门槛体验 AI 预测的威力！',
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

const MODEL_TYPE_COLORS: Record<string, string> = {
  lstm: 'blue',
  gru: 'cyan',
  xgboost: 'green',
  lightgbm: 'lime',
  randomforest: 'orange',
  mlp: 'purple',
}

const QuickPredictStep: React.FC<{ onPredicted: () => void }> = ({ onPredicted }) => {
  const [models, setModels] = useState<any[]>([])
  const [selectedModel, setSelectedModel] = useState<any>(null)
  const [stockCode, setStockCode] = useState('600519')
  const [predicting, setPredicting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const data = await communityApi.getModels({ sort_by: 'likes', page_size: 6 })
        const items = (data as any)?.items || (Array.isArray(data) ? data : [])
        setModels(items)
        if (items.length > 0) {
          setSelectedModel(items[0])
        }
      } catch {} finally {
        setLoading(false)
      }
    }
    fetchModels()
  }, [])

  const handlePredict = async () => {
    if (!selectedModel || !stockCode) {
      message.warning('请选择模型并输入股票代码')
      return
    }
    setPredicting(true)
    setResult(null)
    try {
      const data = await communityApi.predictWithModel(selectedModel.id, {
        stock_code: stockCode,
        days: 1,
      })
      setResult(data)
      onPredicted()
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message
      message.error(detail || '预测失败，请稍后重试')
    } finally {
      setPredicting(false)
    }
  }

  const getDirectionInfo = (direction: string) => {
    if (direction === 'up' || direction === '看涨') return { label: '看涨 📈', color: '#f5222d', icon: <RiseOutlined /> }
    if (direction === 'down' || direction === '看跌') return { label: '看跌 📉', color: '#52c41a', icon: <FallOutlined /> }
    return { label: '震荡 ➡️', color: '#faad14', icon: <MinusOutlined /> }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Spin size="large" tip="加载社区模型中..." />
      </div>
    )
  }

  if (result) {
    const dirInfo = getDirectionInfo(result.prediction_label || result.direction || 'flat')
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 56,
          marginBottom: 12,
          animation: 'fadeIn 0.5s ease-in',
        }}>
          {result.prediction_label === '看涨' || result.direction === 'up' ? '📈' :
           result.prediction_label === '看跌' || result.direction === 'down' ? '📉' : '➡️'}
        </div>
        <Title level={3} style={{ color: dirInfo.color, marginBottom: 8 }}>
          {dirInfo.label}
        </Title>
        <Card size="small" style={{ maxWidth: 320, margin: '0 auto', textAlign: 'left' }}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="股票代码">{result.stock_code || stockCode}</Descriptions.Item>
            {result.predict_date && (
              <Descriptions.Item label="预测日期">{result.predict_date}</Descriptions.Item>
            )}
            {result.prediction != null && (
              <Descriptions.Item label="预测值">{typeof result.prediction === 'number' ? result.prediction.toFixed(4) : result.prediction}</Descriptions.Item>
            )}
            {result.latest_data?.close != null && (
              <Descriptions.Item label="最新收盘价">¥{result.latest_data.close.toFixed(2)}</Descriptions.Item>
            )}
          </Descriptions>
        </Card>
        <Paragraph style={{ color: '#52c41a', marginTop: 16, fontSize: 15 }}>
          🎉 恭喜！你已完成第一次 AI 预测！
        </Paragraph>
        <Paragraph style={{ color: '#999', fontSize: 13 }}>
          这就是社区模型的预测能力。你也可以创建自己的模型，定制专属策略！
        </Paragraph>
      </div>
    )
  }

  return (
    <div>
      <Paragraph style={{ textAlign: 'center', color: '#666', marginBottom: 16, fontSize: 14 }}>
        选择一个社区模型，输入股票代码，一键获得预测结果！
      </Paragraph>

      {models.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 13 }}>选择社区模型：</div>
          <List
            size="small"
            dataSource={models}
            style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8 }}
            renderItem={(model) => (
              <List.Item
                onClick={() => setSelectedModel(model)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: selectedModel?.id === model.id ? '#e6f7ff' : 'transparent',
                  borderLeft: selectedModel?.id === model.id ? '3px solid #1890ff' : '3px solid transparent',
                }}
              >
                <List.Item.Meta
                  avatar={
                    <Tag color={MODEL_TYPE_COLORS[model.model_type] || 'default'} style={{ margin: 0 }}>
                      {model.model_type?.toUpperCase()}
                    </Tag>
                  }
                  title={<span style={{ fontSize: 13 }}>{model.name}</span>}
                  description={
                    <span style={{ fontSize: 11, color: '#999' }}>
                      ❤️ {model.likes_count} · 📋 {model.clones_count}克隆
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 13 }}>股票代码：</div>
          <Input
            placeholder="如 600519（贵州茅台）"
            value={stockCode}
            onChange={(e) => setStockCode(e.target.value)}
            prefix={<SearchOutlined style={{ color: '#999' }} />}
          />
        </div>
        <Button
          type="primary"
          size="large"
          icon={<LineChartOutlined />}
          loading={predicting}
          onClick={handlePredict}
          disabled={!selectedModel || !stockCode}
          style={{ height: 40 }}
        >
          预测！
        </Button>
      </div>

      {models.length === 0 && (
        <Paragraph style={{ textAlign: 'center', color: '#999', marginTop: 16, fontSize: 13 }}>
          暂无社区模型可用，跳过此步骤，先去创建你自己的模型吧！
        </Paragraph>
      )}
    </div>
  )
}

interface OnboardingGuideProps {
  open: boolean
  onClose: () => void
}

const OnboardingGuide: React.FC<OnboardingGuideProps> = ({ open, onClose }) => {
  const isMobile = window.innerWidth < 768
  const [currentStep, setCurrentStep] = useState(0)
  const [hasQuickPredicted, setHasQuickPredicted] = useState(false)
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
  const isQuickPredictStep = currentStep === 1

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
        style={{ marginBottom: 24 }}
        items={ONBOARDING_STEPS.map((s) => ({ title: s.title }))}
      />

      {isLastStep ? (
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
      ) : isQuickPredictStep ? (
        <div style={{ minHeight: 280 }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>{step.icon}</div>
          <Title level={4} style={{ marginBottom: 8, textAlign: 'center' }}>{step.title}</Title>
          <Paragraph
            style={{ fontSize: 14, color: '#666', maxWidth: 420, margin: '0 auto 16px', lineHeight: 1.8, textAlign: 'center' }}
          >
            {step.description}
          </Paragraph>
          <QuickPredictStep onPredicted={() => setHasQuickPredicted(true)} />
        </div>
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
              {isQuickPredictStep && hasQuickPredicted ? '太棒了，继续' : '下一步'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default OnboardingGuide
