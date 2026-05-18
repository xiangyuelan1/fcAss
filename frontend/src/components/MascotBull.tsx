import React, { useMemo } from 'react'

export type BullMood = 'happy' | 'thinking' | 'sad' | 'excited' | 'chill' | 'default'
export type BullSize = 'small' | 'medium' | 'large'

interface MascotBullProps {
  mood?: BullMood
  message?: string
  size?: BullSize
}

const SIZE_MAP: Record<BullSize, number> = {
  small: 60,
  medium: 100,
  large: 150,
}

const MESSAGES: Record<BullMood, string[]> = {
  happy: ['牛气冲天！', '今天牛牛很得意~', '蒙对了！牛牛也惊讶', '运气也是实力的一部分', '牛牛为你鼓掌👏'],
  thinking: ['牛牛正在努力思考...', '让牛牛想想...', '算力燃烧中，牛牛出汗了', '牛牛在翻历史数据...', '别急，牛牛认真着呢'],
  sad: ['这次牛牛看走眼了', '牛牛也很无奈', '投资有风险，牛牛也翻车', '牛牛安慰你：下次会更好', '牛牛说：淡定淡定'],
  excited: ['牛牛嗨翻了！', '太牛了！', '牛牛激动得转圈圈', '牛牛为你疯狂打call', '牛气冲天！'],
  chill: ['牛牛说：佛系投资，随缘就好', '牛牛戴墨镜：淡定', '投资嘛，开心最重要', '牛牛：仅供参考，别当真', '牛牛：稳住，我们能赢'],
  default: ['牛牛在这里陪你', '你好，我是牛牛！', '牛牛为你服务', '跟着牛牛学投资', '牛牛：一起加油'],
}

function pickRandom(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)]
}

/**
 * 根据心情渲染不同的牛眼表情
 * - happy: 弯弯笑眼
 * - thinking: 一只眼微闭，一只正常
 * - sad: 下垂眉 + 大眼含泪
 * - excited: 星星眼
 * - chill: 墨镜
 * - default: 圆眼微笑
 */
