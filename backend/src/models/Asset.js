import { BaseModel } from './BaseModel.js';

export class Asset extends BaseModel {
  static tableName = 'assets';
  static columns = [
    '_id',
    'projectId',
    'ownerId',
    'filename',
    'mimeType',
    'size',
    'url',
    'storageKey',
    'createdAt',
    'updatedAt',
  ];
}
