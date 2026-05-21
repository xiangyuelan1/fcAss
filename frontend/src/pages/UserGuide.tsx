import React, { useState, useEffect } from 'react'
import {
  Typography,
  Card,
  Anchor,
  Steps,
  Tag,
  Divider,
  Space,
  Button,
  Tabs,
} from 'antd'
import {
  RocketOutlined,
  BulbOutlined,
  PlayCircleOutlined,
  AppstoreOutlined,
  StarOutlined,
  QuestionCircleOutlined,
  ThunderboltOutlined,
  RobotOutlined,
  GlobalOutlined,
  HomeOutlined,
  CheckCircleOutlined,
  ExperimentOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

const { Title, Paragraph, Text } = Typography

/* ── 目录结构定义 ── */
interface GuideSection {
  key: string
  title: string
  icon: React.ReactNode
  content: React.ReactNode
}

/* ── Callout 提示框 ── */
const Callout: React.FC<{
  type?: 'info' | 'success' | 'warning' | 'tip'
  title?: string
  children: React.ReactNode
}> = ({ type = 'info', title, children }) => {
  const preset = {
    info: { color: '#1890ff', bg: '#e6f7ff', border: '#91d5ff', icon: <BulbOutlined /> },
    success: { color: '#52c41a', bg: '#f6ffed', border: '#b7eb8f', icon: <CheckCircleOutlined /> },
    warning: { color: '#faad14', bg: '#fffbe6', border: '#ffe58f', icon: <QuestionCircleOutlined /> },
    tip: { color: '#722ed1', bg: '#f9f0ff', border: '#d3adf7', icon: <StarOutlined /> },
  }[type]

  return (
    <div style={{
      padding: '12px 16px',
      background: preset.bg,
      border: `1px solid ${preset.border}`,
      borderLeft: `4px solid ${preset.color}`,
      borderRadius: 6,
      marginBottom: 16,
    }}>
      {title && (
        <div style={{ fontWeight: 600, color: preset.color, marginBottom: 4 }}>
          {preset.icon} {title}
        </div>
      )}
      <div style={{ color: '#333', lineHeight: 1.8 }}>{children}</div>
    </div>
  )
}

/* ── 步骤卡片 ── */
const StepCard: React.FC<{
  step: number
  title: string
  children: React.ReactNode
}> = ({ step, title, children }) => (
  <Card
    size="small"
    style={{ marginBottom: 16 }}
    title={
      <Space>
        <Tag color="blue" style={{ marginRight: 0 }}>Step {step}</Tag>
        <Text strong>{title}</Text>
      </Space>
    }
  >
    {children}
  </Card>
)

/* ── 快速开始 ── */
const QuickStart: React.FC = () => {
  const navigate = useNavigate()

  return (
    <div>
      <Title level={4}>1.1 注册与登录</Title>
      <Paragraph>
        访问平台首页，使用手机号注册账号并登录。首次登录会展示免责声明，请仔细阅读后确认。
      </Paragraph>

      <Divider />

      <Title level={4}>1.2 五分钟创建你的第一个模型</Title>
      <Callout type="tip" title="5分钟上手">
        跟随以下步骤，5分钟内即可创建你的第一个AI预测模型并获取预测结果！
      </Callout>

      <Steps
        direction="vertical"
        size="small"
        current={5}
        items={[
          {
            title: '进入模型管理',
            description: '点击左侧菜单「模型管理」→「我的模型」，然后点击「创建模型」按钮。',
          },
          {
            title: '选择算法',
            description: '推荐新手选择 XGBoost，它对金融数据有较好的拟合能力，训练速度也较快。',
          },
          {
            title: '选择训练股票',
            description: '搜索并添加你感兴趣的股票，例如贵州茅台(600519)。首次使用建议只选1只股票。',
          },
          {
            title: '配置特征指标',
            description: '首次使用推荐全选默认指标。后续可根据经验自定义，如 MA5、RSI、MACD 等。',
          },
          {
            title: '设置预测目标',
            description: '选择「次日方向」（预测涨/跌），这是最直观的预测类型，适合入门。',
          },
          {
            title: '一键训练',
            description: '点击「开始训练」，等待训练完成即可在工作台查看预测结果。',
          },
        ]}
      />

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <Button type="primary" size="large" icon={<RocketOutlined />} onClick={() => navigate('/models/build')}>
          立即创建模型
        </Button>
      </div>
    </div>
  )
}

/* ── 核心概念 ── */
const CoreConcepts: React.FC = () => (
  <div>
    <Title level={4}>2.1 什么是预测模型？</Title>
    <Paragraph>
      预测模型是基于机器学习算法，通过学习历史股票数据的规律来预测未来走势的程序。
      平台支持多种算法，每种算法有不同的特点和适用场景：
    </Paragraph>
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div><Tag color="blue">XGBoost</Tag> 梯度提升树，推荐新手使用。训练快、效果好，适合表格型金融数据。</div>
        <div><Tag color="purple">MLP</Tag> 多层感知机，经典神经网络。适合捕捉非线性关系，训练速度中等。</div>
        <div><Tag color="green">LSTM</Tag> 长短期记忆网络，擅长处理时序数据。训练较慢，但对时间序列模式敏感。</div>
        <div><Tag color="orange">GRU</Tag> 门控循环单元，LSTM的轻量版。训练更快，适合数据量较少的场景。</div>
        <div><Tag color="cyan">Transformer</Tag> 注意力机制模型，适合捕捉长距离依赖。训练最慢，但潜力最大。</div>
      </Space>
    </Card>

    <Callout type="info" title="选择建议">
      新手推荐 XGBoost；有时间序列经验的可尝试 LSTM/GRU；追求极致效果且算力充足的可尝试 Transformer。
    </Callout>

    <Divider />

    <Title level={4}>2.2 特征指标是什么？</Title>
    <Paragraph>
      特征指标是模型用来学习和预测的输入数据。可以理解为模型的"视角"——
      你提供哪些角度的数据，模型就从哪些角度去学习规律。
    </Paragraph>
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div><Tag>价格类</Tag> 开盘价、收盘价、最高价、最低价、成交量等基础行情数据</div>
        <div><Tag color="blue">趋势类</Tag> MA（移动平均线）、MACD、EMA 等趋势判断指标</div>
        <div><Tag color="green">震荡类</Tag> RSI、KDJ、CCI 等超买超卖指标</div>
        <div><Tag color="orange">波动类</Tag> 布林带、ATR 等波动率指标</div>
        <div><Tag color="purple">成交量类</Tag> OBV、VWAP 等量价结合指标</div>
      </Space>
    </Card>

    <Callout type="tip" title="特征窗口">
      特征窗口决定了模型回看多少天的数据。窗口越大，模型能看到更长周期的规律，但也可能引入更多噪声。
      推荐新手使用 5 日窗口，有经验后可尝试 10 日或 20 日。
    </Callout>

    <Divider />

    <Title level={4}>2.3 预测目标类型</Title>
    <Paragraph>平台支持三种预测目标，对应不同的投资策略：</Paragraph>

    <Card size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Tag color="red">次日方向</Tag>
          <Text strong>预测股票次日是涨还是跌</Text>
          <Paragraph style={{ marginBottom: 0, marginTop: 4, color: '#666' }}>
            最直观的预测类型，输出"看涨 ↑"或"看跌 ↓"以及置信度百分比。
            适合短线交易决策，入门首选。
          </Paragraph>
        </div>
        <div>
          <Tag color="blue">次日价格</Tag>
          <Text strong>预测股票次日的具体价格</Text>
          <Paragraph style={{ marginBottom: 0, marginTop: 4, color: '#666' }}>
            可选择预测开盘价、收盘价、最高价或最低价。
            输出具体数值和置信区间，适合需要精确价格参考的场景。
          </Paragraph>
        </div>
        <div>
          <Tag color="green">趋势预测</Tag>
          <Text strong>预测股票未来一段时间的趋势方向</Text>
          <Paragraph style={{ marginBottom: 0, marginTop: 4, color: '#666' }}>
            支持 30日/60日/90日趋势预测，输出"上涨趋势"或"下跌趋势"。
            适合中长线投资参考。
          </Paragraph>
        </div>
      </Space>
    </Card>

    <Divider />

    <Title level={4}>2.4 回测验证</Title>
    <Paragraph>
      回测是用历史数据验证模型表现的方法。平台模拟真实交易环境，
      根据模型的预测信号进行虚拟交易，计算收益率、胜率等指标。
    </Paragraph>
    <Callout type="warning" title="重要提醒">
      回测结果基于历史数据，不代表未来实际收益。市场环境变化、滑点、手续费等因素
      都会导致实盘与回测存在差异。请将回测结果作为参考，而非投资依据。
    </Callout>
  </div>
)

/* ── 完整工作流示例 ── */
const WorkflowExample: React.FC = () => {
  const navigate = useNavigate()

  return (
    <div>
      <Callout type="info" title="📋 目标">
        预测贵州茅台(600519)次日涨跌方向——从零开始，完成模型创建、训练、预测、回测的全流程。
      </Callout>

      <StepCard step={1} title="创建模型">
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>进入「模型管理」→ 点击「创建模型」</div>
          <div>
            <Tag color="blue">算法选择</Tag> XGBoost（推荐新手，训练快、效果好）
          </div>
          <div>
            <Tag color="blue">特征窗口</Tag> 5日（回看最近5个交易日的数据）
          </div>
          <div>
            <Tag color="blue">预测目标</Tag> 次日方向（预测涨/跌）
          </div>
        </Space>
      </StepCard>

      <StepCard step={2} title="选择训练股票">
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>在股票搜索框中输入"贵州茅台"或"600519"</div>
          <div>点击添加，将该股票加入训练列表</div>
          <div>
            <Tag color="blue">时间范围</Tag> 2020-01-01 至今（至少3年数据，保证训练质量）
          </div>
        </Space>
      </StepCard>

      <StepCard step={3} title="配置特征指标">
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Tag color="green">推荐</Tag> 首次使用全选默认指标，让模型自动学习所有可用特征
          </div>
          <div>
            <Tag color="blue">自定义</Tag> 有经验后可精选指标，如 MA5、RSI、MACD、布林带等
          </div>
          <div>指标越多不一定越好，过多指标可能导致过拟合</div>
        </Space>
      </StepCard>

      <StepCard step={4} title="训练模型">
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>点击「开始训练」按钮，系统将自动开始训练</div>
          <div>训练时间取决于算法类型和数据量，通常 1-5 分钟</div>
          <div>训练完成后可在「我的工作台」查看训练指标</div>
          <Callout type="tip" title="训练指标">
            关注准确率(Accuracy)和F1分数。方向预测准确率 60%以上即为可用模型，
            70%以上属于优秀水平。
          </Callout>
        </Space>
      </StepCard>

      <StepCard step={5} title="预测">
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>训练完成后，进入「训练与预测」页面</div>
          <div>选择刚训练好的模型，点击「预测」</div>
          <div>系统将自动预测该模型所有训练股票的次日走势</div>
          <div>
            示例结果：<Tag color="red">看涨 ↑</Tag> 置信度 <Text strong>72%</Text>
          </div>
        </Space>
      </StepCard>

      <StepCard step={6} title="回测验证">
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>在预测结果页面点击「回测」</div>
          <div>
            <Tag color="blue">初始资金</Tag> 100,000 元（默认）
          </div>
          <div>查看回测收益曲线、最大回撤、夏普比率等指标</div>
          <div>根据回测结果决定是否需要调整模型参数重新训练</div>
        </Space>
      </StepCard>

      <Divider />

      <Card style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
        <Title level={5} style={{ marginBottom: 12 }}>📊 预期结果</Title>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div><CheckCircleOutlined style={{ color: '#52c41a' }} /> 模型准确率：60-70%（方向预测）</div>
          <div><CheckCircleOutlined style={{ color: '#52c41a' }} /> 回测年化收益：取决于市场环境</div>
          <div><CheckCircleOutlined style={{ color: '#52c41a' }} /> 建议：定期重新训练以保持模型有效性</div>
        </Space>
      </Card>

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => navigate('/models/build')}>
          开始实践
        </Button>
      </div>
    </div>
  )
}

