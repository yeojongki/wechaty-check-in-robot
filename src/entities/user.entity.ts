import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm'
import { Base } from './base.entity'

@Entity()
export class User extends Base {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({
    type: 'tinyint',
    name: 'is_whitelist',
    default: 0,
    comment: '是否在白名单中 0为否 1为是',
  })
  isWhitelist!: number

  @Column({
    type: 'tinyint',
    name: 'is_admin',
    default: 0,
    comment: '是否为管理员 0为否 1为是',
  })
  isAdmin!: number

  @Column({
    unique: true,
    comment: '微信号',
  })
  wechat!: string

  @Column({
    name: 'wechat_name',
    default: null,
    nullable: true,
    comment: '微信昵称',
  })
  wechatName!: string

  @Column({
    name: 'signed_at',
    nullable: true,
    type: 'timestamp',
    precision: 0,
    comment: '打卡时间',
  })
  signedAt?: Date

  @Column({
    name: 'leave_at',
    nullable: true,
    type: 'timestamp',
    precision: 0,
    comment: '请假时间',
  })
  leaveAt?: Date

  @Column({
    name: 'last_leave_at',
    nullable: true,
    type: 'timestamp',
    precision: 0,
    comment: '上次请假时间',
  })
  lastLeaveAt?: Date

  @Column({
    name: 'week_leave_count',
    type: 'tinyint',
    default: 0,
  })
  weekLeaveCount!: number

  @Column({
    name: 'enter_room_date',
    comment: '进入群组时间',
  })
  enterRoomDate!: Date
}
