import React, { useEffect, useState } from 'react'
import {
  Card,
  Row,
  Col,
  Tag,
  Button,
  Space,
  Statistic,
  Descriptions,
  List,
  Spin,
  message,
  Avatar,
  Modal,
  Input,
  InputNumber,
  DatePicker,
  Alert,
  Progress,
  Table,
} from 'antd'
import {
  HeartOutlined,
  HeartFilled,
  CopyOutlined,
  ThunderboltOutlined,
  ArrowLeftOutlined,
  RiseOutlined,
  FallOutlined,
  GlobalOutlined,
  LineChartOutlined,
  FundOutlined,
  LinkOutlined,
  LockOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  TrophyOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { communityApi } from '@/services/api'
import { CommunityModel, CommunitySignal } from '@/types'
import FunPredictionResult from '@/components/FunPredictionResult'

const MODEL_TYPE_COLORS: Record<string, string> = {
  lstm: 'blue',
  gru: 'cyan',
  xgboost: 'green',
  lightgbm: 'lime',
  randomforest: 'orange',
  mlp: 'purple',
}

const VISIBILITY_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  public: { label: '公开', color: 'green', icon: <GlobalOutlined /> },
  link: { label: '链接可见', color: 'blue', icon: <LinkOutlined /> },
  private: { label: '私密', color: 'red', icon: <LockOutlined /> },
}

