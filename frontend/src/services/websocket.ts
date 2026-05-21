/**
 * WebSocket服务 - 实时行情推送
 *
 * 封装WebSocket连接管理，支持自动重连和行情数据订阅。
 * 服务端通过 /ws/market 端点每30秒推送热门股票行情数据。
 */

type MarketDataHandler = (data: any[]) => void

class MarketWebSocket {
  private ws: WebSocket | null = null
  private handlers: MarketDataHandler[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  /** 建立WebSocket连接，已连接时跳过 */
  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/market`
    this.ws = new WebSocket(url)

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'market' && msg.data) {
          this.handlers.forEach(h => h(msg.data))
        }
      } catch {
        // 忽略非JSON消息
      }
    }

    this.ws.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(), 5000)
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  /** 断开连接并清除重连定时器 */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  /** 注册行情数据回调，返回取消订阅函数 */
  onMarketData(handler: MarketDataHandler): () => void {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler)
    }
  }
}

export const marketWs = new MarketWebSocket()
