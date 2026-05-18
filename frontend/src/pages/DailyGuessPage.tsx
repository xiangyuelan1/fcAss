import React, { useEffect, useState } from 'react'
import { Card, Tag, Progress, Spin, Empty, Row, Col } from 'antd'
import { RiseOutlined, FallOutlined } from '@ant-design/icons'
import DailyGuess from '@/components/DailyGuess'
import { dailyGuessApi } from '@/services/api'

interface HistoryItem {
  date: string
  stock_code: string
  stock_name: string
  reference_close: number | null
  actual_close: number | null
  actual_change_pct: number | null
  actual_direction: 'up' | 'down' | null
  up_count: number
  down_count: number
  total_votes: number
  my_direction: 'up' | 'down' | null
  my_correct: boolean | null
}

const DailyGuessPage: React.FC = () => {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res: any = await dailyGuessApi.getHistory()
        setHistory(res.items || [])
      } catch {
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [])

  return (
    <div>
      <h1 className="page-title">🎯 每日一猜</h1>
      <p className="page-description" style={{ marginBottom: 20 }}>
        每天猜一只股票涨跌，15:00 前投票，盘后揭晓结果
      </p>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <DailyGuess />
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="📜 近期战绩"
            styles={{ body: { paddingTop: 12 } }}
          >
            {loading ? (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <Spin />
              </div>
            ) : history.length === 0 ? (
              <Empty description="暂无历史记录" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {history.map((item) => {
                  const upPct = item.total_votes > 0 ? Math.round((item.up_count / item.total_votes) * 100) : 50
                  return (
                    <div
                      key={item.date}
                      style={{
                        padding: 12,
                        background: '#fafafa',
                        borderRadius: 8,
                        border: '1px solid #f0f0f0',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div>
                          <span style={{ fontWeight: 600 }}>{item.stock_name}</span>
                          <Tag style={{ marginLeft: 4, fontSize: 11 }}>{item.stock_code}</Tag>
                          <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>{item.date}</span>
                        </div>
                        {item.actual_direction && (
                          <Tag color={item.actual_direction === 'up' ? 'red' : 'green'}>
                            {item.actual_direction === 'up' ? <RiseOutlined /> : <FallOutlined />}
                            {' '}{item.actual_direction === 'up' ? '涨' : '跌'}
                            {item.actual_change_pct !== null && ` ${item.actual_change_pct >= 0 ? '+' : ''}${item.actual_change_pct.toFixed(2)}%`}
                          </Tag>
                        )}
                        {!item.actual_direction && (
                          <Tag>⏳ 待揭晓</Tag>
                        )}
                      </div>
                      {item.reference_close && (
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                          参考价 ¥{item.reference_close.toFixed(2)}
                          {item.actual_close && ` → 收盘 ¥${item.actual_close.toFixed(2)}`}
                        </div>
                      )}
                      <div style={{ marginBottom: 2 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                          <span style={{ color: '#cf1322' }}>🐂 {item.up_count}</span>
                          <span style={{ color: '#389e0d' }}>🐻 {item.down_count}</span>
                        </div>
                        <Progress
                          percent={upPct}
                          showInfo={false}
                          strokeColor="#cf1322"
                          trailColor="#389e0d"
                          size="small"
                        />
                      </div>
                      {item.my_direction && (
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          你选了{item.my_direction === 'up' ? '🐂看涨' : '🐻看跌'}
                          {item.my_correct === true && <span style={{ color: '#52c41a', marginLeft: 6 }}>✅ 猜对</span>}
                          {item.my_correct === false && <span style={{ color: '#ff4d4f', marginLeft: 6 }}>❌ 猜错</span>}
                          {item.my_correct === null && <span style={{ color: '#999', marginLeft: 6 }}>⏳ 待揭晓</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default DailyGuessPage
