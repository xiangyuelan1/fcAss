import React, { useEffect, useState, useRef } from 'react'

/* ================================================================
 *  类型定义
 * ================================================================ */

export interface PredictionResultProps {
  direction: 'up' | 'down' | 'flat'
  confidence: number
  stockName?: string
  stockCode?: string
  predictedPrice?: number | null
  predictedChangePct?: number | null
  priceRangeLow?: number | null
  priceRangeHigh?: number | null
  predictedVolatility?: number | null
  predictedVolumeChange?: number | null
  targetType?: string
}

interface PredictionAnimationProps {
  direction: 'up' | 'down' | 'flat'
  value: number
  label: string
}

export interface ConfidenceBarProps {
  confidence: number
}

/* ================================================================
 *  静态配置：方向 × 置信度 → 表情 / 文案 / 箭头
 * ================================================================ */

type ConfidenceLevel = 'high' | 'medium' | 'low'

interface ResultStyle {
  emoji: string
  text: string
  arrow: string
  color: string
  arrowSize: number
  animate: boolean
}

const RESULT_MAP: Record<string, Record<ConfidenceLevel, ResultStyle>> = {
  up: {
    high:   { emoji: '🚀', text: '牛牛看好！火箭发射！', arrow: '↑', color: '#52c41a', arrowSize: 48, animate: true },
    medium: { emoji: '🌞', text: '牛牛觉得有戏',        arrow: '↑', color: '#73d13d', arrowSize: 36, animate: false },
    low:    { emoji: '🤔', text: '牛牛也不太确定...',    arrow: '↗', color: '#95de64', arrowSize: 28, animate: false },
  },
  down: {
    high:   { emoji: '🐢', text: '牛牛建议谨慎',  arrow: '↓', color: '#f5222d', arrowSize: 48, animate: true },
    medium: { emoji: '🌧️', text: '牛牛有点担心', arrow: '↓', color: '#ff4d4f', arrowSize: 36, animate: false },
    low:    { emoji: '🤷', text: '牛牛也拿不准',  arrow: '↘', color: '#ff7875', arrowSize: 28, animate: false },
  },
}

const FLAT_STYLE: ResultStyle = {
  emoji: '😐', text: '牛牛觉得横盘', arrow: '→', color: '#faad14', arrowSize: 32, animate: false,
}

interface ConfidenceStyle {
  color: string
  label: string
}

const CONFIDENCE_MAP: { max: number; style: ConfidenceStyle }[] = [
  { max: 0.3, style: { color: '#d9d9d9', label: '牛牛懵了' } },
  { max: 0.5, style: { color: '#faad14', label: '牛牛在猜' } },
  { max: 0.7, style: { color: '#1890ff', label: '牛牛有感觉' } },
  { max: 0.9, style: { color: '#52c41a', label: '牛牛挺自信' } },
  { max: 1.01, style: { color: '#ffd700', label: '牛牛很确定！' } },
]

/* ================================================================
 *  工具函数
 * ================================================================ */

function getConfidenceLevel(c: number): ConfidenceLevel {
  if (c > 0.7) return 'high'
  if (c >= 0.5) return 'medium'
  return 'low'
}

function getResultStyle(direction: 'up' | 'down' | 'flat', confidence: number): ResultStyle {
  if (direction === 'flat') return FLAT_STYLE
  return RESULT_MAP[direction][getConfidenceLevel(confidence)]
}

function getConfidenceStyle(confidence: number): ConfidenceStyle {
  return (CONFIDENCE_MAP.find(c => confidence <= c.max) ?? CONFIDENCE_MAP[CONFIDENCE_MAP.length - 1]).style
}

/**
 * 将预测值映射为 0-1 置信度。
 * 对于收益率类预测（值域通常 ±0.05），乘以 20 后 clamp；
 * 对于概率类预测（值域 0-1），直接取绝对值即可。
 */
export function deriveConfidence(prediction: number): number {
  const absVal = Math.abs(prediction)
  if (absVal <= 1) return Math.min(absVal * 20, 1)
  return 1
}

