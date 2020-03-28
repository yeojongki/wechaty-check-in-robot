import fs from 'fs'
import * as path from 'path'
import Config from '../config'
const config = Config.getInstance()
const USER_INIT_FILE_NAME = `${config.ROOM_NAME}.users-init.json`

function getWhiteListMap() {
  let whiteListMap: Record<string, boolean> = {}
  whiteListMap = config.WHITE_LIST
    ? config.WHITE_LIST.reduce((p, n) => {
        p[n] = true
        return p
      }, whiteListMap)
    : {}

  return whiteListMap
}

/**
 * 判断是否初始化用户房间信息
 */
function checkUserDataIsInit(): boolean {
  return fs.existsSync(path.resolve(__dirname, '..', '..', USER_INIT_FILE_NAME))
}

/**
 * 设置已经初始化用户房间信息
 */
function setUserDataIsInit(): void {
  fs.writeFile(
    path.resolve(__dirname, '..', '..', USER_INIT_FILE_NAME),
    JSON.stringify({ init: true }),
    (err) => {
      if (err) {
        console.error('setUserDataIsInit fail', err)
      }
    },
  )
}

export default {
  getWhiteListMap,
  checkUserDataIsInit,
  setUserDataIsInit,
}
