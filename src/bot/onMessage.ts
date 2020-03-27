import { Message } from 'wechaty'
import { MessageType } from 'wechaty-puppet'
import Config from '../config'
import event from '../shared/events'
import { EventTypes } from '../constants/eventTypes'

export async function onMessage(msg: Message) {
  // skip self
  if (msg.self()) {
    return
  }

  if (msg.age() > 3 * 60) {
    console.info(
      'Bot',
      'on(message) skip age("%d") > 3 * 60 seconds: "%s"',
      msg.age(),
      msg,
    )
    return
  }

  const room = msg.room()
  const from = msg.from()
  if (!from) {
    return
  }

  // console.log((room ? '[' + (await room.topic()) + ']' : '') + '<' + from.name() + '>' + ':' + msg)

  // 监控目标房间
  if (room && (await room.topic()).includes(Config.getInstance().ROOM_NAME)) {
    // const { id, owner } = room
    // 判定打卡成功
    if (msg.text().includes('打卡') || msg.type() === MessageType.Image) {
      // await room.say(`「${from.name()}」打卡成功`)
      event.emit(EventTypes.CHECK_IN, {
        wechat: from.id,
        time: new Date(),
      })
    }

    // 判定请假
    if (msg.text().includes('请假')) {
      const wechat = from.id
      const username = from.name()
      event.emit(EventTypes.ASK_FOR_LEAVE, {
        wechat,
        time: new Date(),
      })
      await room.say(`@${username} 请假成功✅`)
    }
  }
}
