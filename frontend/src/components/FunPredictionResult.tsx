import React, { useEffect, useMemo } from 'react'

/* ================================================================
 *  类型定义
 * ================================================================ */

export interface FunPredictionResultProps {
  direction: 'up' | 'down' | 'flat' | '看涨' | '看跌' | '震荡'
  confidence?: number | null
  stockCode?: string
  stockName?: string
  predictedPrice?: number | null
  predictedChangePct?: number | null
  targetType?: string
  predictedOpen?: number | null
  predictedHigh?: number | null
  predictedLow?: number | null
  compact?: boolean
}

/* ================================================================
 *  方向归一化：将中英文方向统一为内部枚举
 * ================================================================ */

type NormDir = 'up' | 'down' | 'flat'

function normalizeDirection(dir: FunPredictionResultProps['direction']): NormDir {
  if (dir === 'up' || dir === '看涨') return 'up'
  if (dir === 'down' || dir === '看跌') return 'down'
  return 'flat'
}

/* ================================================================
 *  趣味称号系统：方向 × 置信度 → 称号 + emoji
 * ================================================================ */

interface TitleEntry {
  title: string
  emoji: string
}

const TITLE_MAP: Record<NormDir, TitleEntry[]> = {
  up: [
    { title: '牛气冲天', emoji: '🐂🔥' },
    { title: '蓄势待发', emoji: '🐂📈' },
    { title: '小牛试刀', emoji: '🐄' },
    { title: '薛定谔的牛', emoji: '🐄❓' },
  ],
  down: [
    { title: '熊出没注意', emoji: '🐻⚠️' },
    { title: '风声鹤唳', emoji: '🐻📉' },
    { title: '小熊探路', emoji: '🐨' },
    { title: '薛定谔的熊', emoji: '🐻❓' },
  ],
  flat: [
    { title: '牛熊博弈', emoji: '🐂🐻' },
  ],
}

/**
 * 置信度 → 索引映射（0~3 对应由高到低四档）
 * - [0.8, 1.0] → 0（最高档）
 * - [0.6, 0.8) → 1
 * - [0.4, 0.6) → 2
 * - [0, 0.4)   → 3（最低档）
 * 震荡方向固定返回 0（只有一档）
 */
function getTitleIndex(dir: NormDir, confidence: number): number {
  if (dir === 'flat') return 0
  if (confidence >= 0.8) return 0
  if (confidence >= 0.6) return 1
  if (confidence >= 0.4) return 2
  return 3
}

function getTitle(dir: NormDir, confidence: number): TitleEntry {
  const list = TITLE_MAP[dir]
  const idx = Math.min(getTitleIndex(dir, confidence), list.length - 1)
  return list[idx]
}

/* ================================================================
 *  牛牛评语系统：方向 × 置信度 → 幽默评语
 * ================================================================ */

const COMMENTS: Record<string, string[]> = {
  'up-high': [
    '牛牛拍着胸脯说：这票要飞！🚀',
    '牛牛已经全仓杀入！💰',
    '牛牛两眼放光：机会来了！✨',
  ],
  'up-mid': [
    '牛牛谨慎乐观：可以小试牛刀~',
    '牛牛觉得有戏，但不敢all in 🤔',
  ],
  'down-high': [
    '牛牛瑟瑟发抖：快跑！📉',
    '牛牛已经清仓了！🏃‍♂️',
    '牛牛含泪劝你：别头铁！😭',
  ],
  'down-mid': [
    '牛牛有点慌，建议系好安全带~',
    '牛牛觉得不太妙，但也不是世界末日 🤷',
  ],
  'flat': [
    '牛牛挠头：看不懂，再观察观察🤔',
    '牛牛打了个哈欠：今天没戏~ 😴',
    '牛牛表示：多空双方在打太极 🥋',
  ],
  'low': [
    '牛牛摊手：说实话，我也不太确定 🤷‍♂️',
    '牛牛闭眼瞎蒙：反正不是涨就是跌...吧？🙈',
  ],
}