/* ── 功能详解 ── */
const FeatureDetails: React.FC = () => (
  <div>
    <Title level={4}>4.1 我的工作台</Title>
    <Paragraph>
      工作台是你的个人仪表盘，集中展示最重要的信息：
    </Paragraph>
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div><HomeOutlined style={{ color: '#1890ff', marginRight: 8 }} /> 最新预测结果一览</div>
        <div><ThunderboltOutlined style={{ color: '#52c41a', marginRight: 8 }} /> 模型训练进度实时追踪</div>
        <div><RobotOutlined style={{ color: '#722ed1', marginRight: 8 }} /> 模型状态总览（已训练/训练中/待训练）</div>
        <div><GlobalOutlined style={{ color: '#faad14', marginRight: 8 }} /> 社区热门预测推荐</div>
      </Space>
    </Card>

    <Divider />

    <Title level={4}>4.2 模型管理</Title>
    <Paragraph>
      模型管理是平台的核心功能区域，包含模型的完整生命周期管理：
    </Paragraph>
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div><Tag color="blue">创建模型</Tag> 选择算法 → 选择股票 → 配置特征 → 设置目标 → 调整参数</div>
        <div><Tag color="green">编辑模型</Tag> 修改模型配置、增删训练股票、调整特征指标</div>
        <div><Tag color="orange">训练模型</Tag> 一键启动训练，实时查看训练进度和指标</div>
        <div><Tag color="red">删除模型</Tag> 删除不再需要的模型（训练中的模型需先停止）</div>
      </Space>
    </Card>

    <Divider />

    <Title level={4}>4.3 训练与预测</Title>
    <Paragraph>
      训练与预测页面提供模型训练和股票预测的统一操作入口：
    </Paragraph>
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div>选择已创建的模型，一键启动训练</div>
        <div>训练完成后，选择模型即可自动预测所有训练股票</div>
        <div>支持批量预测，一次预测多只股票</div>
        <div>预测结果支持回测验证和分享到社区</div>
      </Space>
    </Card>

    <Divider />

    <Title level={4}>4.4 自选股</Title>
    <Paragraph>
      自选股功能帮助你管理关注的股票列表：
    </Paragraph>
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div>创建多个自选股列表，按板块或策略分类</div>
        <div>支持搜索添加、批量操作</div>
        <div>在创建模型时可直接从自选股列表选择训练股票</div>
        <div>股票池功能支持按条件筛选股票</div>
      </Space>
    </Card>

    <Divider />

    <Title level={4}>4.5 社区</Title>
    <Paragraph>
      社区是用户交流和分享的平台：
    </Paragraph>
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div><Tag color="blue">模型广场</Tag> 浏览其他用户分享的模型和预测</div>
        <div><Tag color="green">预测分享</Tag> 将自己的预测结果分享到社区</div>
        <div><Tag color="orange">每日一猜</Tag> 每天预测指定股票涨跌，赢取积分</div>
        <div><Tag color="red">PK挑战</Tag> 与其他用户的模型进行预测对决</div>
      </Space>
    </Card>

    <Divider />

    <Title level={4}>4.6 PK挑战</Title>
    <Paragraph>
      PK挑战是社区中的竞技玩法：
    </Paragraph>
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div>选择同一只股票，与对手的模型比拼预测准确率</div>
        <div>支持随机匹配和好友约战</div>
        <div>胜利可获得积分和排名提升</div>
        <div>排行榜展示最强预测模型</div>
      </Space>
    </Card>
  </div>
)

