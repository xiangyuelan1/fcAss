import React, { useEffect, useState } from 'react'
import { Card, Button, Tag, Progress, Spin, message, Tooltip } from 'antd'
import { RiseOutlined, FallOutlined, QuestionCircleOutlined, ArrowRightOutlined, HistoryOutlined } from '@ant-design/icons'
import { dailyGuessApi } from '@/services/api'
import { useNavigate } from 'react-router-dom'

interface YesterdayResult {
  stock_code: string
  stock_name: string
  reference_close: number | null
  actual_close: number | null
  actual_change_pct: number | null
  actual_direction: 'up' | 'down' | null
  up_count: number
  down_count: number
  my_direction: 'up' | 'down' | null
  my_correct: boolean | null
}

interface TodayData {
  date: string
  stock_code: string
  stock_name: string
  reference_close: number | null
  actual_close: number | null
  actual_change_pct: number | null
  up_count: number
  down_count: number
  total_votes: number
  my_vote: 'up' | 'down' | null
  yesterday_result: YesterdayResult | null
}

interface DailyGuessProps {
  compact?: boolean
}

const DailyGuess: React.FC<DailyGuessProps> = ({ compact = false }) => {
  const navigate = useNavigate()
  const [data, setData] = useState<TodayData | null>(null)
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState(false)

  const fetchData = async () => {
    try {
      const res: any = await dailyGuessApi.getToday()
      setData(res)
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '获取每日一猜数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleVote = async (direction: 'up' | 'down') => {
    setVoting(true)
    try {
      const res: any = await dailyGuessApi.vote(direction)
      setData(prev => prev ? {
        ...prev,
        my_vote: direction,
        up_count: res.up_count,
        down_count: res.down_count,
        total_votes: res.total_votes,
      } : prev)
      message.success(direction === 'up' ? '🐂 看涨已提交！' : '🐻 看跌已提交！')
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '投票失败')
    } finally {
      setVoting(false)
    }
  }

  if (loading) {
    return (
      <Card style={{ textAlign: 'center', padding: 24 }}>
        <Spin tip="加载中..." />
      </Card>
    )
  }

  if (!data) return null

  const upPercent = data.total_votes > 0 ? Math.round((data.up_count / data.total_votes) * 100) : 50

  const renderYesterdayResult = () => {
    if (!data.yesterday_result) return null
    const yr = data.yesterday_result

    return (
      <div style={{
        marginTop: compact ? 12 : 16,
        padding: compact ? 8 : 12,
        background: '#fafafa',
        borderRadius: 8,
        border: '1px solid #f0f0f0',
      }}>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>
          📊 昨日结果
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{yr.stock_name}</span>
            <Tag style={{ marginLeft: 4, fontSize: 11 }}>{yr.stock_code}</Tag>
          </div>
          {yr.actual_direction && (
            <Tag color={yr.actual_direction === 'up' ? 'red' : 'green'} style={{ fontSize: 12 }}>
              {yr.actual_direction === 'up' ? '📈 上涨' : '📉 下跌'}
              {yr.actual_change_pct !== null && ` ${yr.actual_change_pct >= 0 ? '+' : ''}${yr.actual_change_pct.toFixed(2)}%`}
            </Tag>
          )}
        </div>
        {yr.my_direction && (
          <div style={{ marginTop: 6, fontSize: 12 }}>
            {yr.my_correct === true && (
              <span style={{ color: '#52c41a' }}>✅ 你猜对了！（你选了{yr.my_direction === 'up' ? '看涨' : '看跌'}）</span>
            )}
            {yr.my_correct === false && (
              <span style={{ color: '#ff4d4f' }}>❌ 猜错了（你选了{yr.my_direction === 'up' ? '看涨' : '看跌'}）</span>
            )}
            {yr.my_correct === null && (
              <span style={{ color: '#999' }}>⏳ 结果待揭晓</span>
            )}
          </div>
        )}
        {!yr.my_direction && (
          <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>昨日未参与</div>
        )}
      </div>
    )
  }

  const renderVoteButtons = () => {
    if (data.my_vote) {
      return (
        <div style={{ marginTop: compact ? 12 : 16 }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8, textAlign: 'center' }}>
            你选择了 <span style={{ fontWeight: 600, color: data.my_vote === 'up' ? '#cf1322' : '#389e0d' }}>
              {data.my_vote === 'up' ? '🐂 看涨' : '🐻 看跌'}
            </span>
          </div>
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: '#cf1322' }}>🐂 看涨 {data.up_count}票</span>
              <span style={{ color: '#389e0d' }}>🐻 看跌 {data.down_count}票</span>
            </div>
            <Progress
              percent={upPercent}
              showInfo={false}
              strokeColor="#cf1322"
              trailColor="#389e0d"
              size="small"
            />
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#999', marginTop: 4 }}>
            共 {data.total_votes} 人参与
          </div>
        </div>
      )
    }

    return (
      <div style={{ marginTop: compact ? 12 : 16 }}>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Button
            size={compact ? 'middle' : 'large'}
            style={{
              flex: 1,
              height: compact ? 48 : 56,
              fontSize: compact ? 15 : 18,
              fontWeight: 600,
              borderColor: '#cf1322',
              color: '#cf1322',
              background: '#fff1f0',
            }}
            icon={<RiseOutlined />}
            loading={voting}
            onClick={() => handleVote('up')}
          >
            🐂 看涨
          </Button>
          <Button
            size={compact ? 'middle' : 'large'}
            style={{
              flex: 1,
              height: compact ? 48 : 56,
              fontSize: compact ? 15 : 18,
              fontWeight: 600,
              borderColor: '#389e0d',
              color: '#389e0d',
              background: '#f6ffed',
            }}
            icon={<FallOutlined />}
            loading={voting}
            onClick={() => handleVote('down')}
          >
            🐻 看跌
          </Button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: '#999', marginTop: 8 }}>
          <Tooltip title="15:00前可投票，每人每天一次">
            <QuestionCircleOutlined style={{ marginRight: 4 }} />
          </Tooltip>
          截止时间 15:00 · {data.total_votes > 0 ? `已有 ${data.total_votes} 人参与` : '快来第一个投票！'}
        </div>
      </div>
    )
  }

  return (
    <Card
      title={
        <span>
          🎯 每日一猜
          <Tag color="gold" style={{ marginLeft: 8, fontSize: 11 }}>今日</Tag>
        </span>
      }
      extra={
        compact ? (
          <Button type="link" size="small" onClick={() => navigate('/community/daily-guess')}>
            <HistoryOutlined /> 历史 <ArrowRightOutlined />
          </Button>
        ) : undefined
      }
      style={{ height: '100%' }}
      styles={{ body: { paddingTop: 12 } }}
    >
      <div style={{ textAlign: 'center', marginBottom: compact ? 8 : 12 }}>
        <div style={{ fontSize: compact ? 18 : 22, fontWeight: 700 }}>{data.stock_name}</div>
        <Tag color="blue" style={{ marginTop: 4, fontSize: 12 }}>{data.stock_code}</Tag>
        {data.reference_close && (
          <div style={{ marginTop: 6, fontSize: 13, color: '#666' }}>
            前日收盘 <span style={{ fontWeight: 600, fontSize: 16, color: '#333' }}>
              ¥{data.reference_close.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {renderVoteButtons()}
      {renderYesterdayResult()}
    </Card>
  )
}

export default DailyGuess