const CommunityModelDetail: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [model, setModel] = useState<CommunityModel | null>(null)
  const [signals, setSignals] = useState<CommunitySignal[]>([])
  const [loading, setLoading] = useState(false)
  const [liking, setLiking] = useState(false)
  const [cloning, setCloning] = useState(false)

  // 直接预测弹窗状态
  const [predictModalVisible, setPredictModalVisible] = useState(false)
  const [predictStockCode, setPredictStockCode] = useState('')
  const [predictDays, setPredictDays] = useState(1)
  const [predicting, setPredicting] = useState(false)
  const [predictResult, setPredictResult] = useState<any>(null)

  // 回测弹窗状态
  const [backtestModalVisible, setBacktestModalVisible] = useState(false)
  const [backtestStockCode, setBacktestStockCode] = useState('')
  const [backtestStartDate, setBacktestStartDate] = useState<string | undefined>(undefined)
  const [backtestEndDate, setBacktestEndDate] = useState<string | undefined>(undefined)
  const [backtestCapital, setBacktestCapital] = useState(100000)
  const [backtesting, setBacktesting] = useState(false)
  const [backtestResult, setBacktestResult] = useState<any>(null)

  useEffect(() => {
    if (id) {
      fetchModel()
      fetchSignals()
    }
  }, [id])

  const fetchModel = async () => {
    setLoading(true)
    try {
      const data = await communityApi.getModel(Number(id))
      setModel(data as any)
    } catch (error) {
      message.error('获取模型详情失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchSignals = async () => {
    try {
      const data = await communityApi.getSignals({ community_model_id: Number(id), page_size: 20 })
      setSignals((data as any)?.items || (Array.isArray(data) ? data : []))
    } catch (error) {
      message.error('获取信号列表失败')
    }
  }

  const handleLike = async () => {
    if (!model) return
    setLiking(true)
    try {
      await communityApi.likeModel(model.id)
      fetchModel()
    } catch (error) {
      message.error('操作失败')
    } finally {
      setLiking(false)
    }
  }

  const handleClone = async () => {
    if (!model) return
    setCloning(true)
    try {
      await communityApi.cloneModel(model.id)
      message.success('克隆成功，已添加到我的模型')
      fetchModel()
    } catch (error) {
      message.error('克隆失败')
    } finally {
      setCloning(false)
    }
  }

  const handlePK = async () => {
    navigate('/community/pk')
  }

  const handlePredict = async () => {
    if (!model || !predictStockCode) {
      message.warning('请输入股票代码')
      return
    }
    setPredicting(true)
    setPredictResult(null)
    try {
      const data = await communityApi.predictWithModel(model.id, {
        stock_code: predictStockCode,
        days: predictDays,
      })
      setPredictResult(data)
      message.success('预测完成')
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message
      message.error(detail || '预测失败')
    } finally {
      setPredicting(false)
    }
  }

  const handleBacktest = async () => {
    if (!model || !backtestStockCode) {
      message.warning('请输入股票代码')
      return
    }
    setBacktesting(true)
    setBacktestResult(null)
    try {
      const data = await communityApi.backtestModel(model.id, {
        stock_code: backtestStockCode,
        start_date: backtestStartDate,
        end_date: backtestEndDate,
        initial_capital: backtestCapital,
      })
      setBacktestResult(data)
      message.success('回测完成')
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message
      message.error(detail || '回测失败')
    } finally {
      setBacktesting(false)
    }
  }

  const openPredictModal = () => {
    setPredictStockCode('')
    setPredictDays(1)
    setPredictResult(null)
    setPredictModalVisible(true)
  }

  const openBacktestModal = () => {
    setBacktestStockCode('')
    setBacktestStartDate(undefined)
    setBacktestEndDate(undefined)
    setBacktestCapital(100000)
    setBacktestResult(null)
    setBacktestModalVisible(true)
  }

  const getDirectionIcon = (direction: string) => {
    if (direction === 'up') return <RiseOutlined style={{ color: '#f5222d' }} />
    if (direction === 'down') return <FallOutlined style={{ color: '#52c41a' }} />
    return <GlobalOutlined />
  }

  const getDirectionText = (direction: string) => {
    if (direction === 'up') return '看涨'
    if (direction === 'down') return '看跌'
    return '震荡'
  }

  const getVisibilityTag = (visibility?: string) => {
    const vis = visibility || 'public'
    const config = VISIBILITY_CONFIG[vis] || VISIBILITY_CONFIG.public
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.label}
      </Tag>
    )
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!model) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <p>模型不存在</p>
        <Button onClick={() => navigate('/community')}>返回社区</Button>
      </div>
    )
  }

  return (
    <div>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/community')}
        style={{ paddingLeft: 0, marginBottom: 16 }}
      >
        返回模型广场
      </Button>

      <Card style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center" size={16}>
              <h2 style={{ margin: 0 }}>{model.name}</h2>
              <Tag color={MODEL_TYPE_COLORS[model.model_type] || 'default'}>
                {model.model_type.toUpperCase()}
              </Tag>
              {getVisibilityTag(model.visibility)}
            </Space>
            <div style={{ marginTop: 8, color: '#999' }}>
              {model.description || '暂无描述'}
            </div>
            <div style={{ marginTop: 8 }}>
              <Space>
                <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>
                  {model.author?.username?.[0] || '?'}
                </Avatar>
                <span>{model.author?.username || '匿名'}</span>
                <span style={{ color: '#999' }}>
                  发布于 {new Date(model.created_at).toLocaleDateString()}
                </span>
              </Space>
            </div>
            {/* 醒目的一键预测入口 */}
            <div style={{ marginTop: 16 }}>
              <Button
                type="primary"
                size="large"
                icon={<ThunderboltOutlined />}
                onClick={openPredictModal}
                style={{
                  background: 'linear-gradient(135deg, #1890ff 0%, #36cfc9 100%)',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 18,
                  height: 48,
                  paddingInline: 32,
                  borderRadius: 8,
                  boxShadow: '0 4px 12px rgba(24, 144, 255, 0.35)',
                }}
              >
                🔮 立即预测
              </Button>
            </div>
          </Col>
          <Col>
            <Space wrap>
              <Button
                icon={<LineChartOutlined />}
                onClick={openPredictModal}
              >
                直接预测
              </Button>
              <Button
                icon={<FundOutlined />}
                onClick={openBacktestModal}
              >
                回测
              </Button>
              <Button
                icon={model.is_liked ? <HeartFilled style={{ color: '#eb2f96' }} /> : <HeartOutlined />}
                onClick={handleLike}
                loading={liking}
              >
                {model.likes_count} 点赞
              </Button>
              <Button
                icon={<CopyOutlined />}
                onClick={handleClone}
                loading={cloning}
              >
                {model.clones_count} 克隆
              </Button>
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={handlePK}
              >
                发起PK
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {model.metrics && Object.keys(model.metrics).length > 0 && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {Object.entries(model.metrics).map(([key, value]) => (
            <Col xs={12} sm={8} md={6} key={key}>
              <Card>
                <Statistic
                  title={key}
                  value={typeof value === 'number' && value <= 1 ? (value * 100).toFixed(2) : value}
                  suffix={typeof value === 'number' && value <= 1 ? '%' : ''}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* 预测战绩 */}
      {model.prediction_record && model.prediction_record.total_predictions > 0 && (
        <Card
          title={
            <Space>
              <TrophyOutlined style={{ color: '#faad14' }} />
              <span>预测战绩</span>
            </Space>
          }
          style={{ marginBottom: 24 }}
        >
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            <Col xs={12} sm={6}>
              <div style={{ textAlign: 'center' }}>
                <Progress
                  type="circle"
                  percent={Math.round((model.prediction_record.accuracy || 0) * 100)}
                  size={80}
                  strokeColor={
                    (model.prediction_record.accuracy || 0) >= 0.7 ? '#52c41a' :
                    (model.prediction_record.accuracy || 0) >= 0.5 ? '#faad14' : '#f5222d'
                  }
                />
                <div style={{ marginTop: 8, color: '#999', fontSize: 13 }}>准确率</div>
              </div>
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title="总预测数" value={model.prediction_record.total_predictions} />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="正确数"
                value={model.prediction_record.correct_predictions}
                valueStyle={{ color: '#52c41a' }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title="当前连胜" value={model.prediction_record.current_streak} suffix={`/ ${model.prediction_record.best_streak} 最佳`} />
            </Col>
          </Row>

          {model.prediction_record.badges.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, color: '#666', fontSize: 13 }}>称号</div>
              <Space size={[8, 8]} wrap>
                {model.prediction_record.badges.map((badge) => (
                  <Tag
                    key={badge}
                    color={
                      badge.includes('预言大师') ? 'gold' :
                      badge.includes('精准猎手') ? 'green' :
                      badge.includes('反向指标') ? 'red' :
                      badge.includes('百战老兵') ? 'purple' :
                      badge.includes('资深预测') ? 'cyan' :
                      badge.includes('七日连胜') ? 'volcano' :
                      badge.includes('五连绝世') ? 'orange' :
                      'geekblue'
                    }
                    style={{ fontSize: 13, padding: '2px 8px' }}
                  >
                    {badge}
                  </Tag>
                ))}
              </Space>
            </div>
          )}

          {model.prediction_record.daily_records.length > 0 && (
            <div>
              <div style={{ marginBottom: 8, color: '#666', fontSize: 13 }}>最近预测记录</div>
              <Table
                dataSource={model.prediction_record.daily_records.slice(0, 10)}
                rowKey={(record) => `${record.date}-${record.stock_code}`}
                size="small"
                pagination={false}
                scroll={{ x: 480 }}
                columns={[
                  {
                    title: '日期',
                    dataIndex: 'date',
                    key: 'date',
                    width: 100,
                  },
                  {
                    title: '股票',
                    dataIndex: 'stock_code',
                    key: 'stock_code',
                    width: 90,
                  },
                  {
                    title: '预测方向',
                    dataIndex: 'direction',
                    key: 'direction',
                    width: 90,
                    render: (v: string) => (
                      <Tag color={v === 'up' ? 'red' : v === 'down' ? 'green' : 'default'}>
                        {v === 'up' ? '看涨' : v === 'down' ? '看跌' : '震荡'}
                      </Tag>
                    ),
                  },
                  {
                    title: '实际方向',
                    dataIndex: 'actual',
                    key: 'actual',
                    width: 90,
                    render: (v: string | null) => v ? (
                      <Tag color={v === 'up' ? 'red' : v === 'down' ? 'green' : 'default'}>
                        {v === 'up' ? '看涨' : v === 'down' ? '看跌' : '震荡'}
                      </Tag>
                    ) : <span style={{ color: '#bbb' }}>待验证</span>,
                  },
                  {
                    title: '结果',
                    dataIndex: 'correct',
                    key: 'correct',
                    width: 70,
                    render: (v: boolean | null) => {
                      if (v === true) return <CheckCircleFilled style={{ color: '#52c41a', fontSize: 16 }} />
                      if (v === false) return <CloseCircleFilled style={{ color: '#f5222d', fontSize: 16 }} />
                      return <span style={{ color: '#bbb' }}>-</span>
                    },
                  },
                ]}
              />
            </div>
          )}
        </Card>
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={14}>
          <Card title="模型配置">
            <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
              <Descriptions.Item label="模型类型">
                <Tag color={MODEL_TYPE_COLORS[model.model_type] || 'default'}>
                  {model.model_type.toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="预测目标">{model.target}</Descriptions.Item>
              <Descriptions.Item label="训练股票">
                <Space size={4} wrap>
                  {model.stock_codes.map((code) => (
                    <Tag key={code}>{code}</Tag>
                  ))}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="训练日期范围">
                {model.train_date_range?.start || '未设置'} ~ {model.train_date_range?.end || '未设置'}
              </Descriptions.Item>
              {Object.entries(model.model_params).map(([key, value]) => (
                <Descriptions.Item label={key} key={key}>
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="特征列表">
            <Space size={[8, 8]} wrap>
              {model.features.map((feature) => (
                <Tag key={feature} color="blue">{feature}</Tag>
              ))}
            </Space>
            {model.features.length === 0 && (
              <div style={{ color: '#999' }}>暂无特征信息</div>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="预测信号">
        <List
          dataSource={signals}
          renderItem={(signal) => (
            <List.Item
              actions={[
                <span key="likes" style={{ color: '#999' }}>
                  <HeartOutlined /> {signal.likes_count}
                </span>,
              ]}
            >
              <List.Item.Meta
                avatar={getDirectionIcon(signal.direction)}
                title={
                  <Space>
                    <span>{signal.stock_code}</span>
                    {signal.stock_name && <span style={{ color: '#999' }}>{signal.stock_name}</span>}
                    <Tag color={signal.direction === 'up' ? 'red' : signal.direction === 'down' ? 'green' : 'default'}>
                      {getDirectionText(signal.direction)}
                    </Tag>
                    {signal.confidence !== undefined && (
                      <Tag color="blue">置信度 {(signal.confidence * 100).toFixed(0)}%</Tag>
                    )}
                    {signal.is_correct !== undefined && (
                      <Tag color={signal.is_correct ? 'success' : 'error'}>
                        {signal.is_correct ? '正确' : '错误'}
                      </Tag>
                    )}
                  </Space>
                }
                description={
                  <Space size={8}>
                    <span style={{ fontSize: 12 }}>{signal.author?.username || '匿名'}</span>
                    <span style={{ fontSize: 12, color: '#999' }}>{signal.prediction_date}</span>
                  </Space>
                }
              />
            </List.Item>
          )}
          locale={{ emptyText: '暂无预测信号' }}
        />
      </Card>

      {/* 直接预测弹窗 */}
      <Modal
        title="直接预测"
        open={predictModalVisible}
        onCancel={() => setPredictModalVisible(false)}
        onOk={handlePredict}
        confirmLoading={predicting}
        okText="执行预测"
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>股票代码</div>
            <Input
              placeholder="输入股票代码，如 000001"
              value={predictStockCode}
              onChange={(e) => setPredictStockCode(e.target.value)}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>预测天数</div>
            <InputNumber
              min={1}
              max={30}
              value={predictDays}
              onChange={(v) => setPredictDays(v || 1)}
              style={{ width: '100%' }}
            />
          </div>

          {predictResult && (
            <FunPredictionResult
              direction={predictResult.prediction_label || predictResult.direction || 'flat'}
              confidence={predictResult.confidence}
              stockCode={predictStockCode}
              predictedPrice={predictResult.predicted_close || predictResult.predicted_price}
              predictedChangePct={predictResult.predicted_change_pct}
              targetType={model?.target}
              predictedOpen={predictResult.predicted_open}
              predictedHigh={predictResult.predicted_high}
              predictedLow={predictResult.predicted_low}
              compact={false}
            />
          )}
        </div>
      </Modal>

      {/* 回测弹窗 */}
      <Modal
        title="社区模型回测"
        open={backtestModalVisible}
        onCancel={() => setBacktestModalVisible(false)}
        onOk={handleBacktest}
        confirmLoading={backtesting}
        okText="执行回测"
        width={600}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Alert
            message="回测将使用社区模型的训练权重对指定股票进行历史模拟交易"
            type="info"
            showIcon
          />
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>股票代码</div>
            <Input
              placeholder="输入股票代码，如 000001"
              value={backtestStockCode}
              onChange={(e) => setBacktestStockCode(e.target.value)}
            />
          </div>
          <Row gutter={16}>
            <Col span={12}>
              <div style={{ marginBottom: 4, fontWeight: 500 }}>开始日期（可选）</div>
              <DatePicker
                style={{ width: '100%' }}
                onChange={(_, ds) => setBacktestStartDate(ds as string || undefined)}
                placeholder="默认为训练结束日"
              />
            </Col>
            <Col span={12}>
              <div style={{ marginBottom: 4, fontWeight: 500 }}>结束日期（可选）</div>
              <DatePicker
                style={{ width: '100%' }}
                onChange={(_, ds) => setBacktestEndDate(ds as string || undefined)}
                placeholder="默认为今天"
              />
            </Col>
          </Row>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>初始资金</div>
            <InputNumber
              min={10000}
              max={10000000}
              step={10000}
              value={backtestCapital}
              onChange={(v) => setBacktestCapital(v || 100000)}
              style={{ width: '100%' }}
              prefix="¥"
            />
          </div>

          {backtestResult && (
            <Card size="small" title="回测结果" style={{ marginTop: 8 }}>
              <Row gutter={[16, 12]}>
                <Col span={8}>
                  <Statistic
                    title="总收益率"
                    value={((backtestResult.total_return || 0) * 100).toFixed(2)}
                    suffix="%"
                    valueStyle={{
                      color: (backtestResult.total_return || 0) >= 0 ? '#f5222d' : '#52c41a',
                    }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="年化收益"
                    value={((backtestResult.annual_return || 0) * 100).toFixed(2)}
                    suffix="%"
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="最大回撤"
                    value={((backtestResult.max_drawdown || 0) * 100).toFixed(2)}
                    suffix="%"
                    valueStyle={{ color: '#f5222d' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic title="夏普比率" value={(backtestResult.sharpe_ratio || 0).toFixed(2)} />
                </Col>
                <Col span={8}>
                  <Statistic title="交易次数" value={backtestResult.trades_count || 0} />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="胜率"
                    value={((backtestResult.win_rate || 0) * 100).toFixed(1)}
                    suffix="%"
                  />
                </Col>
              </Row>
            </Card>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default CommunityModelDetail
