import { useEffect, useRef, useCallback } from 'react'

export interface MarketQuote {
  code: string
  close: number
  change_pct: number
  volume: number
}

/**
 * WebSocket 行情推送 Hook
 * 连接后端 /ws/market 端点，接收实时行情数据并通过回调通知消费方。
 * 内置自动重连机制（断线后 5 秒重试），组件卸载时自动清理连接与定时器。
 */
const useMarketWs = (onQuotes: (quotes: MarketQuote[]) => void) => {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/ws/market`

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'market' && Array.isArray(data.data)) {
            onQuotes(data.data)
          }
        } catch {
          console.warn('[useMarketWs] 解析行情消息失败:', event.data)
        }
      }

      ws.onclose = () => {
        reconnectTimer.current = setTimeout(() => connect(), 5000)
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      console.warn('[useMarketWs] WebSocket 连接创建失败，5 秒后重试')
      reconnectTimer.current = setTimeout(() => connect(), 5000)
    }
  }, [onQuotes])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [connect])
}

export default useMarketWs
