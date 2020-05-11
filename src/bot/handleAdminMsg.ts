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
  if (msgText === '/menu' || msgText === '/start' || msgText === '/help') {
    from.say(
      '请发送对应数字或指令\n' +
        '1. 查看当前未签到用户\n' +
        '2. 查看三天都未签到用户\n' +
        '3. 更新群成员信息\n' +
        '4. 获取一周内请假情况\n' +
        '5. 获取历史上的今天\n' +
        '\n' +
        '✨ 修改用户打卡日期: editSign#用户微信名/微信号#日期\n' +
        '✨ 查询用户信息: find#用户微信名/微信号\n' +
        '✨ 和用户私聊: user#待发送用户名#待发送信息\n' +
        '✨ 在群聊中发送消息: room#群组名#发送到群聊中的信息\n' +
        '✨ 在群聊中发送消息并@用户: room@群组名#发送到群聊中的信息#@用户1@用户2',
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
    console.log(`🌟[Notice]: 获取一周内请假情况 - by ${from.name()}`)
    event.emit(EventTypes.CHECK_WEEK_ASK_FOR_LEAVE, from)
  }

  if (msgText === '5') {
    console.log(`🌟[Notice]: 获取历史上的今天 - by ${from.name()}`)
    const toSend = await getHistoryToday()
    from.say(toSend)
  }

  if (msgText.startsWith('find#')) {
    const wechatOrName = msgText.replace('find#', '')
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
    console.log(`🌟[Notice]: 在群聊中发送消息 - by ${from.name()}`)
    const content = msgText.replace('room#', '')
    const [room, text] = content.split('#')
    event.emit(EventTypes.CUSTOM_SEND_MESSAGE, 'room', from, room, text)
  }

  if (msgText.startsWith('room@')) {
    console.log(`🌟[Notice]: 在群聊中发送消息并@用户 - by ${from.name()}`)
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
    console.log(`🌟[Notice]: 和用户私聊 - by ${from.name()}`)
    const content = msgText.replace('user#', '')
    const [user, text] = content.split('#')
    event.emit(EventTypes.CUSTOM_SEND_MESSAGE, 'user', from, user, text)
  }

  if (msgText.startsWith('editSign#')) {
    console.log(`🌟[Notice]: 修改用户打卡日期 - by ${from.name()}`)
    const content = msgText.replace('editSign#', '')
    const [user, date] = content.split('#')
    const _date = new Date(date)
    if (_date.toString() === 'Invalid Date') {
      await from.say('非法日期')
      return
    }
    event.emit(EventTypes.EDIT_USER_SIGN_AT_DATE, from, user, _date)
  }
}

export default {
  checkIsAdmin,
  handleAdminMsg,
}