function BullEyes({ mood, cx, cy, scale }: { mood: BullMood; cx: number; cy: number; scale: number }) {
  const s = scale
  const gap = 14 * s

  if (mood === 'happy') {
    return (
      <>
        <path d={`M${cx - gap - 6 * s},${cy + 2 * s} Q${cx - gap},${cy - 6 * s} ${cx - gap + 6 * s},${cy + 2 * s}`}
          fill="none" stroke="#4a2c0a" strokeWidth={2.2 * s} strokeLinecap="round" />
        <path d={`M${cx + gap - 6 * s},${cy + 2 * s} Q${cx + gap},${cy - 6 * s} ${cx + gap + 6 * s},${cy + 2 * s}`}
          fill="none" stroke="#4a2c0a" strokeWidth={2.2 * s} strokeLinecap="round" />
      </>
    )
  }

  if (mood === 'thinking') {
    return (
      <>
        <circle cx={cx - gap} cy={cy} r={5 * s} fill="#4a2c0a" />
        <circle cx={cx - gap + 1.5 * s} cy={cy - 1.5 * s} r={1.8 * s} fill="#fff" />
        <path d={`M${cx + gap - 6 * s},${cy + 1 * s} Q${cx + gap},${cy - 5 * s} ${cx + gap + 6 * s},${cy + 1 * s}`}
          fill="none" stroke="#4a2c0a" strokeWidth={2.2 * s} strokeLinecap="round" />
      </>
    )
  }

  if (mood === 'sad') {
    return (
      <>
        <circle cx={cx - gap} cy={cy + 2 * s} r={5 * s} fill="#4a2c0a" />
        <circle cx={cx - gap + 1.5 * s} cy={cy + 0.5 * s} r={1.8 * s} fill="#fff" />
        <circle cx={cx + gap} cy={cy + 2 * s} r={5 * s} fill="#4a2c0a" />
        <circle cx={cx + gap + 1.5 * s} cy={cy + 0.5 * s} r={1.8 * s} fill="#fff" />
        <line x1={cx - gap - 5 * s} y1={cy - 6 * s} x2={cx - gap + 5 * s} y2={cy - 3 * s}
          stroke="#4a2c0a" strokeWidth={1.8 * s} strokeLinecap="round" />
        <line x1={cx + gap + 5 * s} y1={cy - 6 * s} x2={cx + gap - 5 * s} y2={cy - 3 * s}
          stroke="#4a2c0a" strokeWidth={1.8 * s} strokeLinecap="round" />
        <ellipse cx={cx - gap + 5 * s} cy={cy + 5 * s} rx={2.5 * s} ry={3 * s} fill="#87ceeb" opacity={0.6} />
      </>
    )
  }

  if (mood === 'excited') {
    return (
      <>
        <polygon
          points={`${cx - gap},${cy - 6 * s} ${cx - gap + 3 * s},${cy - 1 * s} ${cx - gap + 7 * s},${cy - 1 * s} ${cx - gap + 4 * s},${cy + 2 * s} ${cx - gap + 5.5 * s},${cy + 7 * s} ${cx - gap},${cy + 4 * s} ${cx - gap - 5.5 * s},${cy + 7 * s} ${cx - gap - 4 * s},${cy + 2 * s} ${cx - gap - 7 * s},${cy - 1 * s} ${cx - gap - 3 * s},${cy - 1 * s}`}
          fill="#ffd700" stroke="#e6a800" strokeWidth={0.8 * s}
        />
        <polygon
          points={`${cx + gap},${cy - 6 * s} ${cx + gap + 3 * s},${cy - 1 * s} ${cx + gap + 7 * s},${cy - 1 * s} ${cx + gap + 4 * s},${cy + 2 * s} ${cx + gap + 5.5 * s},${cy + 7 * s} ${cx + gap},${cy + 4 * s} ${cx + gap - 5.5 * s},${cy + 7 * s} ${cx + gap - 4 * s},${cy + 2 * s} ${cx + gap - 7 * s},${cy - 1 * s} ${cx + gap - 3 * s},${cy - 1 * s}`}
          fill="#ffd700" stroke="#e6a800" strokeWidth={0.8 * s}
        />
      </>
    )
  }

  if (mood === 'chill') {
    return (
      <>
        <rect x={cx - gap - 12 * s} y={cy - 5 * s} width={24 * s} height={10 * s} rx={5 * s}
          fill="#1a1a2e" stroke="#333" strokeWidth={1 * s} />
        <rect x={cx + gap - 12 * s} y={cy - 5 * s} width={24 * s} height={10 * s} rx={5 * s}
          fill="#1a1a2e" stroke="#333" strokeWidth={1 * s} />
        <line x1={cx - gap + 12 * s} y1={cy} x2={cx + gap - 12 * s} y2={cy}
          stroke="#333" strokeWidth={2 * s} />
        <rect x={cx - gap - 10 * s} y={cy - 3 * s} width={8 * s} height={6 * s} rx={3 * s}
          fill="#2a2a4a" opacity={0.5} />
        <rect x={cx + gap - 10 * s} y={cy - 3 * s} width={8 * s} height={6 * s} rx={3 * s}
          fill="#2a2a4a" opacity={0.5} />
      </>
    )
  }

  return (
    <>
      <circle cx={cx - gap} cy={cy} r={5 * s} fill="#4a2c0a" />
      <circle cx={cx - gap + 1.5 * s} cy={cy - 1.5 * s} r={1.8 * s} fill="#fff" />
      <circle cx={cx + gap} cy={cy} r={5 * s} fill="#4a2c0a" />
      <circle cx={cx + gap + 1.5 * s} cy={cy - 1.5 * s} r={1.8 * s} fill="#fff" />
    </>
  )
}

/**
 * 根据心情渲染不同的嘴巴表情
 */
