import Config from '@/config'
const config = Config.getInstance()

export default function getWhiteListMap() {
  let whiteListMap: Record<string, boolean> = {}
  whiteListMap = config.WHITE_LIST
    ? config.WHITE_LIST.reduce((p, n) => {
        p[n] = true
        return p
      }, whiteListMap)
    : {}

  return whiteListMap
}