function getCommentKey(dir: NormDir, confidence: number): string {
  if (confidence < 0.3) return 'low'
  if (dir === 'flat') return 'flat'
  const level = confidence >= 0.7 ? 'high' : 'mid'
  return `${dir}-${level}`
}

/**
 * 基于 stockCode 做确定性选择：同一只股票每次展示相同评语，
 * 避免 re-render 时评语跳动。无 stockCode 时回退到 Math.random。
 */
function pickComment(dir: NormDir, confidence: number, stockCode?: string): string {
  const key = getCommentKey(dir, confidence)
  const list = COMMENTS[key]
  if (!list || list.length === 0) return '牛牛表示：... 🤔'

  if (stockCode) {
    let hash = 0
    for (let i = 0; i < stockCode.length; i++) {
      hash = ((hash << 5) - hash + stockCode.charCodeAt(i)) | 0
    }
    return list[Math.abs(hash) % list.length]
  }

  return list[Math.floor(Math.random() * list.length)]
}

/* ================================================================
 *  CSS Keyframes 注入（全局只注入一次）
 * ================================================================ */

const STYLE_ID = 'fun-prediction-keyframes'

function injectKeyframes() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes funSlideUp {
      0%   { transform: translateY(12px); opacity: 0; }
      100% { transform: translateY(0); opacity: 1; }
    }
    @keyframes funSlideDown {
      0%   { transform: translateY(-12px); opacity: 0; }
      100% { transform: translateY(0); opacity: 1; }
    }
    @keyframes funWobble {
      0%, 100% { transform: rotate(0deg); }
      15%      { transform: rotate(-3deg); }
      30%      { transform: rotate(3deg); }
      45%      { transform: rotate(-2deg); }
      60%      { transform: rotate(2deg); }
      75%      { transform: rotate(-1deg); }
    }
    @keyframes funFadeInLeft {
      0%   { transform: translateX(-20px); opacity: 0; }
      100% { transform: translateX(0); opacity: 1; }
    }
    @keyframes funFadeInRight {
      0%   { transform: translateX(20px); opacity: 0; }
      100% { transform: translateX(0); opacity: 1; }
    }
    @keyframes funConfidenceGrow {
      from { width: 0; }
    }
    @keyframes funEmojiPulse {
      0%, 100% { transform: scale(1); }
      50%      { transform: scale(1.15); }
    }
  `
  document.head.appendChild(style)
}

/* ================================================================
 *  颜色 & 渐变常量
 * ================================================================ */

const COLORS = {
  up: '#f5222d',
  down: '#52c41a',
  flat: '#faad14',
} as const

const GRADIENTS = {
  up: 'linear-gradient(135deg, #fff1f0 0%, #fff 100%)',
  down: 'linear-gradient(135deg, #f6ffed 0%, #fff 100%)',
  flat: 'linear-gradient(135deg, #fffbe6 0%, #fff 100%)',
} as const

const COMPACT_GRADIENTS = {
  up: 'linear-gradient(135deg, #fff1f0 0%, #fff 100%)',
  down: 'linear-gradient(135deg, #f6ffed 0%, #fff 100%)',
  flat: '#fafafa',
} as const

/* ================================================================
 *  置信度进度条子组件
 * ================================================================ */

const ConfidenceBar: React.FC<{ confidence: number; color: string }> = ({ confidence, color }) => {
  const percent = Math.round(Math.max(0, Math.min(1, confidence)) * 100)
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        height: 10,
        borderRadius: 5,
        background: '#f0f0f0',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${percent}%`,
          borderRadius: 5,
          background: color,
          animation: 'funConfidenceGrow 0.8s ease-out',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 4,
        fontSize: 12,
        color: '#999',
      }}>
        <span>牛牛的信心</span>
        <span>{percent}%</span>
      </div>
    </div>
  )
}

/* ================================================================
 *  OHLC 预测详情子组件（next_day_ohlc 目标专用）
 * ================================================================ */