function BullMouth({ mood, cx, cy, scale }: { mood: BullMood; cx: number; cy: number; scale: number }) {
  const s = scale

  if (mood === 'happy' || mood === 'excited') {
    return (
      <path d={`M${cx - 10 * s},${cy} Q${cx},${cy + 12 * s} ${cx + 10 * s},${cy}`}
        fill={mood === 'excited' ? '#ff6b6b' : '#c0392b'} stroke="#4a2c0a" strokeWidth={1.5 * s} />
    )
  }

  if (mood === 'thinking') {
    return (
      <path d={`M${cx - 5 * s},${cy + 2 * s} Q${cx + 2 * s},${cy + 5 * s} ${cx + 8 * s},${cy}`}
        fill="none" stroke="#4a2c0a" strokeWidth={1.8 * s} strokeLinecap="round" />
    )
  }

  if (mood === 'sad') {
    return (
      <path d={`M${cx - 8 * s},${cy + 4 * s} Q${cx},${cy - 4 * s} ${cx + 8 * s},${cy + 4 * s}`}
        fill="none" stroke="#4a2c0a" strokeWidth={1.8 * s} strokeLinecap="round" />
    )
  }

  if (mood === 'chill') {
    return (
      <path d={`M${cx - 7 * s},${cy} Q${cx},${cy + 5 * s} ${cx + 7 * s},${cy}`}
        fill="none" stroke="#4a2c0a" strokeWidth={1.8 * s} strokeLinecap="round" />
    )
  }

  return (
    <path d={`M${cx - 7 * s},${cy + 1 * s} Q${cx},${cy + 7 * s} ${cx + 7 * s},${cy + 1 * s}`}
      fill="none" stroke="#4a2c0a" strokeWidth={1.8 * s} strokeLinecap="round" />
  )
}

/**
 * 思考状态的挠头小手
 */
function BullThinkingHand({ cx, cy, scale }: { cx: number; cy: number; scale: number }) {
  const s = scale
  return (
    <g>
      <line x1={cx + 28 * s} y1={cy - 8 * s} x2={cx + 38 * s} y2={cy - 22 * s}
        stroke="#c47a2a" strokeWidth={3 * s} strokeLinecap="round" />
      <circle cx={cx + 38 * s} cy={cy - 24 * s} r={4 * s} fill="#c47a2a" />
      <line x1={cx + 38 * s} y1={cy - 28 * s} x2={cx + 42 * s} y2={cy - 34 * s}
        stroke="#c47a2a" strokeWidth={2 * s} strokeLinecap="round" />
      <line x1={cx + 38 * s} y1={cy - 28 * s} x2={cx + 35 * s} y2={cy - 35 * s}
        stroke="#c47a2a" strokeWidth={2 * s} strokeLinecap="round" />
      <line x1={cx + 38 * s} y1={cy - 28 * s} x2={cx + 41 * s} y2={cy - 36 * s}
        stroke="#c47a2a" strokeWidth={2 * s} strokeLinecap="round" />
    </g>
  )
}

/**
 * 兴奋状态的手舞足蹈
 */
function BullExcitedArms({ cx, cy, scale }: { cx: number; cy: number; scale: number }) {
  const s = scale
  return (
    <g>
      <line x1={cx - 30 * s} y1={cy} x2={cx - 42 * s} y2={cy - 18 * s}
        stroke="#c47a2a" strokeWidth={3 * s} strokeLinecap="round" />
      <circle cx={cx - 44 * s} cy={cy - 20 * s} r={3.5 * s} fill="#c47a2a" />
      <line x1={cx + 30 * s} y1={cy} x2={cx + 42 * s} y2={cy - 18 * s}
        stroke="#c47a2a" strokeWidth={3 * s} strokeLinecap="round" />
      <circle cx={cx + 44 * s} cy={cy - 20 * s} r={3.5 * s} fill="#c47a2a" />
    </g>
  )
}

