import { Wechaty } from 'wechaty'
import { createConnection, Connection } from 'typeorm'
import { User } from '@/entities/user.entity'
import Config from '@/config'

let connection: null | Connection = null

const config = Config.getInstance()

export function connect(): Promise<Connection> {
  return new Promise((resolve, reject) => {
    if (connection) return resolve(connection)

    createConnection({
      type: 'mysql',
      host: config.DB_HOST,
      port: Number(config.DB_PORT),
      charset: config.DB_CHARSET,
      username: config.DB_USERNAME,
      password: config.DB_PASSWORD,
      database: config.DB_NAME,
      entities: [User],
      synchronize: true,
      logging: false,
    })
      .then((_connection) => {
        connection = _connection
        resolve(_connection)
      })
      .catch((error) => {
        reject(error)
        console.log(error)
      })
  })
}

export function findUserByWechat(
  connection: Connection,
  wechat: string,
): Promise<User | null> {
  return new Promise(async (resolve) => {
    const user = await connection.getRepository(User).findOne({ wechat })
    resolve(user)
  })
}

export function checkDBRoomUserData(bot: Wechaty) {
  // const room =
}