const OhlcDetail: React.FC<{
  predictedOpen: number | null | undefined
  predictedHigh: number | null | undefined
  predictedLow: number | null | undefined
  predictedPrice: number | null | undefined
}> = ({ predictedOpen, predictedHigh, predictedLow, predictedPrice }) => {
  const hasAny = predictedOpen != null || predictedHigh != null || predictedLow != null
  if (!hasAny) return null

  const items: { label: string; value: string; color: string }[] = []

  if (predictedOpen != null) {
    items.push({ label: '开盘', value: `¥${predictedOpen.toFixed(2)}`, color: '#1890ff' })
  }
  if (predictedHigh != null) {
    items.push({ label: '最高', value: `¥${predictedHigh.toFixed(2)}`, color: '#f5222d' })
  }
  if (predictedLow != null) {
    items.push({ label: '最低', value: `¥${predictedLow.toFixed(2)}`, color: '#52c41a' })
  }
  if (predictedPrice != null) {
    items.push({ label: '收盘', value: `¥${predictedPrice.toFixed(2)}`, color: '#722ed1' })
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      gap: 16,
      marginTop: 12,
      flexWrap: 'wrap',
    }}>
      {items.map((item) => (
        <div key={item.label} style={{
          textAlign: 'center',
          padding: '8px 12px',
          borderRadius: 8,
          background: '#fafafa',
          minWidth: 70,
        }}>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>{item.label}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: item.color }}>{item.value}</div>
        </div>
      ))}
    </div>
  )
}

/* ================================================================
 *  紧凑模式渲染
 * ================================================================ */

const CompactView: React.FC<{
  dir: NormDir
  confidence: number
  title: TitleEntry
  comment: string
  predictedPrice: number | null | undefined
  predictedChangePct: number | null | undefined
}> = ({ dir, confidence, title, comment, predictedPrice, predictedChangePct }) => {
  const isUp = dir === 'up'
  const isDown = dir === 'down'
  const changeColor = isUp ? COLORS.up : isDown ? COLORS.down : COLORS.flat

  return (
    <div style={{
      padding: 12,
      borderRadius: 8,
      background: COMPACT_GRADIENTS[dir],
      borderLeft: `3px solid ${COLORS[dir]}`,
    }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>
        {title.title} {title.emoji}
      </div>
      <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
        {comment}
      </div>
      {(predictedPrice != null || predictedChangePct != null) && (
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          marginTop: 4,
        }}>
          {predictedPrice != null && (
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              ¥{predictedPrice.toFixed(2)}
            </span>
          )}
          {predictedChangePct != null && (
            <span style={{ fontSize: 13, fontWeight: 600, color: changeColor }}>
              {predictedChangePct > 0 ? '+' : ''}{predictedChangePct.toFixed(2)}%
            </span>
          )}
        </div>
      )}
      {confidence != null && (
        <div style={{ marginTop: 6 }}>
          <ConfidenceBar confidence={confidence} color={COLORS[dir]} />
        </div>
      )}
    </div>
  )
}

/* ================================================================
 *  完整模式渲染
 * ================================================================ */

