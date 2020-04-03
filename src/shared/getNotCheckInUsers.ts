import { User } from '../entities'
import { connect } from '../database'
import { ONE_DAY } from '../constants/time'

export default async function getNotCheckInUsers(
  start = new Date(),
  dayLen = ONE_DAY,
) {
  const now = +start
  try {
    const connection = await connect()
    const users = await connection.getRepository(User).find()
    const notCheckMap: Record<string, boolean> = {}
    const names: string[] = []

    for (const user of users) {
      // 排除白名单和当天请假的
      if (user.isWhiteList || (user.leaveAt && now - +user.leaveAt <= dayLen)) {
        continue
      } else {
        // 没签到记录或者今天没签到
        if (
          (!user.checkedIn && now - +user.enterRoomDate >= dayLen) ||
          (user.checkedIn && now - +user.checkedIn >= dayLen)
        ) {
          names.push(user.wechatName)
          notCheckMap[user.wechat] = true
        }
      }
    }
    return {
      notCheckMap,
      names,
    }
  } catch (error) {
    console.error(`🌟[Notice]: 查找未签到用户错误`, error)
    return {
      notCheckMap: {},
      names: [],
    }
  }
}
