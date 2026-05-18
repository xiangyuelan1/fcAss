import { notification } from 'antd'

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_model', name: '初出茅庐', description: '创建第一个模型', icon: '🐣' },
  { id: 'first_train', name: '牛刀小试', description: '完成第一次训练', icon: '🐂' },
  { id: 'streak_3', name: '百发百中', description: '连续3次预测正确', icon: '🎯' },
  { id: 'first_publish', name: '社交牛人', description: '发布第一个社区模型', icon: '🌟' },
  { id: 'zen_player', name: '佛系玩家', description: '一周不登录', icon: '🧘' },
  { id: 'daily_guess', name: '猜猜乐', description: '参与每日一猜', icon: '🎲' },
]

const shownSet = new Set<string>()

/**
 * 弹出成就提示卡片。同一成就在一次会话中仅弹出一次。
 */
export function showAchievement(achievementId: string) {
  const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId)
  if (!achievement) return
  if (shownSet.has(achievementId)) return
  shownSet.add(achievementId)

  notification.success({
    message: (
      <span style={{ fontSize: 15, fontWeight: 600 }}>
        {achievement.icon} 成就解锁：{achievement.name}
      </span>
    ),
    description: achievement.description,
    placement: 'topRight',
    duration: 5,
    style: { width: 320 },
  })
}

const AchievementToast: React.FC = () => null

export default AchievementToast
