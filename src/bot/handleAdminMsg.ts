import { connect } from '../database'
import { User } from '../entities'
import { Message } from 'wechaty'
import getNotCheckInUsers from '../shared/getNotCheckInUsers'
import utils from '../shared/utils'
import event from '../shared/events'
import { EventTypes } from '../constants/eventTypes'

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
  if (msgText === '菜单') {
    from.say(`请发送对应数字 \n1.查看当前未签到用户 \n2.更新群成员信息`)
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
    event.emit(EventTypes.UPDATE_ROOM_USER, from)
  }
}

export default {
  checkIsAdmin,
  handleAdminMsg,
}
