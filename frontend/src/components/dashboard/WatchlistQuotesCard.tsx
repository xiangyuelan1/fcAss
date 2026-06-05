import React, { useState, useCallback } from 'react'
import { Card, Button, Table, Tag, Modal, Input, Spin, message } from 'antd'
import { PlusOutlined, LineChartOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { watchlistApi } from '@/services/api'
import useWatchlistQuotes from '@/hooks/useWatchlistQuotes'
import useMarketWs from '@/hooks/useMarketWs'
import { WatchlistQuotesCardProps, WatchlistQuote } from './types'

/**
 * 自选股行情卡片
 * 使用 useWatchlistQuotes 获取行情，useMarketWs 接收实时推送，
 * 内部管理"添加自选股"弹窗。
 */
const WatchlistQuotesCard: React.FC<WatchlistQuotesCardProps> = ({
  onSelectStockCode,
}) => {
  const navigate = useNavigate()
  const { quotes, setQuotes, loading, watchlistId, refetch } = useWatchlistQuotes()

  /* WebSocket 实时行情：收到推送后按 code 合并更新自选股列表 */
  const handleMarketQuotes = useCallback((wsQuotes: { code: string; close: number; change_pct: number; volume: number }[]) => {
    setQuotes(prev => {
      const quoteMap: Record<string, typeof wsQuotes[number]> = {}
      for (const q of wsQuotes) {
        quoteMap[q.code] = q
      }
      return prev.map(item => {
        const q = quoteMap[item.code]
        if (q) {
          return {
            ...item,
            price: q.close || item.price,
            change_pct: q.change_pct ?? item.change_pct,
            volume: q.volume ?? item.volume,
          }
        }
        return item
      })
    })
  }, [setQuotes])

  useMarketWs(handleMarketQuotes)

  /* 添加自选股弹窗状态 */
  const [addVisible, setAddVisible] = useState(false)
  const [addCode, setAddCode] = useState('')
  const [addName, setAddName] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  const handleAddWatchlist = async () => {
    if (!addCode.trim()) { message.warning('请输入股票代码'); return }
    if (!watchlistId) { message.warning('未找到自选列表'); return }
    setAddLoading(true)
    try {
      await watchlistApi.addStock(watchlistId, {
        stock_code: addCode.trim(),
        stock_name: addName.trim() || addCode.trim(),
      })
      message.success('添加成功')
      setAddVisible(false)
      setAddCode('')
      setAddName('')
      refetch()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } }; message?: string })
        ?.response?.data?.detail
        || (err as Error)?.message
      message.error(detail || '添加失败')
    } finally {
      setAddLoading(false)
    }
  }

  const columns = [
    {
      title: '股票',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      render: (name: string, record: WatchlistQuote) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
          <div style={{ color: '#999', fontSize: 11 }}>{record.code}</div>
        </div>
      ),
    },
    {
      title: '最新价',
      dataIndex: 'price',
      key: 'price',
      width: 90,
      align: 'right' as const,
      render: (price: number, record: WatchlistQuote) => {
        if (price == null) return <span style={{ color: '#999', fontSize: 12 }}>--</span>
        const color = record.change_pct != null && record.change_pct > 0
          ? '#f5222d'
          : record.change_pct != null && record.change_pct < 0
            ? '#52c41a'
            : '#333'
        return <span style={{ fontWeight: 700, color, fontSize: 14 }}>¥{price.toFixed(2)}</span>
      },
    },
    {
      title: '涨跌幅',
      dataIndex: 'change_pct',
      key: 'change_pct',
      width: 80,
      align: 'right' as const,
      render: (pct: number) => {
        if (pct == null) return <span style={{ color: '#999', fontSize: 12 }}>--</span>
        const color = pct > 0 ? '#f5222d' : pct < 0 ? '#52c41a' : '#999'
        return <span style={{ color, fontSize: 13 }}>{pct > 0 ? '+' : ''}{pct.toFixed(2)}%</span>
      },
    },
    {
      title: '',
      key: 'action',
      width: 50,
      align: 'center' as const,
      render: (_: unknown, record: WatchlistQuote) => (
        <Button
          type="link"
          size="small"
          icon={<ThunderboltOutlined />}
          style={{ padding: '0 4px', fontSize: 12 }}
          onClick={() => {
            onSelectStockCode(record.code)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        >
          预测
        </Button>
      ),
    },
  ]

  return (
    <>
      <Card
        title={
          <span>📋 自选股行情 <Tag color="green" style={{ fontSize: 10, marginLeft: 4 }}>实时</Tag></span>
        }
        size="small"
        style={{ marginBottom: 16 }}
        extra={
          <Button type="link" size="small" onClick={() => navigate('/watchlist')}>
            管理自选
          </Button>
        }
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <Spin tip="加载行情中..." />
          </div>
        ) : quotes.length > 0 ? (
          <>
            <Table
              dataSource={quotes}
              rowKey="code"
              size="small"
              pagination={false}
              showHeader={true}
              columns={columns}
            />
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                size="small"
                onClick={() => setAddVisible(true)}
              >
                添加自选股
              </Button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#999', fontSize: 13 }}>
            <LineChartOutlined style={{ fontSize: 24, marginBottom: 4, display: 'block' }} />
            暂无自选股
            <div style={{ marginTop: 8 }}>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                size="small"
                onClick={() => setAddVisible(true)}
              >
                添加自选股
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 弹窗：添加自选股 */}
      <Modal
        title="添加自选股"
        open={addVisible}
        onCancel={() => { setAddVisible(false); setAddCode(''); setAddName('') }}
        onOk={handleAddWatchlist}
        okText="添加"
        confirmLoading={addLoading}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>股票代码</div>
          <Input placeholder="如 000001" value={addCode} onChange={e => setAddCode(e.target.value)} />
        </div>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>股票名称（可选）</div>
          <Input placeholder="如 平安银行" value={addName} onChange={e => setAddName(e.target.value)} />
        </div>
      </Modal>
    </>
  )
}

export default WatchlistQuotesCard