/* ── 高级技巧 ── */
const AdvancedTips: React.FC = () => (
  <div>
    <Title level={4}>5.1 特征窗口优化</Title>
    <Paragraph>
      特征窗口是影响模型表现的关键参数之一。不同窗口大小适合不同的预测场景：
    </Paragraph>
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div><Tag>5日窗口</Tag> 适合短线预测，关注最近一周的走势规律</div>
        <div><Tag color="blue">10日窗口</Tag> 平衡短期和中期信息，适合大多数场景</div>
        <div><Tag color="green">20日窗口</Tag> 适合捕捉月度级别的趋势，数据量需求更大</div>
      </Space>
    </Card>
    <Callout type="tip" title="优化建议">
      从5日窗口开始，逐步增大窗口观察模型表现。如果增大窗口后准确率下降，
      说明该股票的短期规律更显著，应使用较小窗口。
    </Callout>

    <Divider />

    <Title level={4}>5.2 多股票联合训练</Title>
    <Paragraph>
      在一个模型中添加多只股票进行联合训练，可以让模型学习到跨股票的共性规律：
    </Paragraph>
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div>同板块股票联合训练（如多只白酒股）效果较好</div>
        <div>不同板块股票联合训练可能降低准确率</div>
        <div>建议每个模型训练 3-5 只相关股票</div>
      </Space>
    </Card>

    <Divider />

    <Title level={4}>5.3 模型选择指南</Title>
    <Paragraph>根据你的需求和条件选择合适的算法：</Paragraph>
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div><Tag color="blue">追求速度</Tag> → XGBoost（训练最快，效果稳定）</div>
        <div><Tag color="purple">追求精度</Tag> → LSTM / Transformer（训练慢，但可能更准）</div>
        <div><Tag color="green">数据量少</Tag> → XGBoost / MLP（小数据集表现更稳定）</div>
        <div><Tag color="orange">数据量大</Tag> → LSTM / Transformer（大数据集优势明显）</div>
      </Space>
    </Card>

    <Divider />

    <Title level={4}>5.4 何时重新训练</Title>
    <Paragraph>
      市场环境不断变化，模型需要定期更新以保持有效性：
    </Paragraph>
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div><ExperimentOutlined style={{ marginRight: 8 }} /> 预测准确率明显下降时（低于55%）</div>
        <div><ExperimentOutlined style={{ marginRight: 8 }} /> 市场出现重大变化时（如政策调整、黑天鹅事件）</div>
        <div><ExperimentOutlined style={{ marginRight: 8 }} /> 建议每 1-2 周重新训练一次</div>
        <div><ExperimentOutlined style={{ marginRight: 8 }} /> 新增训练数据后也建议重新训练</div>
      </Space>
    </Card>
  </div>
)

