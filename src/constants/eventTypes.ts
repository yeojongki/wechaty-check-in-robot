export enum EventTypes {
  /**
   * 用户签到事件
   */
  CHECK_IN = 'CHECK_IN',

  /**
   * 用户请假事件
   */
  ASK_FOR_LEAVE = 'ASK_FOR_LEAVE',

  /**
   * 检测今天用户签到记录
   */
  CHECK_TODAY_USER_CHECK_IN = 'CHECK_TODAY_USER_CHECK_IN',

  /**
   * 机器人发布昨日成员打卡情况
   */
  DO_YESTERDAY_BOT_NOTICE = 'DO_YESTERDAY_BOT_NOTICE',

  /**
   * 检测三天内未打卡成员
   */
  CHECK_THREE_DAY_NOT_CHECK_IN = 'CHECK_THREE_DAY_NOT_CHECK_IN',

  /**
   * 检测一周内请假人员情况
   */
  CHECK_WEEK_ASK_FOR_LEAVE = 'CHECK_WEEK_ASK_FOR_LEAVE',

  /**
   * 首次进入目标房间
   */
  FIRST_IN_TARGET_ROOM = 'FIRST_IN_TARGET_ROOM',

  /**
   * 移除数据库中的成员
   */
  DB_REMOVE_USER = 'DB_REMOVE_USER',

  /**
   * 更新群组中用户信息
   */
  UPDATE_ROOM_USER = 'UPDATE_ROOM_USER',

  /**
   * 历史上的今天
   */
  GET_TODAY_HISTORY = 'GET_TODAY_HISTORY',

  /**
   * 自定义发送
   */
  CUSTOM_SEND_MESSAGE = 'CUSTOM_SEND_MESSAGE',
}