const MascotBull: React.FC<MascotBullProps> = ({ mood = 'default', message, size = 'medium' }) => {
  const px = SIZE_MAP[size]
  const scale = px / 100

  const displayMessage = useMemo(() => {
    if (message) return message
    return pickRandom(MESSAGES[mood])
  }, [mood, message])

  const fontSize = size === 'small' ? 11 : size === 'large' ? 16 : 13

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg
        width={px}
        height={px}
        viewBox="0 0 100 100"
        style={{ overflow: 'visible' }}
      >
        {/* 牛角 - 左 */}
        <path d="M28,30 Q18,8 22,2" fill="none" stroke="#f0d060" strokeWidth={4 * scale} strokeLinecap="round" />
        <path d="M28,30 Q18,8 22,2" fill="#f5e6a3" stroke="#e6c84d" strokeWidth={1.5 * scale} />

        {/* 牛角 - 右 */}
        <path d="M72,30 Q82,8 78,2" fill="none" stroke="#f0d060" strokeWidth={4 * scale} strokeLinecap="round" />
        <path d="M72,30 Q82,8 78,2" fill="#f5e6a3" stroke="#e6c84d" strokeWidth={1.5 * scale} />

        {/* 耳朵 - 左 */}
        <ellipse cx={22} cy={40} rx={8 * scale} ry={5 * scale}
          fill="#c47a2a" stroke="#a0611b" strokeWidth={1 * scale}
          transform="rotate(-25, 22, 40)" />
        <ellipse cx={22} cy={40} rx={5 * scale} ry={3 * scale}
          fill="#e8a84c" transform="rotate(-25, 22, 40)" />

        {/* 耳朵 - 右 */}
        <ellipse cx={78} cy={40} rx={8 * scale} ry={5 * scale}
          fill="#c47a2a" stroke="#a0611b" strokeWidth={1 * scale}
          transform="rotate(25, 78, 40)" />
        <ellipse cx={78} cy={40} rx={5 * scale} ry={3 * scale}
          fill="#e8a84c" transform="rotate(25, 78, 40)" />

        {/* 脸 */}
        <circle cx={50} cy={52} r={32 * scale} fill="#e8a84c" stroke="#c47a2a" strokeWidth={2 * scale} />

        {/* 腮红 */}
        <ellipse cx={28} cy={58} rx={7 * scale} ry={5 * scale} fill="#f4a460" opacity={0.4} />
        <ellipse cx={72} cy={58} rx={7 * scale} ry={5 * scale} fill="#f4a460" opacity={0.4} />

        {/* 眼睛 */}
        <BullEyes mood={mood} cx={50} cy={44} scale={scale} />

        {/* 鼻子区域 */}
        <ellipse cx={50} cy={62} rx={14 * scale} ry={9 * scale} fill="#d4915e" stroke="#b87333" strokeWidth={1.2 * scale} />
        <ellipse cx={44} cy={62} rx={3.5 * scale} ry={3 * scale} fill="#b87333" />
        <ellipse cx={56} cy={62} rx={3.5 * scale} ry={3 * scale} fill="#b87333" />

        {/* 嘴巴 */}
        <BullMouth mood={mood} cx={50} cy={72} scale={scale} />

        {/* 心情附加元素 */}
        {mood === 'thinking' && <BullThinkingHand cx={50} cy={52} scale={scale} />}
        {mood === 'excited' && <BullExcitedArms cx={50} cy={52} scale={scale} />}

        {/* 开心/兴奋时的装饰星星 */}
        {(mood === 'happy' || mood === 'excited') && (
          <>
            <text x={8} y={18} fontSize={10 * scale} fill="#ffd700">✨</text>
            <text x={82} y={14} fontSize={8 * scale} fill="#ffd700">✨</text>
          </>
        )}

        {/* 难过时的汗滴 */}
        {mood === 'sad' && (
          <ellipse cx={78} cy={36} rx={2 * scale} ry={3.5 * scale} fill="#87ceeb" opacity={0.7} />
        )}
      </svg>

      {displayMessage && (
        <div style={{
          fontSize,
          color: '#8c6d3f',
          textAlign: 'center',
          maxWidth: px * 2,
          lineHeight: 1.4,
          fontWeight: 500,
        }}>
          {displayMessage}
        </div>
      )}
    </div>
  )
}

export default MascotBull