/* ── 常见问题 ── */
const FAQ: React.FC = () => {
  const faqItems = [
    {
      q: '预测准确率为什么这么低？',
      a: '股票预测本身是一个极具挑战性的任务，即使是专业量化团队也很难持续获得高准确率。以下是一些提升建议：① 增加训练数据的时间范围；② 优化特征指标组合；③ 尝试不同的算法；④ 调整特征窗口大小。60%以上的方向预测准确率已经是可用的水平。',
    },
    {
      q: '模型需要多久训练一次？',
      a: '建议每 1-2 周重新训练一次。如果市场出现重大变化（如政策调整、突发事件），应立即重新训练。日常使用中，当发现预测准确率明显下降时也应及时重新训练。',
    },
    {
      q: '多只股票联合训练会互相影响吗？',
      a: '会的。联合训练时模型会学习所有训练股票的共性规律，这可能提升同板块股票的预测效果，但也可能稀释个股的特异性。建议同板块、同行业的股票放在一起训练，避免将不相关的股票混在一起。',
    },
    {
      q: '特征窗口设多少合适？',
      a: '取决于你的预测目标和交易风格。短线交易建议 5 日窗口，中线建议 10-20 日窗口。可以从 5 日开始尝试，逐步增大观察效果变化。窗口不是越大越好，过大的窗口会引入过多噪声。',
    },
    {
      q: '为什么回测结果和实际不一致？',
      a: '回测基于历史数据模拟，与实盘存在本质差异：① 回测不考虑滑点和手续费；② 历史规律不代表未来；③ 回测可能存在过拟合；④ 实际交易有流动性限制。请将回测结果作为参考，而非投资依据。',
    },
    {
      q: '如何提高模型的预测效果？',
      a: '几个关键方向：① 数据质量——确保训练数据时间范围足够长（至少3年）；② 特征工程——精选有效指标，避免冗余特征；③ 算法选择——不同算法适合不同场景，多尝试对比；④ 参数调优——调整学习率、树深度等超参数；⑤ 定期重训——保持模型对最新市场环境的适应性。',
    },
    {
      q: '平台的数据来源是什么？',
      a: '平台使用的是A股日K线历史数据，包含开盘价、收盘价、最高价、最低价、成交量等基础行情数据，以及基于这些数据计算的技术指标。所有数据仅供学习研究使用，不构成投资建议。',
    },
  ]

  return (
    <div>
      {faqItems.map((item, index) => (
        <Card
          key={index}
          size="small"
          style={{ marginBottom: 12 }}
          title={
            <Space>
              <QuestionCircleOutlined style={{ color: '#1890ff' }} />
              <Text strong>{item.q}</Text>
            </Space>
          }
        >
          <Paragraph style={{ marginBottom: 0, lineHeight: 1.8 }}>{item.a}</Paragraph>
        </Card>
      ))}
    </div>
  )
}

