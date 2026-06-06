import React, { useEffect, useState, useMemo } from 'react'
import {
  Row, Col, Card, Statistic, Tag, Button, Alert, Skeleton, message, Typography, Space,
} from 'antd'
import dayjs from 'dayjs'
import {
  DatabaseOutlined,
  RobotOutlined,
  PlayCircleOutlined,
  ThunderboltOutlined,
  SyncOutlined,
  WarningOutlined,
  QuestionCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  dataApi, modelApi, trainingApi, backtestApi, predictionApi, communityApi,
} from '@/services/api'
import { UserModel, TrainingTask, PredictionShareItem } from '@/types'
import useSSEProgress from '@/hooks/useSSEProgress'
import OnboardingGuide, { isOnboardingCompleted } from '@/components/OnboardingGuide'
import MascotBull from '@/components/MascotBull'
import QuickPredictCard from '@/components/dashboard/QuickPredictCard'
import PredictionResultsCard from '@/components/dashboard/PredictionResultsCard'
import WatchlistQuotesCard from '@/components/dashboard/WatchlistQuotesCard'
import MyModelsCard from '@/components/dashboard/MyModelsCard'
import CreateModelDrawer from '@/components/dashboard/CreateModelDrawer'
import { DashboardStats, StaleModel } from '@/components/dashboard/types'

/**
 * Dashboard 主页面（组合层）
 * 负责数据获取、状态编排和布局组合，业务 UI 委托给子组件。
 */
