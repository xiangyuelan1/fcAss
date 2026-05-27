import React, { useState, useEffect, useMemo } from 'react'
import { AutoComplete } from 'antd'
import { StarOutlined, SearchOutlined } from '@ant-design/icons'
import { watchlistApi, dataApi } from '@/services/api'

interface StockItem {
  code: string
  name: string
  isWatchlist: boolean
}

interface StockCodeInputProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  style?: React.CSSProperties
  size?: 'small' | 'middle' | 'large'
}

const StockCodeInput: React.FC<StockCodeInputProps> = ({
  value,
  onChange,
  placeholder,
  style,
  size,
}) => {
  const [options, setOptions] = useState<any[]>([])
  const [watchlistStocks, setWatchlistStocks] = useState<StockItem[]>([])
  const [poolStocks, setPoolStocks] = useState<StockItem[]>([])
  const [loaded, setLoaded] = useState(false)

  // 合并去重后的完整股票列表（自选股优先，同代码时保留自选股版本）
  const allStocks = useMemo<StockItem[]>(() => {
    const seen = new Set<string>()
    const result: StockItem[] = []
    for (const s of watchlistStocks) {
      if (!seen.has(s.code)) {
        seen.add(s.code)
        result.push(s)
      }
    }
    for (const s of poolStocks) {
      if (!seen.has(s.code)) {
        seen.add(s.code)
        result.push(s)
      }
    }
    return result
  }, [watchlistStocks, poolStocks])

  useEffect(() => {
    loadStocks()
  }, [])

  const loadStocks = async () => {
    try {
      const [wlResult, poolResult] = await Promise.allSettled([
        loadWatchlistStocks(),
        dataApi.getStockPool({ page_size: 200 }),
      ])

      if (wlResult.status === 'fulfilled') {
        setWatchlistStocks(wlResult.value)
      }

      if (poolResult.status === 'fulfilled') {
        const res: any = poolResult.value
        const items = res?.stocks || (Array.isArray(res) ? res : [])
        setPoolStocks(
          items.map((s: any) => ({
            code: s.code || s.stock_code,
            name: s.name || s.stock_name || '',
            isWatchlist: false,
          }))
        )
      }
    } finally {
      setLoaded(true)
    }
  }

  // 获取所有自选股列表中的股票（并行请求每个列表的股票详情）
  const loadWatchlistStocks = async (): Promise<StockItem[]> => {
    const res: any = await watchlistApi.getWatchlists()
    const lists = Array.isArray(res) ? res : res?.items || []
    if (lists.length === 0) return []

    const stockResults = await Promise.allSettled(
      lists.map((wl: any) => watchlistApi.getStocks(wl.id))
    )

    const allItems: StockItem[] = []
    const seen = new Set<string>()
    for (const result of stockResults) {
      if (result.status !== 'fulfilled') continue
      const data: any = result.value
      const stocks = Array.isArray(data) ? data : data?.items || []
      for (const s of stocks) {
        const code = s.stock_code || s.code || ''
        if (!code || seen.has(code)) continue
        seen.add(code)
        allItems.push({
          code,
          name: s.stock_name || s.name || '',
          isWatchlist: true,
        })
      }
    }
    return allItems
  }

  // 将股票列表渲染为 AutoComplete 选项
  const buildOptions = (stocks: StockItem[]): any[] =>
    stocks.map((s) => ({
      value: s.code,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            {s.isWatchlist && (
              <StarOutlined style={{ color: '#faad14', fontSize: 10, marginRight: 4 }} />
            )}
            <span style={{ fontWeight: 500 }}>{s.code}</span>
            <span style={{ color: '#999', marginLeft: 8 }}>{s.name}</span>
          </span>
          {s.isWatchlist && (
            <span style={{ fontSize: 11, color: '#faad14' }}>自选</span>
          )}
        </div>
      ),
    }))

  const handleSearch = (searchText: string) => {
    if (!searchText) {
      // 空搜索时优先展示自选股
      setOptions(buildOptions(watchlistStocks))
      return
    }

    const q = searchText.toLowerCase()
    const matched = allStocks
      .filter(
        (s) =>
          s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
      )
      .slice(0, 20)

    setOptions(buildOptions(matched))
  }

  const handleFocus = () => {
    if (!loaded) return
    if (!value) {
      handleSearch('')
    }
  }

  return (
    <AutoComplete
      value={value}
      options={options}
      onSearch={handleSearch}
      onFocus={handleFocus}
      onSelect={(val) => onChange?.(val)}
      onChange={(val) => onChange?.(val)}
      placeholder={placeholder || '输入股票代码或名称'}
      style={style || { width: '100%' }}
      size={size || 'middle'}
      suffixIcon={<SearchOutlined style={{ color: '#999' }} />}
    />
  )
}

export default StockCodeInput