/* ── 主页面组件 ── */
const SECTIONS: GuideSection[] = [
  {
    key: 'quick-start',
    title: '快速开始',
    icon: <RocketOutlined />,
    content: <QuickStart />,
  },
  {
    key: 'core-concepts',
    title: '核心概念',
    icon: <BulbOutlined />,
    content: <CoreConcepts />,
  },
  {
    key: 'workflow',
    title: '完整工作流',
    icon: <PlayCircleOutlined />,
    content: <WorkflowExample />,
  },
  {
    key: 'features',
    title: '功能详解',
    icon: <AppstoreOutlined />,
    content: <FeatureDetails />,
  },
  {
    key: 'advanced',
    title: '高级技巧',
    icon: <ExperimentOutlined />,
    content: <AdvancedTips />,
  },
  {
    key: 'faq',
    title: '常见问题',
    icon: <QuestionCircleOutlined />,
    content: <FAQ />,
  },
]

const UserGuide: React.FC = () => {
  const [activeSection, setActiveSection] = useState('quick-start')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const currentContent = SECTIONS.find((s) => s.key === activeSection)?.content

  /* 移动端：顶部 Tab 切换 */
  if (isMobile) {
    return (
      <div>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 16 }}>
          📖 使用说明书
        </Title>
        <Tabs
          activeKey={activeSection}
          onChange={setActiveSection}
          items={SECTIONS.map((s) => ({
            key: s.key,
            label: (
              <span>
                {s.icon}
                <span style={{ marginLeft: 4 }}>{s.title}</span>
              </span>
            ),
            children: s.content,
          }))}
          size="small"
          style={{ marginTop: 8 }}
        />
      </div>
    )
  }

  /* 桌面端：左侧目录导航 + 右侧内容 */
  return (
    <div style={{ display: 'flex', gap: 24, minHeight: 'calc(100vh - 200px)' }}>
      {/* 左侧目录导航 */}
      <div style={{ width: 200, flexShrink: 0 }}>
        <Anchor
          offsetTop={80}
          items={SECTIONS.map((s) => ({
            key: s.key,
            href: `#section-${s.key}`,
            title: (
              <span
                onClick={(e) => {
                  e.preventDefault()
                  setActiveSection(s.key)
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: activeSection === s.key ? '#1890ff' : '#666',
                  fontWeight: activeSection === s.key ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {s.icon}
                {s.title}
              </span>
            ),
          }))}
        />
      </div>

      {/* 右侧内容区域 */}
      <div style={{ flex: 1, maxWidth: 800 }}>
        <div style={{ marginBottom: 24 }}>
          <Title level={2} style={{ marginBottom: 8 }}>
            📖 AI量化训练平台 - 使用说明书
          </Title>
          <Paragraph type="secondary">
            从入门到精通，全面了解平台功能与使用方法
          </Paragraph>
        </div>

        <div id={`section-${activeSection}`}>
          {currentContent}
        </div>
      </div>
    </div>
  )
}

export default UserGuide