const FullView: React.FC<{
  dir: NormDir
  confidence: number
  title: TitleEntry
  comment: string
  stockCode: string | undefined
  stockName: string | undefined
  predictedPrice: number | null | undefined
  predictedChangePct: number | null | undefined
  targetType: string | undefined
  predictedOpen: number | null | undefined
  predictedHigh: number | null | undefined
  predictedLow: number | null | undefined
}> = ({
  dir, confidence, title, comment,
  stockCode, stockName,
  predictedPrice, predictedChangePct,
  targetType, predictedOpen, predictedHigh, predictedLow,
}) => {
  const isUp = dir === 'up'
  const isDown = dir === 'down'
  const changeColor = isUp ? COLORS.up : isDown ? COLORS.down : COLORS.flat

  const titleAnimName = isUp
    ? 'funFadeInLeft 0.6s ease-out forwards'
    : isDown
    ? 'funFadeInRight 0.6s ease-out forwards'
    : 'funWobble 1.2s ease-in-out'

  const emojiAnimName = 'funEmojiPulse 1.5s ease-in-out infinite'

  return (
    <div style={{
      textAlign: 'center',
      padding: 24,
      borderRadius: 12,
      background: GRADIENTS[dir],
    }}>
      {/* 股票标识 */}
      {(stockName || stockCode) && (
        <div style={{ fontSize: 14, color: '#999', marginBottom: 8 }}>
          {stockCode && <span>{stockCode}</span>}
          {stockName && <span> · {stockName}</span>}
        </div>
      )}

      {/* 大号 emoji */}
      <div style={{
        fontSize: 48,
        marginBottom: 8,
        display: 'inline-block',
        animation: emojiAnimName,
      }}>
        {title.emoji}
      </div>

      {/* 趣味称号（带方向动画） */}
      <div style={{
        fontSize: 28,
        fontWeight: 700,
        color: COLORS[dir],
        animation: titleAnimName,
      }}>
        {title.title}
      </div>

      {/* 牛牛评语 */}
      <div style={{
        fontSize: 16,
        color: '#666',
        marginTop: 8,
        fontStyle: 'italic',
      }}>
        "{comment}"
      </div>

      {/* 预测详情卡片 */}
      <div style={{
        marginTop: 16,
        padding: '16px 20px',
        borderRadius: 10,
        background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        display: 'inline-block',
        minWidth: 200,
      }}>
        {predictedPrice != null && (
          <div style={{
            fontSize: 32,
            fontWeight: 800,
            color: changeColor,
            lineHeight: 1.2,
          }}>
            ¥{predictedPrice.toFixed(2)}
          </div>
        )}

        {predictedChangePct != null && (
          <div style={{
            fontSize: 16,
            fontWeight: 600,
            color: changeColor,
            marginTop: 4,
          }}>
            {isUp ? '↑' : isDown ? '↓' : '→'}{' '}
            {predictedChangePct > 0 ? '+' : ''}{predictedChangePct.toFixed(2)}%
          </div>
        )}

        {confidence != null && (
          <div style={{ marginTop: 12, minWidth: 180 }}>
            <ConfidenceBar confidence={confidence} color={COLORS[dir]} />
          </div>
        )}

        {/* OHLC 预测 */}
        {targetType === 'next_day_ohlc' && (
          <OhlcDetail
            predictedOpen={predictedOpen}
            predictedHigh={predictedHigh}
            predictedLow={predictedLow}
            predictedPrice={predictedPrice}
          />
        )}
      </div>

      {/* 免责声明 */}
      <div style={{
        marginTop: 16,
        fontSize: 12,
        color: '#bbb',
        lineHeight: 1.6,
      }}>
        🐂 牛牛提醒：仅供娱乐参考，不构成投资建议
      </div>
    </div>
  )
}

/* ================================================================
 *  主组件：FunPredictionResult
 * ================================================================ */

const FunPredictionResult: React.FC<FunPredictionResultProps> = ({
  direction,
  confidence = null,
  stockCode,
  stockName,
  predictedPrice = null,
  predictedChangePct = null,
  targetType,
  predictedOpen = null,
  predictedHigh = null,
  predictedLow = null,
  compact = false,
}) => {
  useEffect(() => { injectKeyframes() }, [])

  const dir = normalizeDirection(direction)
  const clampedConf = confidence != null ? Math.max(0, Math.min(1, confidence)) : 0.5

  const title = useMemo(
    () => getTitle(dir, clampedConf),
    [dir, clampedConf],
  )

  const comment = useMemo(
    () => pickComment(dir, clampedConf, stockCode),
    [dir, clampedConf, stockCode],
  )

  if (compact) {
    return (
      <CompactView
        dir={dir}
        confidence={clampedConf}
        title={title}
        comment={comment}
        predictedPrice={predictedPrice}
        predictedChangePct={predictedChangePct}
      />
    )
  }

  return (
    <FullView
      dir={dir}
      confidence={clampedConf}
      title={title}
      comment={comment}
      stockCode={stockCode}
      stockName={stockName}
      predictedPrice={predictedPrice}
      predictedChangePct={predictedChangePct}
      targetType={targetType}
      predictedOpen={predictedOpen}
      predictedHigh={predictedHigh}
      predictedLow={predictedLow}
    />
  )
}

export default FunPredictionResult
