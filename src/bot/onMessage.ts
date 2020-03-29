import { Message } from 'wechaty'
import { MessageType } from 'wechaty-puppet'
import Config from '../config'
import event from '../shared/events'
import { EventTypes } from '../constants/eventTypes'
import shared from '../shared/utils'

let userDataInited: boolean = shared.checkUserDataIsInit()
const checkInMap = new Map<string, Date>()

export async function onMessage(msg: Message) {
  // skip self
  if (msg.self()) {
    return
  }

  if (msg.age() > 3 * 60) {
    console.log('🌟[Notice]: 消息太旧(3分钟前)被忽略', msg)
    return
  }

  const room = msg.room()
  const from = msg.from()
  if (!from) {
    return
  }

  // 监控目标房间
  if (room && (await room.topic()).includes(Config.getInstance().ROOM_NAME)) {
    if (!userDataInited) {
      userDataInited = shared.checkUserDataIsInit()
      event.emit(EventTypes.FIRST_IN_TARGET_ROOM, room)
    }

    const msgText = msg.text()

    // 判定打卡成功
    if (msgText.includes('打卡') || msg.type() === MessageType.Image) {
      const wechat = from.id
      const time = new Date()

      // 过滤三秒内重复打卡信息
      const lastCheckIn = checkInMap.get(wechat)
      if (lastCheckIn && +time - +lastCheckIn < 3000) {
        return
      }
      checkInMap.set(wechat, time)

      event.emit(EventTypes.CHECK_IN, {
        wechat,
        time,
      })
      console.log(`📌[Check In]: 检测到打卡 - 用户「${wechat}」`)
    }

    // 判定请假
    if (msgText.includes('请假')) {
      const wechat = from.id
      const username = from.name()
      const time = new Date()
      event.emit(EventTypes.ASK_FOR_LEAVE, {
        wechat,
        time,
      })
      room.say(`@${username} 请假成功✅`)
      console.log(`✂️[Ask For Leave]: 检测到请假 - 用户「${wechat}」`)
    }
  }
}