/**
 * 将后端 prediction_label 转换为组件所需的 direction
 */
export function labelToDirection(label: string): 'up' | 'down' | 'flat' {
  if (label === '看涨') return 'up'
  if (label === '看跌') return 'down'
  return 'flat'
}

/* ================================================================
 *  全局 CSS Keyframes（仅注入一次）
 * ================================================================ */

const STYLE_ID = 'prediction-fun-keyframes'

function injectKeyframes() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes pfArrowBounceUp {
      0%   { transform: translateY(40px); opacity: 0; }
      60%  { transform: translateY(-8px); opacity: 1; }
      80%  { transform: translateY(4px); }
      100% { transform: translateY(0); }
    }
    @keyframes pfArrowBounceDown {
      0%   { transform: translateY(-40px); opacity: 0; }
      60%  { transform: translateY(8px); opacity: 1; }
      80%  { transform: translateY(-4px); }
      100% { transform: translateY(0); }
    }
    @keyframes pfResultBounce {
      0%   { transform: scale(0.3); opacity: 0; }
      50%  { transform: scale(1.08); }
      70%  { transform: scale(0.95); }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes pfFlame {
      0%, 100% { transform: scaleY(1) scaleX(1); opacity: 0.9; }
      25%      { transform: scaleY(1.15) scaleX(0.9); opacity: 1; }
      50%      { transform: scaleY(0.9) scaleX(1.1); opacity: 0.85; }
      75%      { transform: scaleY(1.1) scaleX(0.95); opacity: 1; }
    }
    @keyframes pfConfidenceGrow {
      from { width: 0; }
    }
    @keyframes pfEmojiFloat {
      0%, 100% { transform: translateY(0); }
      50%      { transform: translateY(-6px); }
    }
  `
  document.head.appendChild(style)
}

/* ================================================================
 *  PredictionAnimation 组件
 *  数字从 0 跳到预测值，箭头带弹跳动画
 * ================================================================ */

export const PredictionAnimation: React.FC<PredictionAnimationProps> = ({ direction, value, label }) => {
  const [displayValue, setDisplayValue] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const duration = 800
    const startTime = performance.now()
    const startVal = 0
    const endVal = value

    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(startVal + (endVal - startVal) * eased)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value])

  const arrowAnimation =
    direction === 'up'
      ? 'pfArrowBounceUp 0.8s ease-out forwards'
      : direction === 'down'
      ? 'pfArrowBounceDown 0.8s ease-out forwards'
      : undefined

  const style = getResultStyle(direction, Math.abs(value) * 20)

  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: style.arrowSize,
          color: style.color,
          fontWeight: 700,
          lineHeight: 1,
          animation: arrowAnimation,
        }}
      >
        {style.arrow}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: style.color, marginTop: 8 }}>
        {displayValue.toFixed(6)}
      </div>
      <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>{label}</div>
    </div>
  )
}

/* ================================================================
 *  ConfidenceBar 组件
 *  趣味化置信度进度条
 * ================================================================ */

export const ConfidenceBar: React.FC<ConfidenceBarProps> = ({ confidence }) => {
  const clamped = Math.max(0, Math.min(1, confidence))
  const { color, label } = getConfidenceStyle(clamped)
  const percent = Math.round(clamped * 100)

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          height: 12,
          borderRadius: 6,
          background: '#f0f0f0',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percent}%`,
            borderRadius: 6,
            background: color,
            animation: 'pfConfidenceGrow 0.8s ease-out',
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 4,
          fontSize: 12,
          color: '#999',
        }}
      >
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
    </div>
  )
}

/* ================================================================
 *  PredictionResult 组件
 *  主展示组件：趣味化表情 + 文案 + 动画 + 置信度条
 * ================================================================ */

