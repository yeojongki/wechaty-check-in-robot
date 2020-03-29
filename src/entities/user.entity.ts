import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm'
import { Base } from './base.entity'

@Entity()
export class User extends Base {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({
    type: 'tinyint',
    default: 0,
    comment: '是否在白名单中 0为否 1为是',
  })
  isWhiteList!: number

  @Column({
    unique: true,
    comment: '微信号',
  })
  wechat!: string

  @Column({
    default: null,
    nullable: true,
    comment: '微信昵称',
  })
  wechatName!: string

  @Column({
    name: 'check_in',
    nullable: true,
    type: 'timestamp',
    precision: 0,
    comment: '打卡时间',
  })
  checkedIn?: Date

  @Column({
    name: 'leave_at',
    nullable: true,
    type: 'timestamp',
    precision: 0,
    comment: '请假时间',
  })
  leaveAt?: Date

  @Column({
    nullable: true,
    name: 'enter_room_date',
    comment: '进入群组时间',
  })
  enterRoomDate!: Date
}
