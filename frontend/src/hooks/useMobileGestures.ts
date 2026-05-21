import { useRef, useCallback } from 'react'

/**
 * 移动端手势操作 Hook
 *
 * 支持三种手势：
 * - 左滑（onSwipeLeft）：水平向左滑动超过阈值
 * - 右滑（onSwipeRight）：水平向右滑动超过阈值
 * - 下拉（onPullDown）：从页面顶部向下拉动
 *
 * 判定规则：
 * - 水平位移 > 60px 且水平位移 > 1.5×垂直位移 → 判定为左右滑动
 * - 起始点在顶部 80px 内且下拉 > 60px → 判定为下拉刷新
 */

interface GestureHandlers {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onPullDown?: () => void
}

export function useMobileGestures(handlers: GestureHandlers) {
  const startX = useRef(0)
  const startY = useRef(0)
  const pulling = useRef(false)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    pulling.current = false
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - startY.current
    // 仅在页面顶部区域启动下拉判定
    if (startY.current < 80 && dy > 30) {
      pulling.current = true
    }
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.current
      const dy = e.changedTouches[0].clientY - startY.current

      // 下拉刷新优先判定
      if (pulling.current && dy > 60) {
        handlers.onPullDown?.()
        return
      }

      // 水平滑动判定：位移 > 60px 且水平位移显著大于垂直位移
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx > 0) handlers.onSwipeRight?.()
        else handlers.onSwipeLeft?.()
      }
    },
    [handlers]
  )

  return { onTouchStart, onTouchMove, onTouchEnd }
}
