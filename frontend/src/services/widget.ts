import { registerPlugin } from '@capacitor/core'

interface WidgetPlugin {
  updatePrediction(options: {
    stock: string
    direction: string
    confidence: string
    label: string
  }): Promise<{ success: boolean }>
}

const Widget = registerPlugin<WidgetPlugin>('Widget')

/**
 * 更新桌面小卡片显示的预测数据。
 * 仅在 Capacitor 原生环境下执行，Web 端自动跳过。
 *
 * @param stock    股票名称/代码，如 "贵州茅台 600519"
 * @param direction 方向图标：📈 看涨 / 📉 看跌 / ➡️ 震荡
 * @param confidence 置信度，0~1 的浮点数，函数内部转为百分比字符串
 * @param label    预测标签，如 "看涨 · 高置信度"
 */
export const updateWidgetPrediction = async (
  stock: string,
  direction: string,
  confidence: number,
  label: string
) => {
  try {
    if ((window as any).Capacitor) {
      await Widget.updatePrediction({
        stock,
        direction,
        confidence: `${Math.round(confidence * 100)}%`,
        label,
      })
    }
  } catch {
    // 原生插件不可用时静默降级，不影响主流程
  }
}
