import { useState, useCallback, useEffect } from 'react'
import { watchlistApi, dataApi } from '@/services/api'
import { WatchlistQuote } from '@/components/dashboard/types'

/**
 * 自选股行情获取 Hook
 * 自动拉取自选股列表及实时行情，提供 refetch 方法供外部刷新。
 */
export default function useWatchlistQuotes() {
  const [quotes, setQuotes] = useState<WatchlistQuote[]>([])
  const [loading, setLoading] = useState(false)
  const [watchlistId, setWatchlistId] = useState<number | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const data: unknown = await watchlistApi.getWatchlists()
      const resp = data as Record<string, unknown> | unknown[]
      const lists = Array.isArray(resp)
        ? resp
        : (resp as Record<string, unknown>)?.items
          ? (resp as Record<string, unknown>).items as unknown[]
          : []

      if (lists.length === 0) { setQuotes([]); return }

      const firstList = lists[0] as Record<string, unknown>
      setWatchlistId((firstList.id as number) || null)

      /* 从所有自选列表中收集股票 */
      const allItems: Record<string, unknown>[] = []
      for (const list of lists) {
        const item = list as Record<string, unknown>
        const items = (item.items || item.stocks || []) as Record<string, unknown>[]
        allItems.push(...items)
      }
      if (allItems.length === 0) { setQuotes([]); return }

      /* 优先使用批量接口获取行情 */
      const codes = allItems.slice(0, 50).map(item => item.stock_code as string)
      try {
        const quoteData = (await dataApi.getRealtimeQuotes(codes)) as unknown as Record<string, unknown>
        const quotesMap: Record<string, Record<string, unknown>> = {}
        for (const q of ((quoteData?.quotes || []) as Record<string, unknown>[])) {
          const key = (q.code || q.stock_code) as string
          quotesMap[key] = q
        }
        const results: WatchlistQuote[] = allItems.slice(0, 50).map(item => {
          const q = quotesMap[item.stock_code as string]
          return {
            code: item.stock_code as string,
            name: (item.stock_name || item.stock_code) as string,
            price: (q?.price || q?.close || null) as number | null,
            change_pct: (q?.change_pct || q?.change_percent || null) as number | null,
            open: (q?.open ?? undefined) as number | undefined,
            high: (q?.high ?? undefined) as number | undefined,
            low: (q?.low ?? undefined) as number | undefined,
          }
        })
        setQuotes(results)
      } catch {
        /* 批量接口失败，回退到逐个获取 */
        const fallbackResults: WatchlistQuote[] = []
        for (const item of allItems.slice(0, 10)) {
          try {
            const q = (await dataApi.getRealtimeQuote(item.stock_code as string)) as unknown as Record<string, unknown>
            fallbackResults.push({
              code: item.stock_code as string,
              name: (item.stock_name || item.stock_code) as string,
              price: (q?.price || q?.close || null) as number | null,
              change_pct: (q?.change_pct || q?.change_percent || null) as number | null,
            })
          } catch {
            fallbackResults.push({
              code: item.stock_code as string,
              name: (item.stock_name || item.stock_code) as string,
              price: null,
              change_pct: null,
            })
          }
        }
        setQuotes(fallbackResults)
      }
    } catch {
      setQuotes([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { quotes, setQuotes, loading, watchlistId, refetch: fetch }
}
