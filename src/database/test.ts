import { connect } from '.'
import { User } from '@/entities'
import { MoreThan } from 'typeorm'

const Test = async () => {
  const connection = await connect()

  const usersToAt = await connection.getRepository(User).find({
    where: { weekLeaveCount: MoreThan(0) },
    order: {
      weekLeaveCount: 'DESC',
    },
  })
  const condition = usersToAt.map(i => ({ wechat: i.wechat }))

  await connection
    .createQueryBuilder()
    .update(User)
    .set({ weekLeaveCount: 0 })
    .where(condition)
    .execute()
}

Test()
