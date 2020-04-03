import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm'

export class Base {
  @PrimaryGeneratedColumn()
  readonly id!: number

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
  })
  readonly createdAt!: Date

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
  })
  readonly updatedAt!: Date

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamp',
    precision: 0,
    default: () => null,
  })
  readonly deletedAt?: Date
}
