import { User } from '@/entities'
import { connect } from '../database'
import { ONE_DAY } from '@/constants/time'

export default async function getNotCheckInUsers(
  start = new Date(),
  dayLen = ONE_DAY,
) {
  console.log('🌟[Notice]: 开始查找未签到的用户')
  const now = +start
  try {
    const connection = await connect()
    const users = await connection.getRepository(User).find()
    const notCheckedMap: Record<string, boolean> = {}

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
          notCheckedMap[user.wechat] = true
        }
      }
    }
    return notCheckedMap
  } catch (error) {
    console.error(`🌟[Notice]: 查找未签到用户错误`, error)
  }
}