export const PredictionResult: React.FC<PredictionResultProps> = ({
  direction,
  confidence,
  stockName,
  stockCode,
  predictedPrice,
  predictedChangePct,
  priceRangeLow,
  priceRangeHigh,
  predictedVolatility,
  predictedVolumeChange,
  targetType,
}) => {
  useEffect(() => { injectKeyframes() }, [])

  const style = getResultStyle(direction, confidence)
  const clampedConfidence = Math.max(0, Math.min(1, confidence))

  const arrowAnimName =
    direction === 'up'
      ? 'pfArrowBounceUp'
      : direction === 'down'
      ? 'pfArrowBounceDown'
      : 'none'

  const isUp = predictedChangePct != null && predictedChangePct > 0
  const isDown = predictedChangePct != null && predictedChangePct < 0
  const changeColor = isUp ? '#f5222d' : isDown ? '#52c41a' : '#faad14'

  return (
    <div
      style={{
        textAlign: 'center',
        padding: '24px 16px',
        animation: 'pfResultBounce 0.6s ease-out',
      }}
    >
      {/* 股票标识 */}
      {(stockName || stockCode) && (
        <div style={{ fontSize: 14, color: '#999', marginBottom: 12 }}>
          {stockCode && <span>{stockCode}</span>}
          {stockName && <span> · {stockName}</span>}
        </div>
      )}

      {/* 预测目标价格（大字显示） */}
      {predictedPrice != null && (
        <div style={{ fontSize: 36, fontWeight: 800, color: changeColor, lineHeight: 1.2, marginBottom: 4 }}>
          ¥{predictedPrice.toFixed(2)}
        </div>
      )}

      {/* 预测涨跌幅（带颜色和箭头） */}
      {predictedChangePct != null && (
        <div style={{ fontSize: 18, fontWeight: 600, color: changeColor, marginBottom: 12 }}>
          {isUp ? '↑' : isDown ? '↓' : '→'} {predictedChangePct > 0 ? '+' : ''}{predictedChangePct.toFixed(2)}%
        </div>
      )}

      {/* 价格区间 */}
      {priceRangeLow != null && priceRangeHigh != null && (
        <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
          价格区间: ¥{priceRangeLow.toFixed(2)} ~ ¥{priceRangeHigh.toFixed(2)}
        </div>
      )}

      {/* 多维预测数据 */}
      {targetType === 'multi_feature_next_day' && (predictedVolatility != null || predictedVolumeChange != null) && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 12 }}>
          {predictedVolatility != null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>波动率</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#1890ff' }}>{predictedVolatility.toFixed(6)}</div>
            </div>
          )}
          {predictedVolumeChange != null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>量变率</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#722ed1' }}>{predictedVolumeChange.toFixed(6)}</div>
            </div>
          )}
        </div>
      )}

      {/* 表情 + 箭头 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <span
          style={{
            fontSize: 56,
            animation: style.animate ? 'pfEmojiFloat 1.5s ease-in-out infinite' : 'none',
            display: 'inline-block',
          }}
        >
          {style.emoji}
        </span>

        <span
          style={{
            fontSize: style.arrowSize,
            color: style.color,
            fontWeight: 700,
            lineHeight: 1,
            display: 'inline-block',
            animation: `${arrowAnimName} 0.8s ease-out forwards`,
          }}
        >
          {style.arrow}
        </span>

        {/* 火焰动画：仅涨 + 高置信度 */}
        {direction === 'up' && getConfidenceLevel(confidence) === 'high' && (
          <span
            style={{
              fontSize: 32,
              display: 'inline-block',
              animation: 'pfFlame 0.6s ease-in-out infinite',
              transformOrigin: 'bottom center',
            }}
          >
            🔥
          </span>
        )}
      </div>

      {/* 主文案 */}
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: style.color,
          marginTop: 16,
        }}
      >
        {style.text}
      </div>

      {/* 置信度条 */}
      <div style={{ maxWidth: 280, margin: '16px auto 0' }}>
        <ConfidenceBar confidence={clampedConfidence} />
      </div>

      {/* 免责声明 */}
      <div
        style={{
          marginTop: 20,
          fontSize: 12,
          color: '#bbb',
          lineHeight: 1.6,
        }}
      >
        🐂 牛牛提醒：仅供娱乐参考，不构成投资建议
      </div>
    </div>
  )
}

export default PredictionResult
