import React, { useEffect, useState } from 'react'

/* ================================================================
 *  类型定义
 * ================================================================ */

export interface TrainingCompleteEffectProps {
  /** 训练结果状态 */
  status: 'completed' | 'failed'
  /** 显示完成后自动关闭的毫秒数，0 表示不自动关闭 */
  autoCloseMs?: number
  /** 关闭回调 */
  onClose?: () => void
}

/* ================================================================
 *  CSS Keyframes 注入（仅一次）
 * ================================================================ */

const STYLE_ID = 'training-effect-keyframes'

function injectKeyframes() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes teConfettiFall {
      0%   { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
      100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
    }
    @keyframes teScaleIn {
      0%   { transform: scale(0); opacity: 0; }
      60%  { transform: scale(1.15); }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes teShake {
      0%, 100% { transform: translateX(0); }
      20%      { transform: translateX(-6px); }
      40%      { transform: translateX(6px); }
      60%      { transform: translateX(-4px); }
      80%      { transform: translateX(4px); }
    }
    @keyframes tePulse {
      0%, 100% { transform: scale(1); }
      50%      { transform: scale(1.05); }
    }
  `
  document.head.appendChild(style)
}

/* ================================================================
 *  彩带/撒花粒子（纯 CSS 驱动）
 * ================================================================ */

interface ConfettiPiece {
  id: number
  left: number
  size: number
  color: string
  delay: number
  duration: number
}

const CONFETTI_COLORS = [
  '#f5222d', '#fa541c', '#faad14', '#52c41a',
  '#13c2c2', '#1890ff', '#722ed1', '#eb2f96',
  '#ffd700', '#ff69b4',
]

function generateConfetti(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: 6 + Math.random() * 8,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    delay: Math.random() * 1.5,
    duration: 2 + Math.random() * 2,
  }))
}

const ConfettiLayer: React.FC = () => {
  const [pieces] = useState(() => generateConfetti(50))

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9999,
        overflow: 'hidden',
      }}
    >
      {pieces.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: 0,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            borderRadius: 2,
            animation: `teConfettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  )
}

/* ================================================================
 *  成功效果
 * ================================================================ */

const SuccessEffect: React.FC = () => (
  <>
    <ConfettiLayer />
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 24,
          padding: '40px 56px',
          textAlign: 'center',
          boxShadow: '0 12px 48px rgba(0,0,0,0.15)',
          animation: 'teScaleIn 0.5s ease-out',
        }}
      >
        <div style={{ fontSize: 72, animation: 'tePulse 1.2s ease-in-out infinite' }}>🎉</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#52c41a', marginTop: 16 }}>
          训练完成！
        </div>
        <div style={{ fontSize: 16, color: '#666', marginTop: 8 }}>
          🐂 牛牛辛苦了，模型已就绪
        </div>
      </div>
    </div>
  </>
)

/* ================================================================
 *  失败效果
 * ================================================================ */

const FailureEffect: React.FC = () => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      pointerEvents: 'none',
    }}
  >
    <div
      style={{
        background: 'rgba(255,255,255,0.95)',
        borderRadius: 24,
        padding: '40px 56px',
        textAlign: 'center',
        boxShadow: '0 12px 48px rgba(0,0,0,0.15)',
        animation: 'teScaleIn 0.5s ease-out',
      }}
    >
      <div style={{ fontSize: 72, animation: 'teShake 0.6s ease-in-out' }}>😢</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#f5222d', marginTop: 16 }}>
        训练失败
      </div>
      <div style={{ fontSize: 16, color: '#666', marginTop: 8 }}>
        🐂 换个参数试试？
      </div>
    </div>
  </div>
)

/* ================================================================
 *  主组件：TrainingCompleteEffect
 * ================================================================ */

export const TrainingCompleteEffect: React.FC<TrainingCompleteEffectProps> = ({
  status,
  autoCloseMs = 3500,
  onClose,
}) => {
  const [visible, setVisible] = useState(true)

  useEffect(() => { injectKeyframes() }, [])

  useEffect(() => {
    if (autoCloseMs <= 0) return
    const timer = setTimeout(() => {
      setVisible(false)
      onClose?.()
    }, autoCloseMs)
    return () => clearTimeout(timer)
  }, [autoCloseMs, onClose])

  if (!visible) return null

  return status === 'completed' ? <SuccessEffect /> : <FailureEffect />
}

export default TrainingCompleteEffect
