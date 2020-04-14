import { User } from '@/entities'
import { connect } from '@/database'
import { ONE_DAY } from '@/constants/time'

export default async function getNotCheckInUsers(
  start = new Date(),
  dayLen = ONE_DAY,
) {
  const now = +start
  try {
    const connection = await connect()
    const users = await connection.getRepository(User).find()
    const notCheckMap: Record<string, boolean> = {}
    const leaveAtMap: Record<string, boolean> = {}
    const notCheckNames: string[] = []
    const askForLeaveNames: string[] = []

    for (const user of users) {
      // 排除白名单和当天请假的
      if (user.isWhiteList) {
        continue
      } else if (user.leaveAt && now - +user.leaveAt <= dayLen) {
        leaveAtMap[user.wechat] = true
        askForLeaveNames.push(user.wechatName)
      } else {
        // 没签到记录或者今天没签到
        if (
          (!user.checkedIn && now - +user.enterRoomDate >= dayLen) ||
          (user.checkedIn && now - +user.checkedIn >= dayLen)
        ) {
          notCheckNames.push(user.wechatName)
          notCheckMap[user.wechat] = true
        }
      }
    }
    return {
      leaveAtMap,
      notCheckMap,
      notCheckNames,
      askForLeaveNames,
    }
  } catch (error) {
    console.error(`🌟[Notice]: 查找未签到用户错误`, error)
    return {
      notCheckMap: {},
      notCheckNames: [],
      leaveAtMap: {},
      askForLeaveNames: [],
    }
  }
}