const Dashboard: React.FC = () => {
  const navigate = useNavigate()

  const [stats, setStats] = useState<DashboardStats>({
    stockCount: 0, modelCount: 0, taskCount: 0, backtestCount: 0, completedTaskCount: 0,
  })
  const [recentModels, setRecentModels] = useState<UserModel[]>([])
  const [recentTasks, setRecentTasks] = useState<TrainingTask[]>([])
  const [staleModels, setStaleModels] = useState<StaleModel[]>([])
  const [syncing, setSyncing] = useState(false)
  const [onboardingVisible, setOnboardingVisible] = useState(false)
  const [myPredictions, setMyPredictions] = useState<PredictionShareItem[]>([])
  const [loading, setLoading] = useState(true)
  const [communityModels, setCommunityModels] = useState<any[]>([])
  const [backtestResults, setBacktestResults] = useState<any[]>([])
  const [quickStockCode, setQuickStockCode] = useState('')
  const [createDrawerVisible, setCreateDrawerVisible] = useState(false)
  const [predictionAccuracy, setPredictionAccuracy] = useState<any>(null)
  const [dailyReport, setDailyReport] = useState<any>(null)

  const onboardingTasks = useMemo(() => {
    const hasStockData = stats.stockCount > 0
    const hasModel = stats.modelCount > 0
    const hasTrainingTask = stats.taskCount > 0
    const hasCompletedTask = stats.completedTaskCount > 0
    const hasPrediction = myPredictions.length > 0
    const hasBacktest = stats.backtestCount > 0 || backtestResults.length > 0

    return [
      { key: 'data', title: '查看示例股票数据', done: hasStockData, action: '去数据管理', path: '/data' },
      { key: 'model', title: '创建或打开第一个模型', done: hasModel, action: hasModel ? '查看模型' : '创建模型', path: hasModel ? '/models' : '/models/build' },
      { key: 'train', title: '完成一次模型训练', done: hasCompletedTask, action: hasTrainingTask ? '查看训练' : '开始训练', path: hasModel ? '/train-predict' : '/models/build' },
      { key: 'predict', title: '执行一次预测', done: hasPrediction, action: '去预测', path: '/train-predict?tab=predict' },
      { key: 'backtest', title: '完成一次回测', done: hasBacktest, action: '去回测', path: '/train-predict?tab=backtest' },
    ]
  }, [stats, myPredictions.length, backtestResults.length])

  const nextOnboardingTask = useMemo(
    () => onboardingTasks.find(task => !task.done),
    [onboardingTasks],
  )

  const onboardingProgress = useMemo(
    () => Math.round((onboardingTasks.filter(task => task.done).length / onboardingTasks.length) * 100),
    [onboardingTasks],
  )

  /* 从运行中的任务 id 列表推导 SSE 连接 */
  const runningTaskIds = useMemo(
    () => recentTasks.filter(t => t.status === 'running').map(t => t.id),
    [recentTasks],
  )
  const { progressMap } = useSSEProgress(runningTaskIds, fetchDashboardData)

  /* 已完成的训练任务（供预测弹窗使用） */
  const completedTasks = useMemo(
    () => recentTasks.filter(t => t.status === 'completed'),
    [recentTasks],
  )

  /* ======================== 数据获取 ======================== */

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await Promise.all([
        fetchDashboardData(),
        fetchMyPredictions(),
        fetchCommunityModels(),
        fetchBacktestResults(),
      ])
      // 预测准确率和日报独立获取，不阻塞主页面加载
      fetchPredictionAccuracy()
      fetchDailyReport()
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!isOnboardingCompleted() && stats.modelCount === 0 && stats.stockCount >= 0) {
      const timer = setTimeout(() => setOnboardingVisible(true), 800)
      return () => clearTimeout(timer)
    }
  }, [stats.modelCount, stats.stockCount])

  async function fetchDashboardData() {
    const results = await Promise.allSettled([
      dataApi.getStocks(),
      modelApi.getModels(),
      trainingApi.getTasks(),
      backtestApi.getResults(),
    ])
    const [stocksRes, modelsRes, tasksRes, backtestsRes] = results.map(r =>
      r.status === 'fulfilled' ? r.value : null,
    )
    const stocksData = (stocksRes as any)?.items || (Array.isArray(stocksRes) ? stocksRes : [])
    const modelsData = (modelsRes as any)?.items || (Array.isArray(modelsRes) ? modelsRes : [])
    const tasksData = (tasksRes as any)?.items || (Array.isArray(tasksRes) ? tasksRes : [])
    const backtestsData = (backtestsRes as any)?.items || (Array.isArray(backtestsRes) ? backtestsRes : [])

    setStats({
      stockCount: stocksData.length || 0,
      modelCount: modelsData.length || 0,
      taskCount: tasksData.length || 0,
      backtestCount: backtestsData.length || 0,
      completedTaskCount: (tasksData || []).filter((t: TrainingTask) => t.status === 'completed').length,
    })
    setRecentModels(modelsData.slice(0, 6))
    setRecentTasks(tasksData.slice(0, 6))

    try {
      const staleRes: any = await dataApi.checkStaleData()
      setStaleModels(staleRes.stale_models || [])
    } catch { /* 忽略过期检查失败 */ }
  }

  async function fetchMyPredictions() {
    try {
      const res: any = await predictionApi.getMyPredictions()
      let items: any[] = []
      if (Array.isArray(res)) items = res
      else if (res?.items && Array.isArray(res.items)) items = res.items
      else if (res?.data && Array.isArray(res.data)) items = res.data
      setMyPredictions(items)
    } catch {
      setMyPredictions([])
    }
  }

  async function fetchCommunityModels() {
    try {
      const res: any = await communityApi.getModels({ page_size: 20 })
      const items = res?.items || (Array.isArray(res) ? res : [])
      setCommunityModels(Array.isArray(items) ? items : [])
    } catch { /* 社区模型加载失败不影响主流程 */ }
  }

  async function fetchBacktestResults() {
    try {
      const res: any = await backtestApi.getResults({ page_size: 5 })
      const items = res?.items || (Array.isArray(res) ? res : [])
      setBacktestResults(Array.isArray(items) ? items : [])
    } catch { /* 回测结果加载失败不影响主流程 */ }
  }

  async function fetchPredictionAccuracy() {
    try {
      const res: any = await predictionApi.getAccuracy(30)
      setPredictionAccuracy(res)
    } catch { /* 准确率加载失败不影响主流程 */ }
  }

  async function fetchDailyReport() {
    try {
      const data = await predictionApi.getDailyReport()
      setDailyReport(data)
    } catch { /* 日报加载失败不影响主流程 */ }
  }

  /* ======================== 事件处理 ======================== */

  const handleBatchSync = async () => {
    setSyncing(true)
    try {
      const res: any = await dataApi.batchSync()
      message.success(`同步完成: ${res.synced_count} 只成功, ${res.failed_count} 只失败`)
      setStaleModels([])
      fetchDashboardData()
    } catch {
      message.error('批量同步失败')
    } finally {
      setSyncing(false)
    }
  }

  const handleTrainModel = async (modelId: number) => {
    try {
      await trainingApi.createTask({ model_id: modelId })
      message.success('训练任务已创建')
      fetchDashboardData()
    } catch {
      message.error('创建训练任务失败')
    }
  }

  /* ======================== Loading 骨架屏 ======================== */

  if (loading) {
    return (
      <div>
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          {[1, 2, 3, 4].map(i => (
            <Col xs={24} sm={12} lg={6} key={i}>
              <Card size="small"><Skeleton active paragraph={{ rows: 1 }} /></Card>
            </Col>
          ))}
        </Row>
        <Card style={{ marginBottom: 20 }} size="small">
          <Skeleton active paragraph={{ rows: 2 }} />
        </Card>
        <Card style={{ marginBottom: 20 }} size="small">
          <Skeleton active paragraph={{ rows: 4 }} />
        </Card>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card size="small"><Skeleton active paragraph={{ rows: 3 }} /></Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card size="small"><Skeleton active paragraph={{ rows: 3 }} /></Card>
          </Col>
        </Row>
      </div>
    )
  }

  /* ======================== 主布局 ======================== */

  return (
    <div>
      {/* 标题区 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <MascotBull mood="chill" size="small" />
          <h1 className="page-title" style={{ marginBottom: 0 }}>我的工作台</h1>
        </div>
        <Button type="link" icon={<QuestionCircleOutlined />} onClick={() => setOnboardingVisible(true)}>
          新手引导
        </Button>
      </div>
      <p className="page-description" style={{ marginBottom: 16 }}>
        管理你的模型、查看预测结果、追踪训练进度
      </p>

      {/* 数据过期警告 */}
      {staleModels.length > 0 && (
        <Alert
          style={{ marginBottom: 12 }}
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message={`有 ${staleModels.length} 个模型的数据已过期，建议更新后重新训练`}
          description={
            <div>
              {staleModels.map(m => (
                <div key={m.model_id} style={{ marginBottom: 4 }}>
                  <Tag color="orange">{m.model_name}</Tag>
                  <Tag>{m.model_type.toUpperCase()}</Tag>
                  <span style={{ color: '#999', fontSize: 12 }}>{m.new_data_count} 只股票有新数据</span>
                </div>
              ))}
              <Button
                type="primary"
                size="small"
                icon={<SyncOutlined spin={syncing} />}
                loading={syncing}
                onClick={handleBatchSync}
                style={{ marginTop: 8 }}
              >
                一键更新所有数据
              </Button>
            </div>
          }
        />
      )}

      {/* 新手任务清单：把功能导航转成完整体验闭环 */}
      {onboardingProgress < 100 && (
        <Card
          size="small"
          style={{ marginBottom: 16 }}
          title={
            <Space>
              <MascotBull mood="happy" size="small" />
              <span>新手上手任务</span>
              <Tag color="blue">{onboardingProgress}%</Tag>
            </Space>
          }
          extra={nextOnboardingTask && (
            <Button type="primary" size="small" onClick={() => navigate(nextOnboardingTask.path)}>
              下一步：{nextOnboardingTask.action}
            </Button>
          )}
        >
          <Row gutter={[8, 8]}>
            {onboardingTasks.map(task => (
              <Col xs={24} sm={12} lg={8} xl={4} key={task.key}>
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: task.done ? 'rgba(82, 196, 26, 0.08)' : 'rgba(250, 173, 20, 0.08)',
                    border: `1px solid ${task.done ? '#b7eb8f' : '#ffe58f'}`,
                    minHeight: 56,
                  }}
                >
                  <Space size={6} align="start">
                    {task.done ? <CheckCircleOutlined style={{ color: '#52c41a', marginTop: 3 }} /> : <ClockCircleOutlined style={{ color: '#faad14', marginTop: 3 }} />}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{task.title}</div>
                      {!task.done && (
                        <Button type="link" size="small" style={{ padding: 0, height: 20 }} onClick={() => navigate(task.path)}>
                          {task.action}
                        </Button>
                      )}
                    </div>
                  </Space>
                </div>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* 统计卡片 */}
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small" bodyStyle={{ padding: '8px 12px' }} hoverable onClick={() => navigate('/data')}>
            <Statistic title="股票数据" value={stats.stockCount} prefix={<DatabaseOutlined />} valueStyle={{ color: '#1890ff', fontSize: 20 }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bodyStyle={{ padding: '8px 12px' }} hoverable onClick={() => navigate('/models')}>
            <Statistic title="我的模型" value={stats.modelCount} prefix={<RobotOutlined />} valueStyle={{ color: '#52c41a', fontSize: 20 }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bodyStyle={{ padding: '8px 12px' }} hoverable onClick={() => navigate('/train-predict')}>
            <Statistic title="训练任务" value={stats.taskCount} prefix={<PlayCircleOutlined />} valueStyle={{ color: '#faad14', fontSize: 20 }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" bodyStyle={{ padding: '8px 12px' }} hoverable onClick={() => navigate('/train-predict')}>
            <Statistic title="可预测模型" value={stats.completedTaskCount} prefix={<ThunderboltOutlined />} valueStyle={{ color: '#722ed1', fontSize: 20 }} />
          </Card>
        </Col>
      </Row>

      {/* 预测准确率卡片 */}
      {predictionAccuracy && predictionAccuracy.verified > 0 && (
        <Card
          style={{ marginTop: 16 }}
          title="我的预测准确率（近30天）"
          extra={<Button type="link" onClick={() => navigate('/train-predict')}>查看详情</Button>}
        >
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="已验证预测"
                value={predictionAccuracy.verified}
                suffix="条"
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="方向正确"
                value={predictionAccuracy.correct}
                valueStyle={{ color: predictionAccuracy.accuracy >= 0.5 ? '#3f8600' : '#cf1322' }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="准确率"
                value={predictionAccuracy.accuracy * 100}
                precision={1}
                suffix="%"
                valueStyle={{ color: predictionAccuracy.accuracy >= 0.5 ? '#3f8600' : '#cf1322' }}
              />
            </Col>
            <Col span={6}>
              <div style={{ textAlign: 'center' }}>
                <MascotBull mood={predictionAccuracy.accuracy >= 0.6 ? 'happy' : predictionAccuracy.accuracy >= 0.4 ? 'thinking' : 'sad'} size="small" />
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  {predictionAccuracy.accuracy >= 0.6 ? '牛牛很满意！' : predictionAccuracy.accuracy >= 0.4 ? '继续加油！' : '需要优化策略'}
                </div>
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {/* 每日必看：预测验证日报 */}
      {dailyReport && (dailyReport.yesterday.verified > 0 || dailyReport.today.total > 0) && (
        <Card
          style={{ marginTop: 16 }}
          title="每日必看"
          extra={<Typography.Text type="secondary">{dayjs().format('YYYY年MM月DD日')}</Typography.Text>}
        >
          <Row gutter={24}>
            {/* 牛牛心情 */}
            <Col span={6} style={{ textAlign: 'center' }}>
              <MascotBull mood={dailyReport.bull.mood} size="small" />
              <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                {dailyReport.bull.comment}
              </div>
            </Col>

            {/* 昨日验证 */}
            <Col span={9}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>昨日预测验证</div>
              {dailyReport.yesterday.verified > 0 ? (
                <>
                  <Statistic
                    title="准确率"
                    value={dailyReport.yesterday.accuracy * 100}
                    precision={1}
                    suffix="%"
                    valueStyle={{ color: dailyReport.yesterday.accuracy >= 0.5 ? '#3f8600' : '#cf1322', fontSize: 20 }}
                  />
                  <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                    {dailyReport.yesterday.correct}/{dailyReport.yesterday.verified} 条方向正确
                  </div>
                </>
              ) : (
                <Typography.Text type="secondary">暂无已验证预测</Typography.Text>
              )}
            </Col>

            {/* 今日预测 */}
            <Col span={9}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>今日预测</div>
              {dailyReport.today.total > 0 ? (
                <Space direction="vertical" size={4}>
                  <Typography.Text>📈 看涨: {dailyReport.today.up_count}只</Typography.Text>
                  <Typography.Text>📉 看跌: {dailyReport.today.down_count}只</Typography.Text>
                  <Typography.Text>➡️ 震荡: {dailyReport.today.flat_count}只</Typography.Text>
                </Space>
              ) : (
                <Typography.Text type="secondary">今日还没有预测，去试试吧！</Typography.Text>
              )}
            </Col>
          </Row>
        </Card>
      )}

      {/* 左右分栏主体 */}
      <Row gutter={[16, 16]}>
        {/* 左栏 60% */}
        <Col xs={24} lg={14}>
          <QuickPredictCard
            communityModels={communityModels}
            stockCode={quickStockCode}
            onStockCodeChange={setQuickStockCode}
            onPredictComplete={fetchMyPredictions}
          />
          <PredictionResultsCard
            predictions={myPredictions}
            completedTasks={completedTasks}
            recentModels={recentModels}
            onRefreshPredictions={fetchMyPredictions}
          />
          <WatchlistQuotesCard onSelectStockCode={setQuickStockCode} />
        </Col>

        {/* 右栏 40% */}
        <Col xs={24} lg={10}>
          <MyModelsCard
            models={recentModels}
            tasks={recentTasks}
            progressMap={progressMap}
            backtestResults={backtestResults}
            onTrain={handleTrainModel}
            onCreateModel={() => setCreateDrawerVisible(true)}
            onRefresh={fetchDashboardData}
          />
        </Col>
      </Row>

      {/* 创建模型抽屉 */}
      <CreateModelDrawer
        visible={createDrawerVisible}
        onClose={() => setCreateDrawerVisible(false)}
        onCreate={fetchDashboardData}
      />

      <OnboardingGuide
        open={onboardingVisible}
        onClose={() => setOnboardingVisible(false)}
      />
    </div>
  )
}

export default Dashboard
