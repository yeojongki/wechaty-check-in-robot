import { Message } from 'wechaty'
import { MessageType } from 'wechaty-puppet'
import Config from '@/config'
import event from '@/shared/events'
import { EventTypes } from '@/constants/eventTypes'
import shared from '@/shared/utils'
import adminHandler from './handleAdminMsg'
import { ONE_MINUTE } from '@/constants/time'

let userDataInited: boolean = shared.checkUserDataIsInit()
// 上次打卡情况 { wechat: Date }
const LAST_CHECKED_IN = new Map<string, Date>()
// 警告打卡没有内容 { wechat: NodeJS.Timeout }
const WARN_NO_CONTENT = new Map<string, NodeJS.Timeout>()

export async function onMessage(msg: Message) {
  // skip self
  if (msg.self()) {
    return
  }

  if (msg.age() > 3 * 60) {
    console.log('🌟[Notice]: 消息太旧(3分钟前)已被跳过解析', msg)
    return
  }

  const room = msg.room()
  const from = msg.from()

  if (!from) {
    return
  }

  if (await adminHandler.checkIsAdmin(from.id)) {
    adminHandler.handleAdminMsg(msg)
    return
  }

  try {
    // 监控目标房间
    if (room && (await room.topic()).includes(Config.getInstance().ROOM_NAME)) {
      if (!userDataInited) {
        userDataInited = shared.checkUserDataIsInit()
        event.emit(EventTypes.FIRST_IN_TARGET_ROOM, room)
      }

      const msgText = msg.text()
      const wechat = from.id
      const name = from.name()
      const now = new Date()

      // 不处理 `@所有人`
      // 一般为管理员通知消息 可能会包含关键字 `打卡` or `请假`
      if (msgText.includes('@所有人') || msgText.includes('@All')) return

      // 判定请假
      if (msgText.includes('请假')) {
        console.log(
          `✂️[Ask For Leave]: 检测到请假 - 用户「${wechat}」-「${name}」`,
        )
        event.emit(EventTypes.ASK_FOR_LEAVE, {
          from,
          wechat,
          now,
        })

        // 如果请假了就不继续判断后续打卡情况
        return
      }

      const isFillCard = /补卡|补打卡|补昨天/.test(msgText)
      // 只有纯打卡内容 会发起警告
      if (msgText === '打卡' || msgText === '补卡' || msgText === '补打卡') {
        // 如果本次发送 `打卡` 且距离上次打卡成功时间低于 2 分钟
        // 则认为用户是先发图片 再发文字 `打卡` 二字
        // 此时不做判断
        const lastCheckIn = LAST_CHECKED_IN.get(wechat)
        if (lastCheckIn && +now - +lastCheckIn < ONE_MINUTE * 2) {
          return
        }

        // 已开启警告定时器
        if (WARN_NO_CONTENT.get(wechat)) {
          return
        }

        const timer = setTimeout(async () => {
          await room.say`${from} ${
            isFillCard ? '补' : '打'
          }卡失败❌ 请补充打卡内容`
        }, ONE_MINUTE * 3)
        WARN_NO_CONTENT.set(wechat, timer)

        console.log(
          `🌟[Notice]: 检测到用户没有打卡内容, 开启警告定时器 - ${name} - ${wechat}`,
        )
        return
      }

      // 判定打卡成功
      if (
        msgText.includes('打卡') ||
        msg.type() === MessageType.Image ||
        msg.type() === MessageType.Video ||
        msg.type() === MessageType.Url
      ) {
        // 移除警告定时器
        const warnTimer = WARN_NO_CONTENT.get(wechat)
        if (warnTimer) {
          clearTimeout(warnTimer)
          WARN_NO_CONTENT.delete(wechat)
          console.log(`🌟[Notice]: ${name} 已补充打卡内容, 移除警告定时器`)
        }

        // 过滤 1 分钟内重复打卡信息
        const lastCheckIn = LAST_CHECKED_IN.get(wechat)
        if (lastCheckIn && +now - +lastCheckIn < ONE_MINUTE) {
          return
        }

        // 记录已打卡
        LAST_CHECKED_IN.set(wechat, now)

        console.log(
          `📌[Check In]: 检测到${
            isFillCard ? '补' : '打'
          }卡 - 用户「${wechat}」-「${name}」`,
        )
        event.emit(isFillCard ? EventTypes.FILL_CARD : EventTypes.CHECK_IN, {
          name,
          wechat,
          now,
        })
      }
    }
  } catch (error) {
    console.error('📡[Message]: 解析消息失败', msg, error)
  }
}
