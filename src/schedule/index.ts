import * as schedule from 'node-schedule'
import event from '@/shared/events'
import { EventTypes } from '@/constants/eventTypes'

// *    *    *    *    *    *
// ┬    ┬    ┬    ┬    ┬    ┬
// │    │    │    │    │    │
// │    │    │    │    │    └ day of week (0 - 7) (0 or 7 is Sun)
// │    │    │    │    └───── month (1 - 12)
// │    │    │    └────────── day of month (1 - 31)
// │    │    └─────────────── hour (0 - 23)
// │    └──────────────────── minute (0 - 59)
// └───────────────────────── second (0 - 59, OPTIONAL)

export default function checkTodayCheckInSchedule() {
  schedule.scheduleJob('0 0 0 * * *', () => {
    event.emit(EventTypes.CHECK_TODAY_USER_CHECK_IN)
    event.emit(EventTypes.CHECK_THREE_DAY_NOT_CHECK_IN)
  })

  schedule.scheduleJob('0 0 9 * * *', () => {
    event.emit(EventTypes.GET_TODAY_HISTORY)
  })

  schedule.scheduleJob('0 0 0 * * 1', () => {
    event.emit(EventTypes.CHECK_WEEK_ASK_FOR_LEAVE)
  })
}
