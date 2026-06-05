import { useState, useEffect, useRef, useCallback } from 'react'
import { ProgressData } from '@/components/dashboard/types'

/**
 * SSE 训练进度 Hook
 * 为运行中的训练任务建立 EventSource 连接，实时推送进度数据。
 * 任务完成或失败时自动关闭连接，并通过 onTaskComplete 回调通知外部刷新。
 */
export default function useSSEProgress(
  runningTaskIds: number[],
  onTaskComplete?: () => void,
) {
  const [progressMap, setProgressMap] = useState<Record<number, ProgressData>>({})
  const sseRefs = useRef<Record<number, EventSource>>({})
  /* 用 ref 持有回调，避免 useEffect 因回调引用变化而重建连接 */
  const onTaskCompleteRef = useRef(onTaskComplete)
  onTaskCompleteRef.current = onTaskComplete

  const connectSSE = useCallback((taskId: number) => {
    if (sseRefs.current[taskId]) return
    const token = localStorage.getItem('token')
    const baseUrl = (window as unknown as Record<string, unknown>).__API_BASE_URL__ || ''
    const url = `${baseUrl}/api/training/tasks/${taskId}/progress-stream?token=${token || ''}`
    const es = new EventSource(url)
    sseRefs.current[taskId] = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ProgressData
        setProgressMap(prev => ({ ...prev, [taskId]: data }))
        if (data.status === 'completed' || data.status === 'failed') {
          es.close()
          delete sseRefs.current[taskId]
          onTaskCompleteRef.current?.()
        }
      } catch {
        /* 忽略解析失败的 SSE 消息 */
      }
    }

    es.onerror = () => {
      es.close()
      delete sseRefs.current[taskId]
    }
  }, [])

  useEffect(() => {
    for (const id of runningTaskIds) {
      if (!sseRefs.current[id]) connectSSE(id)
    }
    return () => {
      Object.values(sseRefs.current).forEach(es => es.close())
      sseRefs.current = {}
    }
  }, [runningTaskIds, connectSSE])

  return { progressMap }
}
