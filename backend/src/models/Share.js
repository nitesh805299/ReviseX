import { BaseModel } from './BaseModel.js';

export class Share extends BaseModel {
  static tableName = 'shares';
  static columns = [
    '_id',
    'projectId',
    'tokenHash',
    'permission',
    'passwordHash',
    'expiresAt',
    'revokedAt',
    'accessCount',
    'createdAt',
    'updatedAt',
  ];
  static defaults = {
    permission: 'read-only',
    passwordHash: null,
    expiresAt: null,
    revokedAt: null,
    accessCount: 0,
  };
}
