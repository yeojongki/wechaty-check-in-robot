import { connect } from '@/database'
import { User } from '@/entities'
import { Message } from 'wechaty'
import getNotCheckInUsers from '@/shared/getNotCheckInUsers'
import utils from '@/shared/utils'
import event from '@/shared/events'
import { EventTypes } from '@/constants/eventTypes'
import getHistoryToday from '@/shared/getHistoryToday'

async function checkIsAdmin(wechat: string) {
  const connection = await connect()
  const user = await connection.getRepository(User).findOne({ wechat })
  if (!user || !user.isAdmin) {
    return false
  }
  return true
}

async function handleAdminMsg(msg: Message) {
  const msgText = msg.text()
  const from = msg.from()!
  if (msgText === '菜单' || msgText === '/start' || msgText === '/help') {
    from.say(
      '请发送对应数字\n' +
        '1. 查看当前未签到用户\n' +
        '2. 查看三天都未签到用户\n' +
        '3. 更新群成员信息\n' +
        '4. 获取历史上的今天',
    )
  }

  if (msgText === '1') {
    console.log(`🌟[Notice]: 查看今天未签到用户 - by ${from.name()}`)
    const tomorrow = utils.getTomorrowZero(new Date())
    const { notCheckMap, names } = await getNotCheckInUsers(tomorrow)
    if (names.length) {
      const length = Object.keys(notCheckMap).length
      from.say(
        `截止至${tomorrow.toLocaleString()}，还有${length}位同学未打卡，@${names.join(
          ' @',
        )}`,
      )
    } else {
      from.say(`所有人都完成了打卡`)
    }
  }

  if (msgText === '2') {
    console.log(`🌟[Notice]: 查看三天都未签到用户 - by ${from.name()}`)
    event.emit(EventTypes.CHECK_THREE_DAY_NOT_CHECK_IN, {
      from,
      useMessenger: false,
    })
  }

  if (msgText === '3') {
    console.log(`🌟[Notice]: 更新群组用户信息 - by ${from.name()}`)
    event.emit(EventTypes.UPDATE_ROOM_USER, from)
  }

  if (msgText === '4') {
    console.log(`🌟[Notice]: 获取历史上的今天 - by ${from.name()}`)
    const toSend = await getHistoryToday()
    from.say(toSend)
  }
}

export default {
  checkIsAdmin,
  handleAdminMsg,
}
