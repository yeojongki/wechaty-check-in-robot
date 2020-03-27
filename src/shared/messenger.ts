import axios from 'axios'
import config from '../config'

export default class Messenger {
  static send(text: string, desp?: string) {
    const { SCKEY, SC_ENABLE } = config.getInstance()
    if (!SC_ENABLE) return

    axios
      .get(`https://sc.ftqq.com/${SCKEY}.send`, {
        params: {
          text,
          desp
        }
      })
      .then(res => {
        // console.log(res)
      })
      .catch(err => {
        console.error(err)
      })
  }
}
