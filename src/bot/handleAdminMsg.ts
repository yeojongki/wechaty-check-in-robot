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
        '4. 获取历史上的今天\n' +
        '5. 查询用户信息, 格式为#用户微信名/微信号, 如5#yeojongki',
    )
  }

  if (msgText === '1') {
    console.log(`🌟[Notice]: 查看今天未签到用户 - by ${from.name()}`)
    const tomorrow = utils.getTomorrowZero(new Date())
    const { notCheckNames, askForLeaveNames } = await getNotCheckInUsers(
      tomorrow,
    )
    let toSend = ''
    if (notCheckNames.length) {
      toSend += `截止至${tomorrow.toLocaleString()}，\n还有${
        notCheckNames.length
      }位同学未打卡，@${notCheckNames.join(' @')}`
    }
    if (askForLeaveNames.length) {
      toSend += `\n${
        askForLeaveNames.length
      }位同学请假，@${askForLeaveNames.join(' @')}`
    }
    if (!notCheckNames.length && !askForLeaveNames.length) {
      toSend = '所有人都完成了打卡并且没有人请假'
    }
    from.say(toSend)
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

  if (msgText.startsWith('5#')) {
    const wechatOrName = msgText.replace('5#', '')
    console.log(
      `🌟[Notice]: 查询用户信息 - ${wechatOrName} - by ${from.name()}`,
    )
    const connection = await connect()
    const user = await connection.getRepository(User).findOne({
      where: [{ wechat: wechatOrName }, { wechatName: wechatOrName }],
    })
    if (user) {
      from.say(
        `id: ${user.id}\n` +
          `微信号: ${user.wechat}\n` +
          `微信名: ${user.wechatName}\n` +
          `上次打卡: ${
            user.signedAt ? utils.parseTime(user.signedAt) : '暂无'
          }\n` +
          `上次请假: ${
            user.leaveAt ? utils.parseTime(user.leaveAt) : '暂无'
          }\n` +
          `进群时间: ${utils.parseTime(user.enterRoomDate)}`,
      )
    } else {
      from.say('没有找到该用户')
    }
  }

  if (msgText.startsWith('room#')) {
    const content = msgText.replace('room#', '')
    const [room, text] = content.split('#')
    event.emit(EventTypes.CUSTOM_SEND_MESSAGE, 'room', from, room, text)
  }

  if (msgText.startsWith('room@')) {
    const content = msgText.replace('room@', '')
    const [room, text, users] = content.split('#')
    if (!users) {
      await from.say('没有@用户')
      return
    }
    const names = users.split('@').filter(Boolean)
    event.emit(EventTypes.CUSTOM_SEND_MESSAGE, 'room@', from, room, text, names)
  }

  if (msgText.startsWith('user#')) {
    const content = msgText.replace('user#', '')
    const [user, text] = content.split('#')
    event.emit(EventTypes.CUSTOM_SEND_MESSAGE, 'user', from, user, text)
  }
}

export default {
  checkIsAdmin,
  handleAdminMsg,
}
